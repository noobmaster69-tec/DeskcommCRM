import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { iniciaisDoCrm } from "@/lib/crms/crms";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { CrmsClient, type CrmDoCard } from "./_client";
import type { FunilDaLista } from "./[slug]/_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CRMs" };

/**
 * A grade dos CRMs — a porta do grupo CRM no menu (era a lista de funis, em
 * `/app/kanban`). Cada card leva a `/app/crms/[slug]`, onde ficam os funis.
 *
 * As métricas vêm de `fn_crms_com_metricas` (security invoker: a RLS de
 * crm_leads vale para quem olha), numa consulta só, SEM cache. Medido antes de
 * decidir (migration 9006, pg15 com o baseline): ~3,5 ms com 10 mil negócios e
 * 34–41 ms com 100 mil. Um cache invalidado por evento exigiria tocar cada
 * caminho que escreve negócio — e o esquecido vira número errado na tela.
 *
 * ⚠️ `p_org` sai da organização ATIVA. A policy de leitura libera todas as
 * organizações do usuário; sem o recorte, quem é de duas veria os CRMs
 * misturados.
 */
export default async function CrmsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const [{ data: metricas }, { data: funis }] = await Promise.all([
    supabase.rpc("fn_crms_com_metricas", { p_org: activeOrg.orgId }),
    supabase
      .from("crm_pipelines")
      .select("id, crm_id, name, slug, description, position, is_default, is_client_pipeline, is_primary, color")
      .eq("organization_id", activeOrg.orgId)
      .eq("is_archived", false)
      .order("position"),
  ]);

  type LinhaDeMetrica = Database["public"]["Functions"]["fn_crms_com_metricas"]["Returns"][number];
  // Os funis de cada CRM, para o "Gerenciar funis" do menu do card.
  const funisDoCrm = new Map<string, Array<{ id: string; name: string; color: string | null; is_primary: boolean }>>();
  for (const f of (funis ?? []) as Array<{ id: string; crm_id: string | null; name: string; color?: string | null; is_primary?: boolean }>) {
    if (!f.crm_id) continue;
    const lista = funisDoCrm.get(f.crm_id) ?? [];
    lista.push({ id: f.id, name: f.name, color: f.color ?? null, is_primary: f.is_primary === true });
    funisDoCrm.set(f.crm_id, lista);
  }
  // "Abrir CRM" abre o QUADRO do funil principal, como no Kommo (Funis no modelo
  // Kommo, Fase C). CRM sem funil principal (nenhum funil vivo) cai na lista.
  const principalDoCrm = new Map(
    ((funis ?? []) as Array<{ id: string; crm_id: string | null; is_primary?: boolean }>)
      .filter((f) => f.is_primary && f.crm_id)
      .map((f) => [f.crm_id as string, f.id]),
  );
  const crms: CrmDoCard[] = ((metricas ?? []) as LinhaDeMetrica[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    is_default: c.is_default,
    avatar_bg_color: c.avatar_bg_color,
    initials: iniciaisDoCrm(c.name),
    // bigint pode chegar como texto do PostgREST — somar "12" + "3" daria "123".
    leads_count: Number(c.leads_count),
    funis_count: Number(c.funis_count),
    last_updated_at: c.last_updated_at,
    quadro_id: principalDoCrm.get(c.id) ?? null,
    description: c.description ?? null,
    funis: funisDoCrm.get(c.id) ?? [],
  }));

  // A importação escolhe um FUNIL; na grade ele vem nomeado pelo CRM, porque
  // dois CRMs podem ter funis de nome parecido ("Ensaio" em cada marca).
  const nomeDoCrm = new Map(crms.map((c) => [c.id, c.name]));
  const funisParaImportar: FunilDaLista[] = ((funis ?? []) as FunilDaLista[]).map((f) => ({
    ...f,
    name: nomeDoCrm.has(f.crm_id ?? "") ? `${nomeDoCrm.get(f.crm_id ?? "")} › ${f.name}` : f.name,
  }));

  return (
    <CrmsClient
      crms={crms}
      funisParaImportar={funisParaImportar}
      podeGerenciar={ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager}
      podeImportar={ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent}
    />
  );
}
