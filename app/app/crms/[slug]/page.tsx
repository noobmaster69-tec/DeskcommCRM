import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { CaretRight } from "@/lib/ui/icons";
import { FunisClient, type FunilDaLista } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CRM" };

/**
 * Um CRM aberto: os FUNIS dele — a lista que era `/app/kanban`, recortada por
 * `crm_id` (migration 9004). Dentro do funil nada muda: o quadro continua em
 * `/app/pipelines/[id]`.
 *
 * O endereço é o SLUG, não o uuid: é o que a pessoa lê no card ("/pedidos") e o
 * que ela compartilha. CRM arquivado, de outra organização ou inexistente
 * respondem igual — 404 — porque dizer "existe, mas não é seu" já vazaria.
 *
 * ⚠️ O FILTRO DE `organization_id` NÃO É REDUNDANTE COM A RLS: as policies de
 * `crm_crms` e `crm_pipelines` liberam TODAS as organizações do usuário (e
 * tudo para o platform admin). Sem ele, quem é de duas organizações com um CRM
 * de mesmo slug abriria o da organização errada.
 *
 * A LEITURA É ABERTA, A ESCRITA É manager+ — o mesmo critério da antiga lista
 * de funis, espelhando o `requireRole("manager")` das rotas.
 */
export default async function CrmPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { slug: cru } = await params;
  const slug = decodeURIComponent(cru).toLowerCase();

  const supabase = await createClient();
  const { data: crm } = await supabase
    .from("crm_crms")
    .select("id, name, slug, description")
    .eq("organization_id", activeOrg.orgId)
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (!crm) notFound();

  const { data } = await supabase
    .from("crm_pipelines")
    // `is_archived` é COLUNA e não filtro (#979): a gaveta do arquivo precisa
    // dos arquivados para oferecer a volta — a partição é feita abaixo.
    .select("id, crm_id, name, slug, description, position, is_default, is_client_pipeline, is_archived")
    .eq("organization_id", activeOrg.orgId)
    .eq("crm_id", crm.id)
    .order("position");

  const todos = (data ?? []) as Array<FunilDaLista & { is_archived: boolean }>;
  const funis = todos.filter((f) => !f.is_archived);
  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  // O arquivo só vai para quem pode mexer nele (tirar do arquivo e excluir são
  // `requireRole("manager")` nas rotas).
  const arquivados = podeGerenciar ? todos.filter((f) => f.is_archived) : [];
  // Importar planilha é ESCRITA DE OPERAÇÃO: espelha o `requireRole("agent")` da rota.
  const podeImportar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-col gap-2">
        <nav aria-label={t("Caminho")} className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/app/crms" className="hover:text-foreground hover:underline" data-testid="breadcrumb-crms">
            {t("CRMs")}
          </Link>
          <CaretRight size={12} aria-hidden />
          <span className="text-foreground" aria-current="page" data-testid="breadcrumb-crm">
            {crm.name}
          </span>
        </nav>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{crm.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">/{crm.slug}</p>
          {crm.description ? <p className="text-sm text-muted-foreground">{crm.description}</p> : null}
        </div>
      </header>

      <FunisClient
        funis={funis}
        arquivados={arquivados}
        podeGerenciar={podeGerenciar}
        podeImportar={podeImportar}
        crmId={crm.id}
      />
    </div>
  );
}
