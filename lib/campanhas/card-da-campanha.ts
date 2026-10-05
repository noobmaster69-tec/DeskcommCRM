import type { SupabaseClient } from "@supabase/supabase-js";

import { createLeadHandler, moveLeadHandler } from "@/app/api/v1/leads/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { createLeadSchema } from "@/lib/schemas/leads";
import { logger } from "@/lib/logger";

/**
 * O CARD da campanha no funil (fork jhoow, Campanhas › item 3): garante que o
 * contato tem um negócio ABERTO nesta etapa — move o que já existe no funil, ou
 * cria um. Pelos MESMOS handlers da tela (linha do tempo, histórico de etapa e
 * guardas de funil valem). Nunca lança: o card é consequência do envio/da
 * resposta, e falhar aqui não pode desfazer nenhum dos dois.
 */
export async function garantirCardNaEtapa(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    contactId: string;
    pipelineId: string;
    stageId: string;
    campanhaId: string;
    titulo: string;
  },
): Promise<"criado" | "movido" | "ja_estava" | "erro"> {
  const ctx: HandlerCtx = {
    organization_id: entrada.organizationId,
    actor: { type: "webhook_source", id: `campaign:${entrada.campanhaId}` },
    requestId: `campanha-card:${entrada.campanhaId}:${entrada.contactId}`,
  } as HandlerCtx;
  try {
    const { data: aberto } = await admin
      .from("crm_leads")
      .select("id, stage_id")
      .eq("organization_id", entrada.organizationId)
      .eq("contact_id", entrada.contactId)
      .eq("pipeline_id", entrada.pipelineId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lead = aberto as { id: string; stage_id: string } | null;
    if (lead) {
      if (lead.stage_id === entrada.stageId) return "ja_estava";
      await moveLeadHandler(admin, ctx, lead.id, { to_stage_id: entrada.stageId, reason: "campanha" });
      return "movido";
    }
    await createLeadHandler(admin, ctx, {
      ...createLeadSchema.parse({
        pipeline_id: entrada.pipelineId,
        stage_id: entrada.stageId,
        title: entrada.titulo.slice(0, 200).padEnd(2, " "),
        contact_id: entrada.contactId,
        source: "campanha",
      }),
      source_metadata: { campaign_id: entrada.campanhaId },
    });
    return "criado";
  } catch (err) {
    logger.warn("[campanha] card não foi para a etapa", {
      campanha: entrada.campanhaId,
      motivo: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return "erro";
  }
}
