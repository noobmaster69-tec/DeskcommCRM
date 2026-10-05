import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";
import { COLUNAS_DA_VARIAVEL, lerVariaveisDaOrganizacao, variavelPersonalizadaSchema } from "@/lib/variables/definicoes";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * /api/v1/variaveis — Configurações › Variáveis (fork jhoow, Campanhas › item 2).
 * GET (agent+): as do SISTEMA (derivadas, só leitura) e as da ORGANIZAÇÃO.
 * POST (manager+): cria uma personalizada. O valor de cada contato mora em
 * `contacts.custom_fields[chave]`.
 */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contact_custom_fields" });
  if (!authz.ok) return authz.response;
  const personalizadas = await lerVariaveisDaOrganizacao(await createClient(), authz.org.orgId);
  return ok({ sistema: VARIAVEIS_DO_SISTEMA, personalizadas }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "contact_custom_fields" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = variavelPersonalizadaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_error", parsed.error.issues[0]?.message ?? t("Confira a variável."), 400, { requestId });
  const db = await createClient();
  const { data, error } = await db
    .from("contact_custom_fields")
    .insert({ ...parsed.data, organization_id: authz.org.orgId })
    .select(COLUNAS_DA_VARIAVEL)
    .single();
  if (error) {
    if (error.code === "23505") return fail("conflict", t("Já existe uma variável com esta chave."), 409, { requestId });
    return fail("internal_error", t("Não foi possível criar a variável."), 500, { requestId });
  }
  void audit({
    action: "variavel.criada",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "contact_custom_field",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { key: parsed.data.key, type: parsed.data.type },
  });
  return ok(data, { requestId, status: 201 });
}
