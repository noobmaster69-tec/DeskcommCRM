import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { esquecerPreferencia, lerPreferencias } from "@/lib/messaging/lidas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchSchema = z.strictObject({ marcar_lidas_ao_responder: z.boolean() });

/**
 * GET/PATCH /api/v1/settings/preferencias — Configurações › Preferências (fork
 * jhoow). Hoje: "Marcar mensagens como lidas ao responder" (padrão ligado),
 * guardado em `organizations.settings` (mescla, nunca sobrescreve as outras
 * chaves). Leitura de qualquer membro; escrita manager+.
 */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "settings" });
  if (!authz.ok) return authz.response;
  const { data } = await (await createClient())
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  return ok(lerPreferencias((data as { settings?: Record<string, unknown> } | null)?.settings), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "settings" });
  if (!authz.ok) return authz.response;
  const t = (x: string) => traduzir(x, authz.user.idioma);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Dados inválidos."), 422, { requestId });

  const admin = createAdminClient();
  const { data, error } = await admin.from("organizations").select("settings").eq("id", authz.org.orgId).maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const atual = ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  const { error: up } = await admin
    .from("organizations")
    .update({ settings: { ...atual, ...parsed.data } })
    .eq("id", authz.org.orgId);
  if (up) return fail("internal_error", up.message, 500, { requestId });
  esquecerPreferencia(authz.org.orgId);
  void audit({
    action: "org.updated",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: parsed.data,
  });
  return ok(lerPreferencias({ ...atual, ...parsed.data }), { requestId });
}
