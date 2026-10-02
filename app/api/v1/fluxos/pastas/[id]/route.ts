import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { editarPastaSchema } from "@/lib/fluxos/pastas";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * PATCH  /api/v1/fluxos/pastas/:id — renomeia ou move a pasta (manager+).
 * DELETE /api/v1/fluxos/pastas/:id — apaga a pasta e as subpastas; os fluxos
 *   voltam para a raiz (`on delete set null (pasta_id)`, migration 9002).
 */
type Ctx = { params: Promise<{ id: string }> };

type Preparo =
  | { ok: false; resposta: Response }
  | { ok: true; requestId: string; orgId: string; userId: string; id: string };

async function preparar(ctx: Ctx): Promise<Preparo> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxo_pastas" });
  if (!authz.ok) return { ok: false, resposta: authz.response };
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false, resposta: fail("not_found", "Pasta não encontrada.", 404, { requestId }) };
  return { ok: true, requestId, orgId: authz.org.orgId, userId: authz.user.id, id };
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const p = await preparar(ctx);
  if (!p.ok) return p.resposta;
  const { requestId, orgId, userId, id } = p;
  const parsed = editarPastaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_error", "Confira os dados da pasta.", 400, { requestId });
  if (parsed.data.parent_id === id)
    return fail("validation_error", "Uma pasta não pode ficar dentro dela mesma.", 400, { requestId });

  const db = await createClient();
  const { data, error } = await db
    .from("fluxo_pastas")
    .update(parsed.data)
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id, nome, parent_id, posicao")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") return fail("not_found", "Pasta-mãe não encontrada.", 404, { requestId });
    return fail("internal_error", "Não foi possível salvar a pasta.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Pasta não encontrada.", 404, { requestId });
  void audit({
    action: "fluxo_pasta.updated",
    organizationId: orgId,
    actorUserId: userId,
    resourceType: "fluxo_pasta",
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
  const { requestId, orgId, userId, id } = p;
  const db = await createClient();
  const { data, error } = await db
    .from("fluxo_pastas")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id, nome")
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível apagar a pasta.", 500, { requestId });
  if (!data) return fail("not_found", "Pasta não encontrada.", 404, { requestId });
  void audit({
    action: "fluxo_pasta.deleted",
    organizationId: orgId,
    actorUserId: userId,
    resourceType: "fluxo_pasta",
    resourceId: id,
    requestId,
    metadata: { nome: data.nome },
  });
  return ok({ id }, { requestId });
}
