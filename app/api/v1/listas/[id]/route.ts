import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const patchSchema = z.strictObject({ nome: z.string().trim().min(1).max(120) });

/** PATCH renomeia a lista; DELETE apaga — recusado se alguma campanha ainda a usa como público. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", traduzir("Dados inválidos.", authz.user.idioma), 422, { requestId });
  const { error } = await createAdminClient()
    .from("campaign_audience_sources")
    .update({ name: parsed.data.nome })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok({ id, nome: parsed.data.nome }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (x: string) => traduzir(x, authz.user.idioma);
  const admin = createAdminClient();
  const { data: emUso } = await admin
    .from("campaigns")
    .select("id, name")
    .eq("organization_id", authz.org.orgId)
    .eq("audience_filter->>lista_importada", id)
    .limit(1);
  if ((emUso ?? []).length > 0)
    return fail("conflict", `${t("Esta lista é o público da campanha")} "${(emUso![0] as { name: string }).name}". ${t("Troque o público da campanha antes de apagar.")}`, 409, { requestId });
  const { error } = await admin.from("campaign_audience_sources").delete().eq("organization_id", authz.org.orgId).eq("id", id);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return noContent(requestId);
}
