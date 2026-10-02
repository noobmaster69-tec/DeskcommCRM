import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { menuOcultoSchema } from "@/lib/navigation/menu-pessoal";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * Grava o menu lateral PESSOAL de quem está logado, na organização ativa
 * (fork jhoow, P6 — migration 9001).
 *
 * Quem e onde vêm da SESSÃO (`requireRole` resolve usuário e organização ativa
 * de fonte confiável), nunca do corpo. A escrita passa por
 * `fn_definir_menu_oculto`, que só toca a coluna `menu_oculto` da linha do
 * `auth.uid()` — a policy de UPDATE de `user_organizations` é de admin, e abri-la
 * deixaria o membro mudar o próprio papel. Qualquer papel pode: é preferência
 * de tela, e só esconde.
 */
export async function PATCH(req: NextRequest) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "menu" });
  if (!authz.ok) return authz.response;
  const parsed = z
    .object({ menu_oculto: menuOcultoSchema })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_error", "Confira os itens do menu.", 400, { requestId });

  const db = await createClient();
  const { data, error } = await db.rpc("fn_definir_menu_oculto", {
    p_organization_id: authz.org.orgId,
    p_itens: parsed.data.menu_oculto,
  });
  if (error) {
    if (error.code === "P0002")
      return fail("not_found", "Vínculo ativo não encontrado.", 404, { requestId });
    if (error.code === "22023")
      return fail("validation_error", "Confira os itens do menu.", 400, { requestId });
    return fail("internal_error", "Não foi possível salvar o menu.", 500, { requestId });
  }
  void audit({
    action: "me.menu_changed",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "membership",
    resourceId: (data as { id?: string } | null)?.id ?? authz.user.id,
    requestId,
    metadata: { menu_oculto: parsed.data.menu_oculto },
  });
  return ok({ menu_oculto: parsed.data.menu_oculto }, { requestId });
}
