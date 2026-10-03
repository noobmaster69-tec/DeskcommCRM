import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispararFluxo } from "@/lib/fluxos/disparar";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * POST /api/v1/fluxos/:id/disparar — coloca o contato da conversa no fluxo, no
 * Início (fork jhoow, Fase B — o "⚡ Disparar fluxo" do Inbox).
 *
 * Atendente (agent+) pode: é o mesmo papel que responde a conversa. A conversa é
 * conferida com o client da SESSÃO (a RLS respeita a visibilidade restrita do
 * atendente); a escrita usa service role, sempre com a organização da sessão.
 */
type Ctx = { params: Promise<{ id: string }> };
const corpoSchema = z.strictObject({ conversation_id: z.string().uuid() });

const MENSAGEM: Record<string, string> = {
  fluxo_inexistente: "Fluxo não encontrado.",
  fluxo_nao_publicado: "Publique o fluxo antes de disparar.",
  conversa_inexistente: "Conversa não encontrada.",
};

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return fail("validation_error", "Escolha um fluxo e uma conversa.", 400, { requestId });

  const sessao = await createClient();
  const { data: visivel } = await sessao
    .from("conversations")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsed.data.conversation_id)
    .maybeSingle();
  if (!visivel) return fail("not_found", MENSAGEM.conversa_inexistente!, 404, { requestId });

  const r = await dispararFluxo(createAdminClient(), {
    organizationId: authz.org.orgId,
    fluxoId: id,
    conversationId: parsed.data.conversation_id,
  });
  if (!r.ok) {
    if (r.codigo === "ja_em_outro_fluxo")
      return fail(
        "conflict",
        r.detalhe
          ? `Este contato já está em "${r.detalhe}". Encerre aquele antes de disparar outro.`
          : "Este contato já está em outro fluxo ou follow-up.",
        409,
        { requestId },
      );
    return fail(r.codigo === "fluxo_nao_publicado" ? "conflict" : "not_found", MENSAGEM[r.codigo]!, r.codigo === "fluxo_nao_publicado" ? 409 : 404, {
      requestId,
    });
  }
  void audit({
    action: "fluxo.disparado_manualmente",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "followup_flow_pointer",
    resourceId: id,
    requestId,
    metadata: { conversation_id: parsed.data.conversation_id, enrollment_id: r.enrollmentId },
  });
  return ok({ enrollment_id: r.enrollmentId }, { requestId, status: 201 });
}
