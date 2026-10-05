import { describe, expect, it } from "vitest";

import { arvoreDePastas, ordemDasPastasSchema, reordenarIrmas, type PastaDoFluxo } from "./pastas";

const p = (id: string, nome: string, posicao = 0, parent_id: string | null = null): PastaDoFluxo => ({
  id,
  nome,
  posicao,
  parent_id,
});

describe("ordem das pastas na barra (item 3)", () => {
  it("sem posição definida, as pastas saem em ordem alfabética", () => {
    const arvore = arvoreDePastas([p("1", "Vendas"), p("2", "Atendimento"), p("3", "Pós-venda")], new Map());
    expect(arvore.map((n) => n.nome)).toEqual(["Atendimento", "Pós-venda", "Vendas"]);
  });

  it("a posição gravada pelo arrasto manda sobre o alfabeto", () => {
    const arvore = arvoreDePastas([p("1", "Vendas", 0), p("2", "Atendimento", 1)], new Map());
    expect(arvore.map((n) => n.nome)).toEqual(["Vendas", "Atendimento"]);
  });

  it("soltar uma pasta sobre a irmã a põe no lugar dela", () => {
    const irmas = [p("a", "A", 0), p("b", "B", 1), p("c", "C", 2)];
    expect(reordenarIrmas(irmas, "c", "a")).toEqual(["c", "a", "b"]);
    expect(reordenarIrmas(irmas, "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("não reordena entre níveis diferentes nem sobre ela mesma", () => {
    const pastas = [p("a", "A"), p("b", "B"), p("f", "Filha", 0, "a")];
    expect(reordenarIrmas(pastas, "f", "b")).toBeNull();
    expect(reordenarIrmas(pastas, "a", "a")).toBeNull();
    expect(reordenarIrmas(pastas, "a", "x")).toBeNull();
  });

  it("o corpo da ordem exige ids", () => {
    expect(ordemDasPastasSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(ordemDasPastasSchema.safeParse({ ids: ["11111111-1111-4111-8111-111111111111"] }).success).toBe(true);
  });
});
