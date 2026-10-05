/**
 * Adapter fino que pluga a atribuição de resposta no dispatcher do `event_log`
 * — mesmo padrão de `lib/followup/reactivity.handler.ts`.
 *
 * Consome o evento canônico `message.received`, que é emitido pelo TRIGGER de
 * `messages` (e não pelo ingest de canal): assim vale para qualquer caminho de
 * entrada, hoje e amanhã, sem a campanha conhecer provider nenhum.
 *
 * Nunca lança: falha aqui vira `error` para o dispatcher, que aplica o backoff
 * dele. A resposta do cliente já está no inbox de qualquer jeito — o que se
 * perde numa falha é a métrica, não a conversa.
 */
import { aplicarRespostaNaCampanha } from "@/lib/campanhas/resposta";
import { garantirCardNaEtapa } from "@/lib/campanhas/card-da-campanha";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

export const CAMPANHA_RESPOSTA_HANDLER_KEY = "campanha-resposta.v1";

export const campanhaRespostaHandler: EventHandler = {
  key: CAMPANHA_RESPOSTA_HANDLER_KEY,
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return {
        consumer_key: CAMPANHA_RESPOSTA_HANDLER_KEY,
        status: "skipped",
        detail: "evento sem contact_id",
      };
    }

    try {
      const admin = createAdminClient();
      const resumo = await aplicarRespostaNaCampanha(admin, {
        organizationId: row.organization_id,
        contactId,
        // A hora da MENSAGEM, não a do consumo: o drain pode rodar minutos
        // depois, e usar `now()` faria uma resposta na borda da janela de 72h
        // cair fora por causa do atraso da fila.
        recebidoEm: momentoDoEvento(row),
      });
      // Item 3 — "Quem responde": a etapa de resposta da campanha (pipeline_id /
      // stage_id, 0378). Além de o card NASCER ali (nascimento do lead), o card
      // que já existia — o de "Quem recebe", por exemplo — é MOVIDO para lá.
      if (resumo.campanhaId) await moverParaEtapaDeResposta(admin, row.organization_id, resumo.campanhaId, contactId);
      return {
        consumer_key: CAMPANHA_RESPOSTA_HANDLER_KEY,
        // `skipped` quando não havia campanha a fechar — que é o caso comum de
        // toda instalação que não está prospectando. Marcar `ok` ali encheria o
        // log de sucesso sobre nada feito.
        status: resumo.atribuiu || resumo.optOut > 0 ? "ok" : "skipped",
        detail: `atribuiu=${resumo.atribuiu} opt_out=${resumo.optOut}`,
      };
    } catch (err) {
      return {
        consumer_key: CAMPANHA_RESPOSTA_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/** Quando a mensagem chegou, com o `created_at` do evento como piso. */
async function moverParaEtapaDeResposta(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  campanhaId: string,
  contactId: string,
): Promise<void> {
  const { data } = await admin
    .from("campaigns")
    .select("pipeline_id, stage_id")
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .maybeSingle();
  const c = data as { pipeline_id: string | null; stage_id: string | null } | null;
  if (!c?.pipeline_id || !c.stage_id) return;
  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  await garantirCardNaEtapa(admin, {
    organizationId,
    contactId,
    pipelineId: c.pipeline_id,
    stageId: c.stage_id,
    campanhaId,
    titulo: nomeDoContato((contato ?? { name: null, display_name: null }) as { name: string | null; display_name: string | null }) || "Contato da campanha",
  });
}

function momentoDoEvento(row: { created_at?: string | Date | null }): Date {
  if (row.created_at) {
    const d = new Date(row.created_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
