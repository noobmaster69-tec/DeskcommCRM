import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { lerDisparos, GLOBAIS_VAZIOS, type Disparos } from "@/lib/fluxos/disparos";
import { DisparosClient, type FluxoDisparavel } from "./_components/DisparosClient";

export const dynamic = "force-dynamic";

/**
 * /app/disparos — o que faz um fluxo começar (fork jhoow, item 12, imagens 13
 * e 14 do Leona): palavras-chave e gatilhos globais, num lugar só.
 */
export default async function DisparosPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");
  const t = (texto: string) => traduzir(texto, user.idioma);

  const supabase = await createClient();
  const [{ data: ponteiros }, disparos] = await Promise.all([
    supabase
      .from("followup_flow_pointers")
      .select("id, name, status, active_version_id, archived_at")
      .eq("organization_id", activeOrg.orgId)
      .eq("surface", "fluxo")
      .order("name", { ascending: true }),
    lerDisparos(supabase, activeOrg.orgId).catch((): Disparos => ({ palavras: [], globais: GLOBAIS_VAZIOS })),
  ]);
  const fluxos: FluxoDisparavel[] = (ponteiros ?? []).map((p) => ({
    id: p.id as string,
    nome: p.name as string,
    ativo: p.status === "active" && Boolean(p.active_version_id) && !p.archived_at,
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <DisparosClient
        inicial={disparos}
        fluxos={fluxos}
        titulo={t("Disparos")}
        subtitulo={t("O que faz um fluxo começar: palavras-chave e gatilhos globais.")}
      />
    </div>
  );
}
