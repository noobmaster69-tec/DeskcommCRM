import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { FlowGraph } from "@/lib/followup/graph-schema";

import { MAX_CONTAGENS, contarDistribuicoes, saidasDosDistribuidores } from "./distribuicoes";

const grafo = {
  nodes: [
    { id: "m1", type: "mensagem", label: "M", position: { x: 0, y: 0 }, config: { itens: [{ id: "t", tipo: "texto", texto: "oi" }] } },
    {
      id: "d1",
      type: "distribuidor",
      label: "D",
      position: { x: 0, y: 0 },
      config: { modo: "proximo", saidas: [{ id: "s1", nome: "Saída 1" }, { id: "s2", nome: "Saída 2" }] },
    },
  ],
  edges: [],
} as unknown as FlowGraph;

describe("contagem do Distribuidor (item 5)", () => {
  it("lista os pares (nó, saída) só dos distribuidores", () => {
    expect(saidasDosDistribuidores(grafo)).toEqual([
      { no: "d1", saida: "s1" },
      { no: "d1", saida: "s2" },
    ]);
    expect(saidasDosDistribuidores(null)).toEqual([]);
  });

  it("respeita o teto de consultas", () => {
    const muitos = {
      nodes: Array.from({ length: 6 }, (_, i) => ({
        id: `d${i}`,
        type: "distribuidor",
        label: "D",
        position: { x: 0, y: 0 },
        config: { modo: "proximo", saidas: Array.from({ length: 10 }, (_, j) => ({ id: `s${j}`, nome: `S${j}` })) },
      })),
      edges: [],
    } as unknown as FlowGraph;
    expect(saidasDosDistribuidores(muitos)).toHaveLength(MAX_CONTAGENS);
  });

  it("conta o evento fluxo.distribuido por saída, filtrando org, nó e fluxo", async () => {
    const filtros: Record<string, unknown>[] = [];
    const admin = {
      from: (tabela: string) => {
        expect(tabela).toBe("followup_enrollment_events");
        const f: Record<string, unknown> = {};
        filtros.push(f);
        const q = {
          select: () => q,
          eq: (col: string, v: unknown) => {
            f[col] = v;
            return q;
          },
          then: (res: (r: { count: number; error: null }) => unknown) =>
            res({ count: f["payload->>saida"] === "s1" ? 7 : 3, error: null }),
        };
        return q;
      },
    } as unknown as SupabaseClient;
    const out = await contarDistribuicoes(admin, "org-1", "flow-1", saidasDosDistribuidores(grafo));
    expect(out).toEqual({ d1: { s1: 7, s2: 3 } });
    expect(filtros[0]).toMatchObject({
      organization_id: "org-1",
      node_id: "d1",
      event_type: "fluxo.distribuido",
      "inscricao.pointer_id": "flow-1",
    });
  });
});
