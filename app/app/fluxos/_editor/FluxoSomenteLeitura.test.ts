import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * O link compartilhado desenhava o mini-mapa VAZIO (prova pela tela, 5 out): os
 * nós iam fixos numa prop, sem `onNodesChange`, e o tamanho medido de cada
 * cartão — que é o que o MiniMap desenha — nunca chegava a eles.
 */
const fonte = readFileSync("app/app/fluxos/_editor/FluxoSomenteLeitura.tsx", "utf8");

describe("canvas somente-leitura do link compartilhado", () => {
  it("guarda os nós em estado e recebe as medidas do React Flow", () => {
    expect(fonte).toMatch(/useNodesState\(iniciais\)/);
    expect(fonte).toMatch(/onNodesChange=\{onNodesChange\}/);
  });

  it("continua sem edição nenhuma", () => {
    expect(fonte).toMatch(/nodesDraggable=\{false\}/);
    expect(fonte).toMatch(/nodesConnectable=\{false\}/);
    expect(fonte).toMatch(/elementsSelectable=\{false\}/);
  });
});
