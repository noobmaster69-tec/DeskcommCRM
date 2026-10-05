import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ordemDasPastasSchema } from "@/lib/fluxos/pastas";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * POST /api/v1/fluxos/pastas/ordem — grava a ordem das pastas irmãs depois do
 * arrasto na barra lateral (fork jhoow, item 3): `posicao` = índice na lista.
 * Manager+. A coluna `posicao` já existia (migration 9002) — sem migration.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxo_pastas" });
  if (!authz.ok) return authz.response;
  const parsed = ordemDasPastasSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_error", "Confira a ordem das pastas.", 400, { requestId });
  const orgId = authz.org.orgId;
  const db = await createClient();
  const resultados = await Promise.all(
    parsed.data.ids.map((id, posicao) =>
      db.from("fluxo_pastas").update({ posicao }).eq("organization_id", orgId).eq("id", id),
    ),
  );
  if (resultados.some((r) => r.error)) return fail("internal_error", "Não foi possível ordenar as pastas.", 500, { requestId });
  // A primeira pasta da ordem nova ancora a linha de auditoria; a ordem inteira vai no metadata.
  const primeiraPastaId = parsed.data.ids[0]!;
  void audit({
    action: "fluxo_pasta.updated",
    organizationId: orgId,
    actorUserId: authz.user.id,
    resourceType: "fluxo_pasta",
    resourceId: primeiraPastaId,
    requestId,
    metadata: { ordem: parsed.data.ids },
  });
  return ok({ ids: parsed.data.ids }, { requestId });
}
