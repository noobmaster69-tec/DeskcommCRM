import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { PipelinePageClient, type CrmDoQuadro, type FunilDoSeletor } from "./_client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  const supabase = await createClient();
  // Mesma razão da Agenda: a RLS é piso, não escopo. Sem este filtro o funil de
  // OUTRA organização do mesmo usuário abre, e o quadro monta com as etapas de
  // um lugar e o cabeçalho de outro.
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary, crm_id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!pipeline) notFound();

  // O CRM e os funis IRMÃOS (Funis no modelo Kommo, Fase C): o seletor no topo
  // do quadro troca entre os funis do mesmo CRM. Lidos AQUI, com o client do
  // usuário, e não pela rota `GET /pipelines` — ela é manager+, e agent também
  // abre o quadro e precisa trocar de funil. A RLS de leitura é a da org.
  const crmId = (pipeline as { crm_id: string | null }).crm_id;
  const [{ data: crm }, { data: irmaos }] = await Promise.all([
    crmId
      ? supabase
          .from("crm_crms")
          .select("id, name, slug")
          .eq("organization_id", activeOrg.orgId)
          .eq("id", crmId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    crmId
      ? supabase
          .from("crm_pipelines")
          .select("id, name, color, is_primary")
          .eq("organization_id", activeOrg.orgId)
          .eq("crm_id", crmId)
          .eq("is_archived", false)
          .order("position")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <PipelinePageClient
      pipelineId={id}
      initialName={pipeline.name}
      role={activeOrg.role}
      crm={(crm as CrmDoQuadro | null) ?? null}
      funis={(irmaos as FunilDoSeletor[] | null) ?? []}
    />
  );
}
