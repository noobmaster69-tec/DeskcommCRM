import type pg from "pg";
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
    const deps = criarDepsDoMotor(createAdminClient(), { jobId: job.id });
    const resultado = await executarPasso(deps, job.organization_id, payload.data.enrollment_id, payload.data.motivo);
    log.info("fluxo_step concluído", {
      job_id: job.id,
      enrollment_id: payload.data.enrollment_id,
      motivo: payload.data.motivo.tipo,
      resultado: resultado.tipo,
      ...("motivo" in resultado ? { detalhe: resultado.motivo } : {}),
    });
  };
}
