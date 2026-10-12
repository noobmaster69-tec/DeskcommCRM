import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export interface ListaSalva {
  id: string;
  nome: string;
  contatos: number;
  criada_em: string;
  campanha: { id: string; nome: string } | null;
  arquivo: string | null;
  contagens: Record<string, number> | null;
}

/**
 * GET /api/v1/listas — Operações › Listas (fork jhoow, 9021): todas as listas
 * importadas da organização, subidas na aba Listas OU dentro de uma campanha
 * (a mesma tabela). Manager+, o papel de quem cria campanha.
 */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_audience_sources")
    .select("id, name, contact_ids, created_at, campaign_id, config, campaigns(name)")
    .eq("organization_id", authz.org.orgId)
    .eq("mode", "import")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const listas: ListaSalva[] = ((data ?? []) as Array<{
    id: string;
    name: string | null;
    contact_ids: string[] | null;
    created_at: string;
    campaign_id: string | null;
    config: { arquivo?: string | null; contagens?: Record<string, number> } | null;
    campaigns: { name: string } | { name: string }[] | null;
  }>).map((l) => {
    const c = Array.isArray(l.campaigns) ? l.campaigns[0] : l.campaigns;
    return {
      id: l.id,
      nome: l.name ?? l.config?.arquivo ?? "Lista importada",
      contatos: (l.contact_ids ?? []).length,
      criada_em: l.created_at,
      campanha: l.campaign_id ? { id: l.campaign_id, nome: c?.name ?? "" } : null,
      arquivo: l.config?.arquivo ?? null,
      contagens: l.config?.contagens ?? null,
    };
  });
  return ok(listas, { requestId });
}
