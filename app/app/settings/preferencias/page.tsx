import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { lerPreferencias } from "@/lib/messaging/lidas";
import { createClient } from "@/lib/supabase/server";
import { PreferenciasClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preferências" };

/** Configurações › Preferências (fork jhoow): comportamentos da conversa com o contato. */
export default async function PreferenciasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const { data } = await (await createClient())
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  return (
    <PreferenciasClient
      inicial={lerPreferencias((data as { settings?: Record<string, unknown> } | null)?.settings)}
      podeEditar={ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager}
    />
  );
}
