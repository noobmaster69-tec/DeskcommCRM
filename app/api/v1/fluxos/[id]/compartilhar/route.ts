import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * POST /api/v1/fluxos/:id/compartilhar — devolve o link somente-leitura do
 * fluxo (fork jhoow, item 2), criando o token na primeira vez. Chamar de novo
 * devolve o MESMO link (quem já recebeu continua abrindo). Manager+.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });
  const orgId = authz.org.orgId;

  const db = await createClient();
  const { data: atual } = await db
    .from("followup_flow_pointers")
    .select("share_token")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("surface", "fluxo")
    .maybeSingle();
  if (!atual) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  let token = (atual.share_token as string | null) ?? null;
  if (!token) {
    token = randomUUID();
    // `is null` no filtro: dois cliques ao mesmo tempo não trocam o link um do outro.
    const { data: gravado, error } = await db
      .from("followup_flow_pointers")
      .update({ share_token: token })
      .eq("organization_id", orgId)
      .eq("id", id)
      .is("share_token", null)
      .select("share_token")
      .maybeSingle();
    if (error) return fail("internal_error", t("Não foi possível compartilhar o fluxo."), 500, { requestId });
    if (!gravado) {
      const { data: outro } = await db
        .from("followup_flow_pointers")
        .select("share_token")
        .eq("organization_id", orgId)
        .eq("id", id)
        .maybeSingle();
      token = (outro?.share_token as string | null) ?? token;
    }
    void audit({
      action: "fluxo.compartilhado",
      organizationId: orgId,
      actorUserId: authz.user.id,
      resourceType: "followup_flow_pointer",
      resourceId: id,
      requestId,
    });
  }
  return ok({ token, caminho: `/app/fluxos/shared/${token}` }, { requestId });
}
