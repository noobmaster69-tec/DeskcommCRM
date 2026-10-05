import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { lerDisparos, salvarDisparosSchema } from "@/lib/fluxos/disparos";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * /api/v1/disparos — a configuração da tela Disparos (fork jhoow, item 12,
 * migration 9011). GET lê; PUT grava TUDO de uma vez (o "Salvar alterações"
 * do topo): os globais (uma linha por organização) e a lista de
 * palavras-chave na ordem da tela — a que saiu da lista é apagada. Manager+.
 */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  try {
    return ok(await lerDisparos(await createClient(), authz.org.orgId), { requestId });
  } catch {
    return fail("internal_error", "Não foi possível ler os disparos.", 500, { requestId });
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = salvarDisparosSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_error", t("Confira os disparos: cada palavra-chave precisa de nome e de condições preenchidas."), 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  const orgId = authz.org.orgId;
  const { palavras, globais } = parsed.data;
  const db = await createClient();

  // Todo fluxo apontado tem de ser um FLUXO desta organização (a FK garante a
  // organização; a superfície é conferida aqui — um follow-up não é disparável).
  const apontados = [
    ...palavras.map((p) => p.fluxo_id),
    globais.welcome_fluxo_id,
    globais.conversation_closed_fluxo_id,
    globais.default_response_fluxo_id,
    globais.attendance_closed_fluxo_id,
  ].filter((id): id is string => Boolean(id));
  const unicos = [...new Set(apontados)];
  if (unicos.length > 0) {
    const { data: achados, error } = await db
      .from("followup_flow_pointers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("surface", "fluxo")
      .in("id", unicos);
    if (error) return fail("internal_error", t("Não foi possível salvar os disparos."), 500, { requestId });
    if ((achados ?? []).length !== unicos.length)
      return fail("not_found", t("Um dos fluxos escolhidos não existe mais. Escolha de novo."), 404, { requestId });
  }

  const { error: gErr } = await db
    .from("crm_fluxo_global_triggers")
    .upsert({ organization_id: orgId, ...globais }, { onConflict: "organization_id" });
  if (gErr) return fail("internal_error", t("Não foi possível salvar os disparos."), 500, { requestId });

  if (palavras.length > 0) {
    const { error: pErr } = await db.from("crm_fluxo_triggers").upsert(
      palavras.map((p, position) => ({ ...p, organization_id: orgId, position })),
      { onConflict: "id" },
    );
    if (pErr) return fail("internal_error", t("Não foi possível salvar os disparos."), 500, { requestId });
  }
  // Grava antes de apagar: uma falha no meio nunca deixa a organização sem nada.
  let apagar = db.from("crm_fluxo_triggers").delete().eq("organization_id", orgId);
  if (palavras.length > 0) apagar = apagar.not("id", "in", `(${palavras.map((p) => p.id).join(",")})`);
  const { error: dErr } = await apagar;
  if (dErr) return fail("internal_error", t("Não foi possível salvar os disparos."), 500, { requestId });

  void audit({
    action: "fluxo.disparos_salvos",
    organizationId: orgId,
    actorUserId: authz.user.id,
    resourceType: "crm_fluxo_triggers",
    resourceId: orgId,
    requestId,
    metadata: { palavras: palavras.length, globais },
  });
  return ok(await lerDisparos(db, orgId), { requestId });
}
