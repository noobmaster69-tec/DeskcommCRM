import type { SupabaseClient } from "@supabase/supabase-js";
import { flowSettingsSchema } from "@/lib/followup/graph-schema";
import { decidirPreGoLiveDoCanalViaSupabase } from "@/lib/ai/elegibilidade/consulta-pre-go-live";
import { inscreverNoFluxo } from "./disparar";

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

export type ResultadoDaEntrada =
  | { iniciado: true; fluxoId: string; enrollmentId: string; porque: "palavra" | "primeiro_contato" }
  | { iniciado: false; motivo: string };

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
  const fluxos = await fluxosComEntrada(admin, org);
  if (fluxos.length === 0) return { iniciado: false, motivo: "sem_fluxo_com_entrada" };

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
  const escolha = escolherFluxoDeEntrada(fluxos, texto, (entradas ?? 0) <= 1);
  if (!escolha) return { iniciado: false, motivo: "nenhum_gatilho" };

  const acesso = await decidirPreGoLiveDoCanalViaSupabase(admin, {
    organizationId: org,
    channelSessionId: input.channelSessionId,
    contactPhoneNumber: (contato?.phone_number as string | null) ?? "",
  });
  if (!acesso.permite) return { iniciado: false, motivo: "canal_em_modo_de_teste" };

  const r = await inscreverNoFluxo(admin, {
    organizationId: org,
    fluxoId: escolha.fluxo.id,
    contactId: input.contactId,
    conversationId: input.conversationId,
    origem: { origem: escolha.porque === "palavra" ? "palavra_gatilho" : "primeiro_contato", mensagem_id: input.inboundMessageId },
  });
  if (!r.ok) return { iniciado: false, motivo: r.codigo };
  return { iniciado: true, fluxoId: escolha.fluxo.id, enrollmentId: r.enrollmentId, porque: escolha.porque };
}
