import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import { proximoNomeDeFluxo } from "@/lib/fluxos/lista";
import {
  IDIOMAS_DE_TRADUCAO,
  aplicarTraducoes,
  modeloParaTraduzir,
  textosDoFluxo,
  traduzirTextos,
} from "@/lib/fluxos/traduzir";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

export const maxDuration = 120;

/**
 * POST /api/v1/fluxos/:id/traduzir — cria uma CÓPIA traduzida do fluxo (fork
 * jhoow, item 2). Nunca traduz no lugar: o original continua no ar, e a cópia
 * nasce rascunho, na mesma pasta, com o idioma no nome ("Boas-vindas (EN)").
 * Sem provedor de IA cadastrado em Credenciais: 422 `sem_provedor`.
 */
type Ctx = { params: Promise<{ id: string }> };
const corpoSchema = z.strictObject({ idioma: z.enum(IDIOMAS_DE_TRADUCAO) });

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !corpo.success)
    return fail("validation_error", t("Escolha o idioma."), 400, { requestId });
  const orgId = authz.org.orgId;
  const idioma = corpo.data.idioma;

  const db = await createClient();
  const { data: origem } = await db
    .from("followup_flow_pointers")
    .select("name, draft_graph, active_version_id, trigger_config, handoff_policy, pasta_id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("surface", "fluxo")
    .maybeSingle();
  if (!origem) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  const grafo = await rascunhoDoFluxo(db, origem as { draft_graph: unknown; active_version_id: string | null }, orgId);
  const { locais, textos } = grafo ? textosDoFluxo(grafo) : { locais: [], textos: [] };
  if (!grafo || textos.length === 0)
    return fail("validation_error", t("Este fluxo não tem textos para traduzir."), 422, { requestId });

  const model = await modeloParaTraduzir(createAdminClient(), orgId);
  if (!model)
    return fail("sem_provedor", t("Configure um provedor em Credenciais para traduzir."), 422, { requestId });

  let traducoes: string[];
  try {
    traducoes = await traduzirTextos(model, textos, idioma);
  } catch {
    return fail("llm_error", t("O provedor de IA não respondeu. Tente de novo."), 502, { requestId });
  }

  const { data: nomes } = await db.from("followup_flow_pointers").select("name").eq("organization_id", orgId);
  const nome = proximoNomeDeFluxo(
    (nomes ?? []).map((r) => String((r as { name: string }).name)),
    `${String(origem.name).slice(0, 72)} (${idioma.toUpperCase()})`,
  );
  const { data: copia, error } = await db
    .from("followup_flow_pointers")
    .insert({
      organization_id: orgId,
      name: nome,
      status: "draft",
      draft_graph: aplicarTraducoes(grafo, locais, traducoes),
      trigger_config: origem.trigger_config,
      handoff_policy: origem.handoff_policy,
      surface: "fluxo",
      pasta_id: origem.pasta_id,
    })
    .select("id, name")
    .single();
  if (error || !copia) return fail("internal_error", t("Não foi possível criar o fluxo traduzido."), 500, { requestId });

  void audit({
    action: "fluxo.traduzido",
    organizationId: orgId,
    actorUserId: authz.user.id,
    resourceType: "followup_flow_pointer",
    resourceId: copia.id as string,
    requestId,
    metadata: { source_pointer_id: id, idioma, textos: textos.length },
  });
  return ok({ id: copia.id, nome: copia.name }, { requestId, status: 201 });
}
