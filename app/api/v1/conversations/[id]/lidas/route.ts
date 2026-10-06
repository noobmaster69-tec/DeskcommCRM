import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { marcarComoLidas } from "@/lib/messaging/lidas";
import { enderecoDaConversa } from "@/lib/messaging/presenca";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/conversations/:id/lidas — o Inbox avisa que o atendente ABRIU a
 * conversa ou começou a DIGITAR (fork jhoow): as mensagens do contato ficam
 * lidas no aparelho dele, se a empresa deixou a preferência ligada. Agent+.
 * Admin client com a organização da SESSÃO no filtro (a conversa de outro
 * tenant não resolve endereço).
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("validation_failed", "id inválido", 422, { requestId });

  const admin = createAdminClient();
  const end = await enderecoDaConversa(admin, authz.org.orgId, id);
  if (!end) return ok({ marcadas: false }, { requestId });
  const marcadas = await marcarComoLidas(admin, {
    organizationId: authz.org.orgId,
    conversationId: id,
    canal: end.adapter,
    sessionRef: end.sessionRef,
    recipient: end.recipient,
  });
  return ok({ marcadas }, { requestId });
}
