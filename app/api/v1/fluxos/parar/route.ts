import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pararFluxoDaConversa } from "@/lib/fluxos/parar";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * POST /api/v1/fluxos/parar — tira o contato da conversa do fluxo em que ele
 * está (fork jhoow). Mesmo papel de quem dispara (agent+). Depois disso o agente
 * de IA volta a responder ao contato.
 */
const corpoSchema = z.strictObject({ conversation_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_error", "Informe a conversa.", 400, { requestId });

  const { data: visivel } = await (await createClient())
    .from("conversations")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsed.data.conversation_id)
    .maybeSingle();
  if (!visivel) return fail("not_found", "Conversa não encontrada.", 404, { requestId });

  const parado = await pararFluxoDaConversa(createAdminClient(), authz.org.orgId, parsed.data.conversation_id, authz.user.id);
  if (!parado) return fail("not_found", "Este contato não está em nenhum fluxo.", 404, { requestId });
  void audit({
    action: "fluxo.parado_manualmente",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "followup_flow_pointer",
    resourceId: parado.fluxoId,
    requestId,
    metadata: { conversation_id: parsed.data.conversation_id, enrollment_id: parado.enrollmentId },
  });
  return ok({ enrollment_id: parado.enrollmentId, fluxo_id: parado.fluxoId }, { requestId });
}
