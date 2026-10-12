import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ListasClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listas" };

/** Operações › Listas (fork jhoow, 9021): as planilhas de contatos da empresa, prontas para virar público de campanha. */
export default async function ListasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");
  return <ListasClient />;
}
