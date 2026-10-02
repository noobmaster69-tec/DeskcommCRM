import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { criarPastaSchema } from "@/lib/fluxos/pastas";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * GET  /api/v1/fluxos/pastas — pastas da organização ativa (qualquer membro).
 * POST /api/v1/fluxos/pastas — cria pasta (manager+). Fork jhoow, migration 9002.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fluxo_pastas" });
  if (!authz.ok) return authz.response;
  const db = await createClient();
  const { data, error } = await db
    .from("fluxo_pastas")
    .select("id, nome, parent_id, posicao")
    .eq("organization_id", authz.org.orgId)
    .order("posicao", { ascending: true });
  if (error) return fail("internal_error", "Não foi possível ler as pastas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxo_pastas" });
  if (!authz.ok) return authz.response;
  const parsed = criarPastaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_error", "Confira o nome da pasta.", 400, { requestId });

  const db = await createClient();
  const { data, error } = await db
    .from("fluxo_pastas")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      parent_id: parsed.data.parent_id ?? null,
    })
    .select("id, nome, parent_id, posicao")
    .single();
  if (error) {
    // FK composta (organization_id, parent_id): pai de outra empresa não existe aqui.
    if (error.code === "23503") return fail("not_found", "Pasta-mãe não encontrada.", 404, { requestId });
    return fail("internal_error", "Não foi possível criar a pasta.", 500, { requestId });
  }
  void audit({
    action: "fluxo_pasta.created",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "fluxo_pasta",
    resourceId: data.id,
    requestId,
    metadata: { nome: data.nome, parent_id: data.parent_id },
  });
  return ok(data, { requestId, status: 201 });
}
