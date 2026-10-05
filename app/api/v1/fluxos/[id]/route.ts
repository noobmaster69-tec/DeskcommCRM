import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { patchDoFluxoSchema, planoDoPatch, type EstadoDoFluxo } from "@/lib/fluxos/menu-do-fluxo";
import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * PATCH /api/v1/fluxos/:id — o que o menu "⋯" e o arrastar da lista de Fluxos
 * mudam (fork jhoow, itens 1 e 2): `pasta_id`, `arquivado`, `ativo`. Manager+,
 * o mesmo papel do editor. As regras ficam em `planoDoPatch`.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });
  const parsed = patchDoFluxoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_error", t("Campos inválidos."), 400, { requestId });
  const orgId = authz.org.orgId;

  const db = await createClient();
  const { data: atual, error: lerErr } = await db
    .from("followup_flow_pointers")
    .select("status, active_version_id, archived_at")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("surface", "fluxo")
    .maybeSingle();
  if (lerErr) return fail("internal_error", t("Não foi possível salvar o fluxo."), 500, { requestId });
  if (!atual) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  const plano = planoDoPatch(atual as EstadoDoFluxo, parsed.data, new Date().toISOString());
  if (!plano.ok) return fail("conflict", t(plano.mensagem), 409, { requestId });
  if (Object.keys(plano.update).length === 0) return ok({ id, ...atual }, { requestId });

  const { data, error } = await db
    .from("followup_flow_pointers")
    .update(plano.update)
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id, status, pasta_id, archived_at, updated_at")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") return fail("not_found", t("Pasta não encontrada."), 404, { requestId });
    return fail("internal_error", t("Não foi possível salvar o fluxo."), 500, { requestId });
  }
  if (!data) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });
  for (const action of plano.eventos) {
    void audit({
      action: action as AuditAction,
      organizationId: orgId,
      actorUserId: authz.user.id,
      resourceType: "followup_flow_pointer",
      resourceId: id,
      requestId,
      metadata: parsed.data,
    });
  }
  return ok(data, { requestId });
}
