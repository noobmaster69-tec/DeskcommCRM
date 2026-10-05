import { notFound, redirect } from "next/navigation";

import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";
import { FlowBuilder } from "@/app/app/ai/followups/[id]/_components/FlowBuilder";

export const dynamic = "force-dynamic";

const DETAIL_COLUMNS =
  "id, name, status, active_version_id, draft_graph, handoff_policy, trigger_config, surface, created_at, updated_at";

/**
 * Editor de um FLUXO (fork jhoow, Etapa 2). É o editor de follow-up — canvas,
 * salvar, publicar, rollback — aberto com `surface = "fluxo"`: a paleta oferece
 * só os blocos de fluxo (`NOS_DA_SUPERFICIE.fluxo`), a barra esconde o gatilho
 * de relógio e o handoff, e o canvas ganha grade e mini-mapa.
 */
export default async function FluxoEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  const supabase = await createClient();
  const [{ data: pointer }, { data: versionRows }] = await Promise.all([
    supabase
      .from("followup_flow_pointers")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .eq("organization_id", activeOrg.orgId)
      .eq("surface", "fluxo")
      .maybeSingle(),
    supabase
      .from("followup_flow_versions")
      .select("id, created_at")
      .eq("organization_id", activeOrg.orgId)
      .eq("pointer_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!pointer) notFound();

  const draft_graph = await rascunhoDoFluxo(
    supabase,
    pointer as unknown as { draft_graph: unknown; active_version_id: string | null },
    activeOrg.orgId,
  );
  const flow: FollowupFlowDetailRow = {
    ...(pointer as unknown as Omit<FollowupFlowDetailRow, "versions_count" | "previous_version_id">),
    draft_graph,
    versions_count: versionRows?.length ?? 0,
    previous_version_id: versionRows?.[1]?.id ?? null,
  };

  // Canvas de ponta a ponta (item 8, modelo Leona): `-m-6` desfaz o `p-6` do
  // <main> da casca e a altura é a da tela menos a barra do topo (h-14) — o
  // <main> não tem altura definida, então `h-full` aqui não resolvia nada e o
  // canvas ficava preso no `min-h-[600px]`.
  return (
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-[420px] flex-col" data-testid="fluxo-editor-tela">
      <FlowBuilder flowId={id} initialData={flow} />
    </div>
  );
}
