import { describe, expect, it } from "vitest";

import { ALVO_SEM_PASTA, ALVO_TODOS, alvoDaPasta, destinoDoSoltar } from "./arrastar";

describe("soltar um fluxo numa pasta (item 1)", () => {
  it("'Todos os fluxos' não é pasta: soltar ali não muda nada", () => {
    expect(destinoDoSoltar(ALVO_TODOS, "p1")).toEqual({ mudar: false });
  });

  it("'Sem pasta' tira o fluxo da pasta", () => {
    expect(destinoDoSoltar(ALVO_SEM_PASTA, "p1")).toEqual({ mudar: true, pasta_id: null });
  });

  it("pasta nomeada move para ela", () => {
    expect(destinoDoSoltar(alvoDaPasta("p2"), "p1")).toEqual({ mudar: true, pasta_id: "p2" });
    expect(destinoDoSoltar(alvoDaPasta("p2"), null)).toEqual({ mudar: true, pasta_id: "p2" });
  });

  it("soltar onde já está, fora de alvo ou num id estranho não chama a API", () => {
    expect(destinoDoSoltar(alvoDaPasta("p1"), "p1")).toEqual({ mudar: false });
    expect(destinoDoSoltar(ALVO_SEM_PASTA, null)).toEqual({ mudar: false });
    expect(destinoDoSoltar(null, "p1")).toEqual({ mudar: false });
    expect(destinoDoSoltar("linha-x", "p1")).toEqual({ mudar: false });
  });
});
