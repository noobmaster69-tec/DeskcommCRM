import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { ListaDeFluxos, type FluxoDaLista } from "./_components/ListaDeFluxos";
import type { PastaDoFluxo } from "@/lib/fluxos/pastas";
import { contarBlocos } from "@/lib/fluxos/lista";

export const dynamic = "force-dynamic";

/** /app/fluxos — a lista do construtor de Fluxos (fork jhoow, Etapa 2). */
export default async function FluxosPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");
  const t = (texto: string) => traduzir(texto, user.idioma);

  const supabase = await createClient();
  const [{ data: ponteiros }, { data: pastas }] = await Promise.all([
    supabase
      .from("followup_flow_pointers")
      .select("id, name, status, pasta_id, draft_graph, updated_at")
      .eq("organization_id", activeOrg.orgId)
      .eq("surface", "fluxo")
      .order("updated_at", { ascending: false }),
    supabase
      .from("fluxo_pastas")
      .select("id, nome, parent_id, posicao")
      .eq("organization_id", activeOrg.orgId)
      .order("posicao", { ascending: true }),
  ]);

  const fluxos: FluxoDaLista[] = (ponteiros ?? []).map((p) => ({
    id: p.id as string,
    nome: p.name as string,
    status: p.status as FluxoDaLista["status"],
    pasta_id: (p.pasta_id as string | null) ?? null,
    blocos: contarBlocos(p.draft_graph),
    atualizado_em: p.updated_at as string,
  }));

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Fluxos")}</h1>
        <p className="text-sm text-muted-foreground">{t("Automações e fluxos de atendimento")}</p>
      </header>
      <ListaDeFluxos fluxos={fluxos} pastas={(pastas ?? []) as PastaDoFluxo[]} />
    </div>
  );
}
