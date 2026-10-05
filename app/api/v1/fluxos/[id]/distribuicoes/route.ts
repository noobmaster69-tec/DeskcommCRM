import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import { contarDistribuicoes, saidasDosDistribuidores } from "@/lib/fluxos/distribuicoes";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * GET /api/v1/fluxos/:id/distribuicoes — quantos contatos passaram por cada
 * saída de cada Distribuidor do fluxo (fork jhoow, item 5). Manager+, o mesmo
 * papel do editor. O fluxo é conferido com o client da SESSÃO (RLS); a
 * contagem dos eventos usa service role, sempre filtrada pela organização da
 * sessão — é a mesma leitura que o motor faz.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });
  const orgId = authz.org.orgId;

  const sessao = await createClient();
  const { data: pointer } = await sessao
    .from("followup_flow_pointers")
    .select("draft_graph, active_version_id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("surface", "fluxo")
    .maybeSingle();
  if (!pointer) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const grafo = await rascunhoDoFluxo(sessao, pointer as { draft_graph: unknown; active_version_id: string | null }, orgId);
  const pares = saidasDosDistribuidores(grafo);
  if (pares.length === 0) return ok({}, { requestId });
  try {
    return ok(await contarDistribuicoes(createAdminClient(), orgId, id, pares), { requestId });
  } catch {
    return fail("internal_error", "Não foi possível contar as distribuições.", 500, { requestId });
  }
}
