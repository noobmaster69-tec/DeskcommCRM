import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/agent-engine/queue/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { executarPasso } from "./motor";
import { criarDepsDoMotor } from "./motor-supabase";
import { payloadDoPassoSchema } from "./fila";

interface Registro {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
}

/**
 * Handler do job `fluxo_step` no worker (fork jhoow, Fase B, migration 9003).
 *
 * Payload fora do contrato não é retentável — o job termina com aviso no log, em
 * vez de ir para `dead` cinco vezes. Erro de execução SOBE: a fila refaz (até 3
 * vezes), e o `send_ledger` (job, seq) garante que o refeito não repete o que já
 * saiu.
 */
export function createFluxoStepHandler(log: Registro) {
  return async (job: JobRow, _pool: pg.Pool): Promise<void> => {
    const payload = payloadDoPassoSchema.safeParse(job.payload);
    if (!payload.success) {
      log.warn("fluxo_step: payload fora do contrato — job descartado", { job_id: job.id });
      return;
    }
    const admin = createAdminClient();
    const deps = criarDepsDoMotor(admin, { jobId: job.id });
    let resultado;
    try {
      resultado = await executarPasso(deps, job.organization_id, payload.data.enrollment_id, payload.data.motivo);
    } catch (erro) {
      // Última tentativa: a fila vai matar o job. A inscrição não pode ficar
      // `active` sem ninguém para movê-la — com fluxo vivo o agente de IA não
      // responde, e o contato ficaria mudo para sempre (medido no staging).
      if (job.attempts >= job.max_attempts) {
        await encerrarPorFalha(admin, job.organization_id, payload.data.enrollment_id, erro).catch((e: unknown) =>
          log.warn("fluxo_step: não foi possível encerrar a inscrição", { job_id: job.id, error: String(e) }),
        );
      }
      throw erro;
    }
    log.info("fluxo_step concluído", {
      job_id: job.id,
      enrollment_id: payload.data.enrollment_id,
      motivo: payload.data.motivo.tipo,
      resultado: resultado.tipo,
      ...("motivo" in resultado ? { detalhe: resultado.motivo } : {}),
    });
  };
}

/** A inscrição cujo passo esgotou as tentativas vira `dead`, com o erro gravado. */
export async function encerrarPorFalha(
  admin: SupabaseClient,
  org: string,
  enrollmentId: string,
  erro: unknown,
): Promise<void> {
  const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
  const agora = new Date().toISOString();
  const { error } = await admin
    .from("followup_enrollments")
    .update({ status: "dead", last_error: mensagem, cancel_reason: "passo_falhou", completed_at: agora, updated_at: agora })
    .eq("organization_id", org)
    .eq("id", enrollmentId)
    .in("status", ["active", "waiting_reply"]);
  if (error) throw new Error(error.message);
  await admin.from("followup_enrollment_events").insert({
    organization_id: org,
    enrollment_id: enrollmentId,
    node_id: null,
    event_type: "fluxo.encerrado",
    payload: { motivo: "passo_falhou", erro: mensagem },
  });
}
