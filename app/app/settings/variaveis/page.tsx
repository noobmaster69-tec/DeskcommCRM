import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { lerVariaveisDaOrganizacao } from "@/lib/variables/definicoes";
import { VariaveisClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Variáveis" };

/**
 * Configurações › Variáveis (fork jhoow, Campanhas › item 2): as variáveis do
 * SISTEMA (derivadas do contato e do relógio) e as da ORGANIZAÇÃO, que viram
 * `{chave}` nas mensagens de campanha e nos blocos de Fluxo.
 */
export default async function VariaveisPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const personalizadas = await lerVariaveisDaOrganizacao(await createClient(), activeOrg.orgId);
  return (
    <VariaveisClient inicial={personalizadas} podeEditar={ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager} />
  );
}
