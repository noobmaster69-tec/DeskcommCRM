import type { SupabaseClient } from "@supabase/supabase-js";
import "@/lib/automation/actions/create-or-move-lead";
import { getAction } from "@/lib/automation/actions";
import type { ActionCtx } from "@/lib/automation/types";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { encerraDemanda } from "@/lib/leads/encerramento";
import type { ConfigDoKanban } from "./motor";

/**
 * Bloco KANBAN dos fluxos (fork jhoow, Fase C): põe, move ou tira o card do
 * contato num funil.
 *
 * Adicionar e mover reaproveitam a ação de automação `create_or_move_lead` —
 * o mesmo caminho dos handlers de `/api/v1/leads` (criar, mover, transferir de
 * funil sem duplicar card, #958/#992). Uma segunda implementação de "pôr o
 * contato no funil" divergiria da primeira no primeiro conserto.
 *
 * Tirar = encerrar o negócio ABERTO do contato naquele funil como perdido, com
 * o motivo "Removido pelo fluxo" — o schema não tem card sem desfecho fora do
 * quadro, e apagar perderia o histórico.
 *
 * Nunca lança: o resultado vira um evento do fluxo (`kanban`/`kanban_falhou`),
 * e o fluxo segue — um funil apagado não pode prender o contato no bloco.
 */
export const MOTIVO_DA_REMOCAO = "Removido pelo fluxo";

async function primeiraEtapa(admin: SupabaseClient, org: string, pipelineId: string): Promise<string | null> {
  const { data } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org)
    .eq("pipeline_id", pipelineId)
    .eq("is_won", false)
    .eq("is_lost", false)
    .eq("is_archived", false)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function executarKanban(
  admin: SupabaseClient,
  org: string,
  contactId: string,
  enrollmentId: string,
  config: ConfigDoKanban,
): Promise<{ ok: boolean; detalhe: string }> {
  try {
    if (config.acao === "remover") {
      const { data: lead } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", org)
        .eq("contact_id", contactId)
        .eq("pipeline_id", config.pipeline_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lead) return { ok: true, detalhe: "sem_card_aberto" };
      await encerraDemanda(
        admin,
        { organization_id: org, actor: { type: "webhook_source", id: enrollmentId }, requestId: `fluxo:${enrollmentId}` },
        { leadId: lead.id as string, desfecho: "lost", motivo: MOTIVO_DA_REMOCAO },
      );
      return { ok: true, detalhe: `removido:${lead.id as string}` };
    }

    const etapa = config.stage_id ?? (await primeiraEtapa(admin, org, config.pipeline_id));
    if (!etapa) return { ok: false, detalhe: "funil_sem_etapa" };
    const { data: contato } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number")
      .eq("organization_id", org)
      .eq("id", contactId)
      .maybeSingle();
    if (!contato) return { ok: false, detalhe: "contato_inexistente" };
    const acao = getAction("create_or_move_lead");
    if (!acao) return { ok: false, detalhe: "acao_indisponivel" };
    const ctx: ActionCtx = {
      admin,
      organizationId: org,
      ruleId: enrollmentId,
      ruleName: "Fluxo",
      // Sem evento raiz: a origem do atendimento fica "indisponível", como na
      // regra disparada sem evento de contato.
      event: { id: null } as unknown as EventRow,
      context: { contact: contato },
      requestId: `fluxo:${enrollmentId}`,
    };
    const r = await acao.execute(ctx, { pipeline_id: config.pipeline_id, stage_id: etapa });
    const ok = r.status === "success" || r.status === "skipped";
    return { ok, detalhe: ok ? JSON.stringify(r.detail ?? {}).slice(0, 200) : String(r.error ?? r.status) };
  } catch (e) {
    return { ok: false, detalhe: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}
