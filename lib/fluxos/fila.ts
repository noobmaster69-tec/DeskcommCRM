import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { MotivoDoPasso } from "./motor";

/**
 * O passo do fluxo na fila do worker (`job_queue`, kind `fluxo_step`, migration
 * 9003). Quem enfileira: o disparo, o drain (resposta do lead), o próprio motor
 * (tempo máximo, buffer, continuação depois do teto de passos).
 */
export const payloadDoPassoSchema = z.strictObject({
  enrollment_id: z.string().uuid(),
  motivo: z.discriminatedUnion("tipo", [
    z.strictObject({ tipo: z.literal("seguir"), noId: z.string().optional(), item: z.number().int().min(0).optional() }),
    z.strictObject({ tipo: z.literal("resposta"), mensagemId: z.string().nullable() }),
    z.strictObject({ tipo: z.literal("tempo_esgotado"), noId: z.string(), visita: z.number().int() }),
    z.strictObject({ tipo: z.literal("buffer"), noId: z.string(), visita: z.number().int() }),
  ]),
});
export type PayloadDoPasso = z.infer<typeof payloadDoPassoSchema>;

export async function enfileirarPassoDoFluxo(
  admin: SupabaseClient,
  input: { organizationId: string; contactId: string; enrollmentId: string; motivo: MotivoDoPasso; quando?: Date },
): Promise<void> {
  const payload: PayloadDoPasso = { enrollment_id: input.enrollmentId, motivo: input.motivo };
  const { error } = await admin.from("job_queue").insert({
    organization_id: input.organizationId,
    contact_id: input.contactId,
    kind: "fluxo_step",
    payload,
    run_after: (input.quando ?? new Date()).toISOString(),
    // Passo de fluxo que falha 3 vezes vira `dead` com aviso — mandar a mesma
    // sequência 5 vezes para um lead seria pior que parar.
    max_attempts: 3,
  });
  if (error) throw new Error(`fluxo_enfileirar_falhou: ${error.message}`);
}
