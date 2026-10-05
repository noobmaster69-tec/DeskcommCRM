import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { normalizePhoneBR } from "@/lib/webhooks/inbound";
import { CHAVE_DE_VARIAVEL, NOMES_RESERVADOS, TIPOS_DE_VARIAVEL } from "@/lib/variables/sistema";
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
  fonteId: string;
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

interface Existente {
  id: string;
  name: string | null;
  email: string | null;
  custom_fields: Record<string, unknown> | null;
}

export async function importarAudiencia(
  admin: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  entrada: EntradaDaImportacao,
  arquivo: { bytes: Uint8Array; tipo: string; extensao: string } | null,
): Promise<ResumoDaImportacao> {
  const org = ctx.organizationId;

  // 1. variáveis novas (as que já existem ficam como estão)
  if (entrada.novas_variaveis.length > 0) {
    await admin
      .from("contact_custom_fields")
      .upsert(
        entrada.novas_variaveis.map((v, i) => ({ ...v, organization_id: org, position: 1000 + i })),
        { onConflict: "organization_id,key", ignoreDuplicates: true },
      );
  }

  // 2. arquivo original, para auditoria
  let caminho: string | null = null;
  if (arquivo) {
    caminho = `${org}/${randomUUID()}.${arquivo.extensao}`;
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
      .select("id, name, email, custom_fields, phone_number")
      .eq("organization_id", org)
      .is("is_merged_into", null)
      .in("phone_number", variantes.slice(i, i + LOTE));
    for (const c of (data ?? []) as Array<Existente & { phone_number: string }>) {
      for (const v of phoneLookupVariants(c.phone_number)) porVariante.set(v, c);
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
  await emParalelo(linhas, PARALELO, async (l) => {
    const existente = phoneLookupVariants(l.telefone).map((v) => porVariante.get(v)).find(Boolean);
    if (existente) {
      if (politica === "pular") {
        pulados++;
        return;
      }
      if (politica === "atualizar") {
        const patch: Record<string, unknown> = {
          custom_fields: { ...(existente.custom_fields ?? {}), ...l.campos },
        };
        if (l.nome) patch.name = l.nome;
        if (l.email && !existente.email) patch.email = l.email;
        await admin.from("contacts").update(patch).eq("organization_id", org).eq("id", existente.id);
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
        source: "campanha_importacao",
        source_metadata: { importacao: "campanha", arquivo: entrada.nome_do_arquivo },
        custom_fields: l.campos,
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
      if (error?.code === "23505") pulados++;
      else invalidos++;
      return;
    }
    criados++;
    const id = (novo as { id: string }).id;
    void admin
      .rpc("emit_event", {
        p_event_type: "contact.created",
        p_entity_kind: "contact",
        p_entity_id: id,
        p_payload: { source: "campanha_importacao", has_email: !!l.email, has_phone: true, has_cpf: false },
        p_metadata: { actor_type: "user" },
        p_organization_id: org,
      })
      .then(({ error: e }) => {
        if (e) console.error("[campanhas.importar] emit_event failed", e.message);
      });
    vistos.add(id);
    contatos.push(id);
    titulos.set(id, l.nome ?? l.empresa ?? "");
    for (const v of phoneLookupVariants(l.telefone)) porVariante.set(v, { id, name: l.nome, email: l.email, custom_fields: l.campos });
  });

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

  // 6. a lista
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

  return {
    fonteId: (fonte as { id: string }).id,
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
