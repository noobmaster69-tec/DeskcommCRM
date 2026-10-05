import type { SupabaseClient } from "@supabase/supabase-js";
import { flowSettingsSchema } from "@/lib/followup/graph-schema";
import { decidirPreGoLiveDoCanalViaSupabase } from "@/lib/ai/elegibilidade/consulta-pre-go-live";
import { createAdminClient } from "@/lib/supabase/admin";
import { inscreverNoFluxo } from "./disparar";
import { escolherPalavraChave, lerDisparos, respostaPadraoRecente, type Disparos } from "./disparos";

/**
 * ENTRADA AUTOMÁTICA dos fluxos (fork jhoow, Fase C): a mensagem que chega
 * começa um fluxo publicado, sem ninguém clicar em "Disparar".
 *
 * Duas portas, configuradas no Início do fluxo (`graph.settings` da versão
 * PUBLICADA — mexer no rascunho não muda o que está no ar):
 *  - palavra-gatilho (`gatilhos`): a mensagem contém a palavra, ou É a palavra
 *    (`gatilho_exato`);
 *  - primeiro contato (`entrada_primeiro_contato`): a primeira mensagem que o
 *    contato manda para a empresa.
 *
 * Quem chama é o drain, depois de conferir que o contato NÃO está em fluxo: um
 * contato no meio de um fluxo não é sequestrado por outro gatilho.
 */
export interface FluxoComEntrada {
  id: string;
  nome: string;
  gatilhos: string[];
  exato: boolean;
  primeiroContato: boolean;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[\s.,!?¡¿;:"'()*_~-]+|[\s.,!?¡¿;:"'()*_~-]+$/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Qual fluxo a mensagem liga. Palavra-gatilho primeiro (ganha quem tiver MAIS
 * palavras presentes; empate = o primeiro na ordem recebida), depois primeiro
 * contato. Puro.
 */
export function escolherFluxoDeEntrada(
  fluxos: readonly FluxoComEntrada[],
  texto: string,
  primeiraMensagem: boolean,
): { fluxo: FluxoComEntrada; porque: "palavra" | "primeiro_contato" } | null {
  const alvo = normalizar(texto);
  let melhor: FluxoComEntrada | null = null;
  let melhorHits = 0;
  if (alvo !== "") {
    for (const f of fluxos) {
      const hits = f.gatilhos.filter((g) => {
        const ng = normalizar(g);
        if (ng === "") return false;
        return f.exato ? alvo === ng : ` ${alvo} `.includes(` ${ng} `) || (ng.includes(" ") && alvo.includes(ng));
      }).length;
      if (hits > melhorHits) {
        melhor = f;
        melhorHits = hits;
      }
    }
  }
  if (melhor) return { fluxo: melhor, porque: "palavra" };
  if (primeiraMensagem) {
    const primeiro = fluxos.find((f) => f.primeiroContato);
    if (primeiro) return { fluxo: primeiro, porque: "primeiro_contato" };
  }
  return null;
}

/** Os fluxos ATIVOS da organização com alguma porta de entrada ligada. */
export async function fluxosComEntrada(admin: SupabaseClient, org: string): Promise<FluxoComEntrada[]> {
  const { data: ponteiros, error } = await admin
    .from("followup_flow_pointers")
    .select("id, name, active_version_id")
    .eq("organization_id", org)
    .eq("surface", "fluxo")
    .eq("status", "active")
    .not("active_version_id", "is", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!ponteiros?.length) return [];
  const { data: versoes, error: vErr } = await admin
    .from("followup_flow_versions")
    .select("id, graph")
    .eq("organization_id", org)
    .in(
      "id",
      ponteiros.map((p) => p.active_version_id as string),
    );
  if (vErr) throw new Error(vErr.message);
  const grafoDa = new Map((versoes ?? []).map((v) => [v.id as string, v.graph as { settings?: unknown } | null]));
  const fluxos: FluxoComEntrada[] = [];
  for (const p of ponteiros) {
    const s = flowSettingsSchema.safeParse(grafoDa.get(p.active_version_id as string)?.settings ?? {});
    if (!s.success) continue;
    const gatilhos = s.data.gatilhos ?? [];
    const primeiroContato = s.data.entrada_primeiro_contato === true;
    if (gatilhos.length === 0 && !primeiroContato) continue;
    fluxos.push({ id: p.id as string, nome: p.name as string, gatilhos, exato: s.data.gatilho_exato === true, primeiroContato });
  }
  return fluxos;
}

export type PorqueDaEntrada =
  | "disparo_palavra_chave"
  | "palavra"
  | "boas_vindas"
  | "primeiro_contato"
  | "resposta_padrao"
  | "conversa_finalizada"
  | "atendimento_finalizado";

export type ResultadoDaEntrada =
  | { iniciado: true; fluxoId: string; enrollmentId: string; porque: PorqueDaEntrada }
  | { iniciado: false; motivo: string };

/**
 * A ordem das portas (item 12 — Disparos): a configuração CENTRAL vem antes da
 * de cada fluxo, e o específico antes do genérico.
 *  1. palavra-chave da tela Disparos;
 *  2. palavra-gatilho do Início de um fluxo;
 *  3. boas-vindas (Disparos) — só na primeira mensagem do contato;
 *  4. primeiro contato do Início de um fluxo;
 *  5. resposta padrão (Disparos) — nada mais casou. O "uma vez a cada N horas"
 *     é conferido por quem chama (precisa do banco).
 * Puro.
 */
export function escolherEntrada(
  disparos: Disparos,
  fluxos: readonly FluxoComEntrada[],
  texto: string,
  primeiraMensagem: boolean,
): { fluxoId: string; porque: PorqueDaEntrada } | null {
  const chave = escolherPalavraChave(disparos.palavras, texto);
  if (chave?.fluxo_id) return { fluxoId: chave.fluxo_id, porque: "disparo_palavra_chave" };
  const doFluxo = escolherFluxoDeEntrada(fluxos, texto, false);
  if (doFluxo) return { fluxoId: doFluxo.fluxo.id, porque: "palavra" };
  if (primeiraMensagem && disparos.globais.welcome_fluxo_id)
    return { fluxoId: disparos.globais.welcome_fluxo_id, porque: "boas_vindas" };
  const primeiro = primeiraMensagem ? escolherFluxoDeEntrada(fluxos, "", true) : null;
  if (primeiro) return { fluxoId: primeiro.fluxo.id, porque: "primeiro_contato" };
  if (disparos.globais.default_response_fluxo_id)
    return { fluxoId: disparos.globais.default_response_fluxo_id, porque: "resposta_padrao" };
  return null;
}

/** Disparos tem alguma porta que a MENSAGEM que chega pode abrir? */
function disparosComEntrada(d: Disparos): boolean {
  return (
    d.palavras.some((p) => p.active && p.fluxo_id) ||
    Boolean(d.globais.welcome_fluxo_id) ||
    Boolean(d.globais.default_response_fluxo_id)
  );
}

const ORIGEM_DO_PORQUE: Record<PorqueDaEntrada, string> = {
  disparo_palavra_chave: "disparo_palavra_chave",
  palavra: "palavra_gatilho",
  boas_vindas: "boas_vindas",
  primeiro_contato: "primeiro_contato",
  resposta_padrao: "resposta_padrao",
  conversa_finalizada: "conversa_finalizada",
  atendimento_finalizado: "atendimento_finalizado",
};

/**
 * Lê a mensagem que chegou, escolhe o fluxo e inscreve o contato. Nunca começa
 * fluxo para número que o modo de teste do canal segura — o primeiro envio
 * falharia, e o contato ficaria sem fluxo E sem agente.
 */
export async function dispararFluxoPorEntrada(
  admin: SupabaseClient,
  input: { organizationId: string; contactId: string; conversationId: string; channelSessionId: string; inboundMessageId: string },
): Promise<ResultadoDaEntrada> {
  const org = input.organizationId;
  const [fluxos, disparos] = await Promise.all([fluxosComEntrada(admin, org), lerDisparos(admin, org)]);
  if (fluxos.length === 0 && !disparosComEntrada(disparos)) return { iniciado: false, motivo: "sem_fluxo_com_entrada" };

  // Conversa com uma PESSOA, ou com o automático pausado nela, não é tomada por
  // gatilho: o cliente que diz "preço" no meio do atendimento humano não pode
  // receber um fluxo por cima de quem está atendendo.
  const { data: conversa } = await admin
    .from("conversations")
    .select("assigned_to_user_id, bot_silenced_until")
    .eq("organization_id", org)
    .eq("id", input.conversationId)
    .maybeSingle();
  if (conversa?.assigned_to_user_id) return { iniciado: false, motivo: "conversa_com_atendente" };
  const calado = conversa?.bot_silenced_until as string | null | undefined;
  if (calado && new Date(calado).getTime() > Date.now()) return { iniciado: false, motivo: "automatico_pausado" };

  const [{ data: msg }, { count: entradas }, { data: contato }] = await Promise.all([
    admin
      .from("messages")
      .select("body, media_derived_text")
      .eq("organization_id", org)
      .eq("id", input.inboundMessageId)
      .maybeSingle(),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("direction", "inbound")
      .eq("contact_id", input.contactId),
    admin.from("contacts").select("phone_number").eq("organization_id", org).eq("id", input.contactId).maybeSingle(),
  ]);
  const texto = ((msg?.body as string | null) ?? (msg?.media_derived_text as string | null) ?? "").trim();
  const escolha = escolherEntrada(disparos, fluxos, texto, (entradas ?? 0) <= 1);
  if (!escolha) return { iniciado: false, motivo: "nenhum_gatilho" };
  if (
    escolha.porque === "resposta_padrao" &&
    (await respostaPadraoRecente(admin, org, input.contactId, escolha.fluxoId, disparos.globais.default_response_hours))
  )
    return { iniciado: false, motivo: "resposta_padrao_recente" };

  const acesso = await decidirPreGoLiveDoCanalViaSupabase(admin, {
    organizationId: org,
    channelSessionId: input.channelSessionId,
    contactPhoneNumber: (contato?.phone_number as string | null) ?? "",
  });
  if (!acesso.permite) return { iniciado: false, motivo: "canal_em_modo_de_teste" };

  const r = await inscreverNoFluxo(admin, {
    organizationId: org,
    fluxoId: escolha.fluxoId,
    contactId: input.contactId,
    conversationId: input.conversationId,
    origem: { origem: ORIGEM_DO_PORQUE[escolha.porque], mensagem_id: input.inboundMessageId },
  });
  if (!r.ok) return { iniciado: false, motivo: r.codigo };
  return { iniciado: true, fluxoId: escolha.fluxoId, enrollmentId: r.enrollmentId, porque: escolha.porque };
}

/**
 * Gatilhos de FIM da tela Disparos (item 12): a conversa foi fechada. Fechada
 * com um atendente humano é "atendimento finalizado"; sem, "conversa
 * finalizada". Cada um só dispara se estiver configurado — nunca cai no outro.
 * Nunca lança: fechar a conversa não pode falhar por causa de um fluxo.
 */
export async function dispararFluxoNoFim(
  admin: SupabaseClient,
  input: { organizationId: string; contactId: string; conversationId: string; comAtendente: boolean },
): Promise<ResultadoDaEntrada> {
  try {
    const { globais } = await lerDisparos(admin, input.organizationId);
    const porque: PorqueDaEntrada = input.comAtendente ? "atendimento_finalizado" : "conversa_finalizada";
    const fluxoId = input.comAtendente ? globais.attendance_closed_fluxo_id : globais.conversation_closed_fluxo_id;
    if (!fluxoId) return { iniciado: false, motivo: "sem_gatilho_de_fim" };
    const r = await inscreverNoFluxo(admin, {
      organizationId: input.organizationId,
      fluxoId,
      contactId: input.contactId,
      conversationId: input.conversationId,
      origem: { origem: ORIGEM_DO_PORQUE[porque] },
    });
    if (!r.ok) return { iniciado: false, motivo: r.codigo };
    return { iniciado: true, fluxoId, enrollmentId: r.enrollmentId, porque };
  } catch (e) {
    return { iniciado: false, motivo: e instanceof Error ? e.message.slice(0, 200) : "erro" };
  }
}

/**
 * O gancho das rotas que fecham conversa: dispara o gatilho de fim FORA do
 * caminho da resposta e engole qualquer erro — inclusive o de criar o client.
 * Fechar a conversa nunca espera nem falha por causa de um fluxo.
 */
export function aoFecharConversa(input: {
  organizationId: string;
  contactId: string;
  conversationId: string;
  comAtendente: boolean;
}): void {
  void (async () => {
    try {
      await dispararFluxoNoFim(createAdminClient(), input);
    } catch {
      // sem fluxo de fim não é erro de quem fechou
    }
  })();
}
