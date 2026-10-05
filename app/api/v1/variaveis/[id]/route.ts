import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { COLUNAS_DA_VARIAVEL, editarVariavelSchema } from "@/lib/variables/definicoes";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * PATCH/DELETE /api/v1/variaveis/:id (manager+). A CHAVE e o TIPO não mudam
 * depois de criados: mensagens e fluxos já citam `{chave}`, e trocar o tipo
 * reinterpretaria valores gravados. Excluir apaga só a DEFINIÇÃO — os valores
 * em `contacts.custom_fields` ficam (preservar dado).
 */
type Ctx = { params: Promise<{ id: string }> };

async function preparar(ctx: Ctx) {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "contact_custom_fields" });
  if (!authz.ok) return { ok: false as const, resposta: authz.response };
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false as const, resposta: fail("not_found", "Variável não encontrada.", 404, { requestId }) };
  return { ok: true as const, requestId, authz, id };
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const p = await preparar(ctx);
  if (!p.ok) return p.resposta;
  const { requestId, authz, id } = p;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = editarVariavelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_error", t("Confira a variável."), 400, { requestId });
  const db = await createClient();
  const { data, error } = await db
    .from("contact_custom_fields")
    .update(parsed.data)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS_DA_VARIAVEL)
    .maybeSingle();
  if (error) return fail("internal_error", t("Não foi possível salvar a variável."), 500, { requestId });
  if (!data) return fail("not_found", t("Variável não encontrada."), 404, { requestId });
  void audit({
    action: "variavel.editada",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "contact_custom_field",
    resourceId: id,
    requestId,
    metadata: parsed.data,
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const p = await preparar(ctx);
  if (!p.ok) return p.resposta;
  const { requestId, authz, id } = p;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const db = await createClient();
  const { data, error } = await db
    .from("contact_custom_fields")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select("id, key")
    .maybeSingle();
  if (error) return fail("internal_error", t("Não foi possível excluir a variável."), 500, { requestId });
  if (!data) return fail("not_found", t("Variável não encontrada."), 404, { requestId });
  void audit({
    action: "variavel.excluida",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "contact_custom_field",
    resourceId: id,
    requestId,
    metadata: { key: (data as { key: string }).key },
  });
  return ok({ id }, { requestId });
}
