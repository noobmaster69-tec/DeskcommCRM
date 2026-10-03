import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fluxoVivoDaConversa } from "@/lib/fluxos/parar";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * GET /api/v1/fluxos/ativo?conversation_id= — o fluxo em que o contato da
 * conversa está agora, ou `null` (fork jhoow). É o que faz o cabeçalho do Inbox
 * trocar "Disparar fluxo" por "Parar fluxo". A conversa é conferida com o client
 * da SESSÃO (RLS); a leitura da inscrição usa service role com a organização da sessão.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const conversa = z.string().uuid().safeParse(req.nextUrl.searchParams.get("conversation_id"));
  if (!conversa.success) return fail("validation_error", "Informe a conversa.", 400, { requestId });
  const { data: visivel } = await (await createClient())
    .from("conversations")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", conversa.data)
    .maybeSingle();
  if (!visivel) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  const vivo = await fluxoVivoDaConversa(createAdminClient(), authz.org.orgId, conversa.data);
  return ok(
    vivo
      ? { enrollment_id: vivo.enrollmentId, fluxo_id: vivo.fluxoId, nome: vivo.nome, status: vivo.status, desde: vivo.desde }
      : null,
    { requestId },
  );
}
