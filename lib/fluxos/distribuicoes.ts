import type { SupabaseClient } from "@supabase/supabase-js";

import type { FlowGraph } from "@/lib/followup/graph-schema";

/** Teto de consultas por leitura: 10 saídas × 4 distribuidores já é um fluxo enorme. */
export const MAX_CONTAGENS = 40;

export type Distribuicoes = Record<string, Record<string, number>>;

/** Os pares (nó, saída) dos Distribuidores do grafo, até o teto. */
export function saidasDosDistribuidores(grafo: FlowGraph | null): { no: string; saida: string }[] {
  const pares: { no: string; saida: string }[] = [];
  for (const n of grafo?.nodes ?? []) {
    if (n.type !== "distribuidor") continue;
    for (const s of n.config.saidas) {
      if (pares.length >= MAX_CONTAGENS) return pares;
      pares.push({ no: n.id, saida: s.id });
    }
  }
  return pares;
}

/**
 * Quantos contatos cada saída de cada Distribuidor já recebeu neste fluxo (fork
 * jhoow, item 5 — o "Quantidade: X" do cartão). A fonte é o mesmo evento que o
 * motor grava ao distribuir (`fluxo.distribuido`, `lib/fluxos/motor.ts`) e que
 * ele mesmo conta para o rodízio — o número na tela é o número que o motor usa.
 *
 * Uma contagem `head` por saída (sem trazer linha nenhuma): o PostgREST não
 * agrupa, e trazer os eventos para contar no Node seria ler a história inteira.
 */
export async function contarDistribuicoes(
  admin: SupabaseClient,
  org: string,
  pointerId: string,
  pares: { no: string; saida: string }[],
): Promise<Distribuicoes> {
  const contagens = await Promise.all(
    pares.map(async ({ no, saida }) => {
      const { count, error } = await admin
        .from("followup_enrollment_events")
        .select("id, inscricao:followup_enrollments!inner(pointer_id)", { count: "exact", head: true })
        .eq("organization_id", org)
        .eq("node_id", no)
        .eq("event_type", "fluxo.distribuido")
        .eq("payload->>saida", saida)
        .eq("inscricao.pointer_id", pointerId);
      if (error) throw new Error(error.message);
      return { no, saida, total: count ?? 0 };
    }),
  );
  const out: Distribuicoes = {};
  for (const { no, saida, total } of contagens) (out[no] ??= {})[saida] = total;
  return out;
}
