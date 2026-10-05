import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * GET /api/v1/fluxos/campos — as chaves de campo da ficha que a organização já
 * usa (`contacts.custom_fields`), para o "Campo para salvar" do Aguardar resposta
 * e as variáveis `{campo}` dos textos (fork jhoow, Fase B). A ficha não tem
 * tabela de definições: o campo nasce quando alguém grava nele, e esta lista é a
 * união das chaves de uma amostra dos contatos mais recentes.
 */
export const dynamic = "force-dynamic";
const AMOSTRA = 500;

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const db = await createClient();
  const { data, error } = await db
    .from("contacts")
    .select("custom_fields")
    .eq("organization_id", authz.org.orgId)
    .neq("custom_fields", "{}")
    .order("updated_at", { ascending: false })
    .limit(AMOSTRA);
  if (error) return fail("internal_error", "Não foi possível ler os campos.", 500, { requestId });
  const chaves = new Set<string>();
  for (const linha of data ?? []) {
    const campos = linha.custom_fields as Record<string, unknown> | null;
    if (campos && typeof campos === "object") for (const k of Object.keys(campos)) if (/^[a-z][a-z0-9_.]*$/.test(k)) chaves.add(k);
  }
  // As variáveis DEFINIDAS em Configurações › Variáveis (9013) entram mesmo sem
  // nenhum contato ter valor ainda — é o que o editor precisa para sugerir.
  const { data: definidas } = await db
    .from("contact_custom_fields")
    .select("key")
    .eq("organization_id", authz.org.orgId);
  for (const d of (definidas ?? []) as Array<{ key: string }>) chaves.add(d.key);
  return ok([...chaves].sort(), { requestId });
}
