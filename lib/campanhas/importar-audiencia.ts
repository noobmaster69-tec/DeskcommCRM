import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { normalizePhoneBR } from "@/lib/webhooks/inbound";
import { CHAVE_DE_VARIAVEL, NOMES_RESERVADOS, TIPOS_DE_VARIAVEL } from "@/lib/variables/sistema";
import { campoDoCatalogo, chavesAntigasDe } from "@/lib/variables/campos-do-contato";
import { garantirCardNaEtapa } from "./card-da-campanha";
import { MAX_LINHAS_IMPORTADAS, POLITICAS_DE_DUPLICATA, type PoliticaDeDuplicata } from "./importacao";

/**
 * IMPORTAR LISTA para a campanha (fork jhoow, Campanhas › item 1) — o lado do
 * SERVIDOR. A planilha já chega lida e mapeada pela tela; aqui:
 *  1. cria as variáveis novas que o operador pediu (Configurações › Variáveis);
 *  2. guarda o arquivo original no bucket privado (auditoria);
 *  3. acha cada telefone no CRM (com e sem o nono dígito) e aplica a política
 *     de duplicata: PULAR (fica fora da lista), ATUALIZAR (nome, e-mail vazio
 *     e variáveis) ou MANTER (entra como está);
 *  4. cria o contato que não existe — SEMPRE: o destinatário de campanha é um
 *     contato (opt-out, LGPD e a conversa da resposta dependem dele);
 *  5. opcionalmente, o card no funil escolhido;
 *  6. grava a lista (`campaign_audience_sources`) — é ela a audiência.
 *
 * Linha a linha, como o import de contatos: um insert em lote seria
 * tudo-ou-nada diante dos índices únicos de telefone.
 */

const linhaSchema = z.strictObject({
  linha: z.number().int().min(1),
  nome: z.string().max(200).nullable(),
  empresa: z.string().max(200).nullable(),
  telefone: z.string().max(40).nullable(),
  email: z.string().max(254).nullable(),
  /** `contacts.locale` (BCP 47) da coluna idioma_contato. */
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z0-9]{2,3})?$/).nullable().optional(),
  campos: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().max(1000)),
});

export const importacaoSchema = z.strictObject({
  linhas: z.array(linhaSchema).min(1).max(MAX_LINHAS_IMPORTADAS),
  politica: z.enum(POLITICAS_DE_DUPLICATA),
  criar_cards: z
    .strictObject({ pipeline_id: z.string().uuid(), stage_id: z.string().uuid().nullable() })
    .nullable()
    .default(null),
  novas_variaveis: z
    .array(
      z.strictObject({
        key: z.string().regex(CHAVE_DE_VARIAVEL).refine((k) => !NOMES_RESERVADOS.has(k)),
        label: z.string().trim().min(1).max(80),
        type: z.enum(TIPOS_DE_VARIAVEL).default("texto"),
      }),
    )
    .max(30)
    .default([]),
  mapeamento: z.record(z.string(), z.string()).default({}),
  nome_do_arquivo: z.string().max(200).nullable().default(null),
});
export type EntradaDaImportacao = z.infer<typeof importacaoSchema>;

export interface ResumoDaImportacao {
  /** A lista gravada (modo campanha); `null` no import de Contatos. */
  fonteId: string | null;
  total: number;
  criados: number;
  atualizados: number;
  mantidos: number;
  pulados: number;
  invalidos: number;
  cards: number;
}

const BUCKET = "campaign-audiences";
const LOTE = 150;
const PARALELO = 8;

async function emParalelo<T>(itens: readonly T[], n: number, fazer: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (i < itens.length) await fazer(itens[i++]!);
    }),
  );
}

/** Desfaz o que a importação já gravou quando uma linha falha (tudo ou nada). */
type Desfazer =
  | { tipo: "criado"; id: string }
  | { tipo: "atualizado"; id: string; antes: Record<string, unknown> };

/** Uma importação que NÃO gravou nada: o motivo e a linha que derrubou. */
export class ImportacaoDesfeita extends Error {
  constructor(
    public readonly linha: number,
    public readonly motivo: string,
  ) {
    super(`Nada foi importado: a linha ${linha} falhou (${motivo}).`);
  }
}

/** Valores com o TIPO do catálogo: "true" → true, "237" → 237 (a ficha e as condições leem tipado). */
export function tiparCampos(campos: Record<string, string>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    const tipo = campoDoCatalogo(k)?.tipo;
    if (tipo === "booleano") saida[k] = /^(true|sim|s|1|yes|x)$/i.test(v.trim());
    else if (tipo === "numero") {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      saida[k] = Number.isFinite(n) ? n : v;
    } else saida[k] = v;
  }
  return saida;
}

interface Existente {
  id: string;
  name: string | null;
  email: string | null;
  locale?: string | null;
  custom_fields: Record<string, unknown> | null;
  /** `source_metadata.nome_manual` — nome digitado na ficha. */
  nomeManual?: boolean;
}

export async function importarAudiencia(
  admin: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  entrada: EntradaDaImportacao,
  arquivo: { bytes: Uint8Array; tipo: string; extensao: string } | null,
  opcoes: { gravarLista?: boolean; podeCriarVariaveis?: boolean; origem?: string } = {},
): Promise<ResumoDaImportacao> {
  const org = ctx.organizationId;
  const gravarLista = opcoes.gravarLista ?? true;

  // 1. variáveis novas (as que já existem ficam como estão). Campo do catálogo
  // não vira definição: ele já existe para todo mundo. Quem não pode criar
  // variáveis (agent) importa os VALORES mesmo assim — a ficha os mostra em
  // "Outros campos".
  const novas = entrada.novas_variaveis.filter((v) => !campoDoCatalogo(v.key));
  if (novas.length > 0 && (opcoes.podeCriarVariaveis ?? true)) {
    await admin
      .from("contact_custom_fields")
      .upsert(
        novas.map((v, i) => ({ ...v, organization_id: org, position: 1000 + i })),
        { onConflict: "organization_id,key", ignoreDuplicates: true },
      );
  }

  // 2. arquivo original, para auditoria
  let caminho: string | null = null;
  if (arquivo) {
    caminho = `${org}/${gravarLista ? "" : "contatos/"}${randomUUID()}.${arquivo.extensao}`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(caminho, arquivo.bytes, { contentType: arquivo.tipo || "application/octet-stream", upsert: false });
    if (error) caminho = null;
  }

  // 3. telefones normalizados pela régua do servidor
  let invalidos = 0;
  const linhas = entrada.linhas.flatMap((l) => {
    const tel = l.telefone ? normalizePhoneBR(l.telefone) : null;
    if (!tel) {
      invalidos++;
      return [];
    }
    return [{ ...l, telefone: tel }];
  });

  const porVariante = new Map<string, Existente>();
  const variantes = [...new Set(linhas.flatMap((l) => phoneLookupVariants(l.telefone)))];
  for (let i = 0; i < variantes.length; i += LOTE) {
    const { data } = await admin
      .from("contacts")
      .select("id, name, email, locale, custom_fields, phone_number, source_metadata")
      .eq("organization_id", org)
      .is("is_merged_into", null)
      .in("phone_number", variantes.slice(i, i + LOTE));
    for (const c of (data ?? []) as Array<Existente & { phone_number: string; source_metadata?: Record<string, unknown> | null }>) {
      const e = { ...c, nomeManual: c.source_metadata?.nome_manual === true };
      for (const v of phoneLookupVariants(c.phone_number)) porVariante.set(v, e);
    }
  }

  const contatos: string[] = [];
  const vistos = new Set<string>();
  const titulos = new Map<string, string>();
  let criados = 0;
  let atualizados = 0;
  let mantidos = 0;
  let pulados = 0;

  const politica: PoliticaDeDuplicata = entrada.politica;
  // TUDO OU NADA (fork jhoow): cada gravação deixa como se desfaz; a primeira
  // falha inesperada para as outras linhas e desfaz o que já foi gravado.
  const desfazer: Desfazer[] = [];
  const criadosParaEvento: Array<{ id: string; email: boolean }> = [];
  let falha: { linha: number; motivo: string } | null = null;
  await emParalelo(linhas, PARALELO, async (l) => {
    if (falha) return;
    const camposTipados = tiparCampos(l.campos);
    const existente = phoneLookupVariants(l.telefone).map((v) => porVariante.get(v)).find(Boolean);
    if (existente) {
      if (politica === "pular") {
        pulados++;
        return;
      }
      if (politica === "atualizar") {
        // Célula vazia não apaga nada (`lerLinhas` só traz o que tem valor), e o
        // nome editado à mão na ficha não é trocado pelo da planilha.
        const campos = { ...(existente.custom_fields ?? {}) };
        for (const [k, v] of Object.entries(camposTipados)) {
          campos[k] = v;
          for (const antiga of chavesAntigasDe(k)) delete campos[antiga];
        }
        const patch: Record<string, unknown> = { custom_fields: campos };
        if (l.nome && !(existente.nomeManual && existente.name)) patch.name = l.nome;
        if (l.email && !existente.email) patch.email = l.email;
        if (l.locale) patch.locale = l.locale;
        const { error: erroUp } = await admin.from("contacts").update(patch).eq("organization_id", org).eq("id", existente.id);
        if (erroUp) {
          falha = { linha: l.linha, motivo: erroUp.message };
          return;
        }
        desfazer.push({
          tipo: "atualizado",
          id: existente.id,
          antes: { custom_fields: existente.custom_fields ?? {}, name: existente.name, email: existente.email, locale: existente.locale ?? null },
        });
        atualizados++;
      } else mantidos++;
      if (!vistos.has(existente.id)) {
        vistos.add(existente.id);
        contatos.push(existente.id);
        titulos.set(existente.id, l.nome ?? l.empresa ?? existente.name ?? "");
      }
      return;
    }
    const { data: novo, error } = await admin
      .from("contacts")
      .insert({
        organization_id: org,
        created_by_user_id: ctx.userId,
        name: l.nome,
        display_name: l.nome ?? l.empresa,
        phone_number: l.telefone,
        email: l.email,
        ...(l.locale ? { locale: l.locale } : {}),
        source: opcoes.origem ?? "campanha_importacao",
        source_metadata: { importacao: gravarLista ? "campanha" : "contatos", arquivo: entrada.nome_do_arquivo },
        custom_fields: camposTipados,
        tags: [],
      })
      .select("id")
      .single();
    if (error || !novo) {
      // Corrida com os índices únicos: outro processo criou o telefone agora.
      if (error?.code === "23505" && politica !== "pular") {
        const { data: achado } = await admin
          .from("contacts")
          .select("id")
          .eq("organization_id", org)
          .is("is_merged_into", null)
          .in("phone_number", phoneLookupVariants(l.telefone))
          .limit(1)
          .maybeSingle();
        const idAchado = (achado as { id: string } | null)?.id;
        if (idAchado && !vistos.has(idAchado)) {
          vistos.add(idAchado);
          contatos.push(idAchado);
          titulos.set(idAchado, l.nome ?? l.empresa ?? "");
          mantidos++;
          return;
        }
      }
      if (error?.code === "23505") {
        pulados++;
        return;
      }
      falha = { linha: l.linha, motivo: error?.message ?? "insert sem linha" };
      return;
    }
    criados++;
    const id = (novo as { id: string }).id;
    desfazer.push({ tipo: "criado", id });
    criadosParaEvento.push({ id, email: !!l.email });
    vistos.add(id);
    contatos.push(id);
    titulos.set(id, l.nome ?? l.empresa ?? "");
    for (const v of phoneLookupVariants(l.telefone)) porVariante.set(v, { id, name: l.nome, email: l.email, custom_fields: camposTipados });
  });

  // Uma linha falhou: desfaz TUDO (apaga os criados, devolve os atualizados) e
  // avisa qual linha derrubou. O relatório das inválidas a tela já mostrou.
  if (falha) {
    const f = falha as { linha: number; motivo: string };
    for (const d of desfazer.reverse()) {
      if (d.tipo === "criado") await admin.from("contacts").delete().eq("organization_id", org).eq("id", d.id);
      else await admin.from("contacts").update(d.antes).eq("organization_id", org).eq("id", d.id);
    }
    if (caminho) await admin.storage.from(BUCKET).remove([caminho]).catch(() => undefined);
    throw new ImportacaoDesfeita(f.linha, f.motivo);
  }
  for (const c of criadosParaEvento) {
    void admin
      .rpc("emit_event", {
        p_event_type: "contact.created",
        p_entity_kind: "contact",
        p_entity_id: c.id,
        p_payload: { source: opcoes.origem ?? "campanha_importacao", has_email: c.email, has_phone: true, has_cpf: false },
        p_metadata: { actor_type: "user" },
        p_organization_id: org,
      })
      .then(({ error: e }) => {
        if (e) console.error("[campanhas.importar] emit_event failed", e.message);
      });
  }

  // 5. cards (opcional)
  let cards = 0;
  if (entrada.criar_cards) {
    let etapa = entrada.criar_cards.stage_id;
    if (!etapa) {
      const { data } = await admin
        .from("crm_stages")
        .select("id")
        .eq("organization_id", org)
        .eq("pipeline_id", entrada.criar_cards.pipeline_id)
        .eq("is_archived", false)
        .eq("is_won", false)
        .eq("is_lost", false)
        .order("is_entry", { ascending: false })
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      etapa = (data as { id: string } | null)?.id ?? null;
    }
    if (etapa) {
      await emParalelo(contatos, 4, async (id) => {
        const r = await garantirCardNaEtapa(admin, {
          organizationId: org,
          contactId: id,
          pipelineId: entrada.criar_cards!.pipeline_id,
          stageId: etapa!,
          campanhaId: "importacao",
          titulo: titulos.get(id) || "Contato importado",
        });
        if (r === "criado" || r === "movido") cards++;
      });
    }
  }

  // 6. a lista (só no modo campanha) — é ela a audiência
  let fonteId: string | null = null;
  if (gravarLista) {
    const { data: fonte, error } = await admin
      .from("campaign_audience_sources")
      .insert({
        organization_id: org,
        mode: "import",
        contact_ids: contatos,
        snapshot_file_path: caminho,
        estimated_recipients: contatos.length,
        created_by: ctx.userId,
        config: {
          arquivo: entrada.nome_do_arquivo,
          mapeamento: entrada.mapeamento,
          politica,
          criar_cards: entrada.criar_cards,
          contagens: { total: entrada.linhas.length, criados, atualizados, mantidos, pulados, invalidos, cards },
        },
      })
      .select("id")
      .single();
    if (error || !fonte) throw new Error(`importação: lista — ${error?.message ?? "sem linha"}`);
    fonteId = (fonte as { id: string }).id;
  }

  return {
    fonteId,
    total: entrada.linhas.length,
    criados,
    atualizados,
    mantidos,
    pulados,
    invalidos,
    cards,
  };
}

/**
 * Amarra a lista importada à campanha que a usa ("Audiência da campanha X").
 * Só a lista ainda solta (ou já desta campanha) — a de outra campanha fica
 * onde está. Falha aqui não derruba o salvar: o vínculo é auditoria, a
 * audiência anda pelo `audience_filter.lista_importada`.
 */
export async function vincularListaACampanha(
  supabase: SupabaseClient,
  ctx: { organizationId: string; campanhaId: string },
  filtro: { lista_importada?: string | null } | null | undefined,
): Promise<void> {
  const lista = filtro?.lista_importada;
  if (!lista) return;
  await supabase
    .from("campaign_audience_sources")
    .update({ campaign_id: ctx.campanhaId })
    .eq("organization_id", ctx.organizationId)
    .eq("id", lista)
    .is("campaign_id", null);
}
