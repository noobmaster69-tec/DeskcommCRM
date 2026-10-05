import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";

import { rotuloDaArestaDoFluxo } from "./aresta-do-fluxo";

const pos = { x: 0, y: 0 };
const mensagem = {
  id: "m1",
  type: "mensagem",
  label: "Mensagem",
  position: pos,
  config: { itens: [{ id: "t1", tipo: "texto", texto: "Oi" }] },
} as FlowNode;
const condicional = {
  id: "c1",
  type: "condicional",
  label: "Condicional",
  position: pos,
  config: { regra: "todas", condicoes: [{ id: "x", campo: { tipo: "etiqueta" }, operador: "contem", valor: "vip" }] },
} as FlowNode;
const distribuidor = {
  id: "d1",
  type: "distribuidor",
  label: "Distribuidor",
  position: pos,
  config: { modo: "proximo", saidas: [{ id: "s1", nome: "Saída 1" }, { id: "s2", nome: "Equipe B" }] },
} as FlowNode;

describe("rótulo da linha no canvas de Fluxos (item 6)", () => {
  it("linha de bloco com saída única não tem rótulo — acabou o 'Sempre'", () => {
    expect(rotuloDaArestaDoFluxo(mensagem, { type: "always" })).toBeNull();
    expect(rotuloDaArestaDoFluxo(undefined, { type: "always" })).toBeNull();
  });

  it("Condicional: a linha diz de qual saída sai (Sim / Não)", () => {
    expect(rotuloDaArestaDoFluxo(condicional, { type: "branch", branch_id: "sim" })).toBe("Sim");
    expect(rotuloDaArestaDoFluxo(condicional, { type: "branch", branch_id: "nao" })).toBe("Não");
  });

  it("Distribuidor: o nome da saída vem da config do bloco", () => {
    expect(rotuloDaArestaDoFluxo(distribuidor, { type: "branch", branch_id: "s2" })).toBe("Equipe B");
  });

  it("saída que não existe mais no bloco não inventa texto", () => {
    expect(rotuloDaArestaDoFluxo(distribuidor, { type: "branch", branch_id: "apagada" })).toBeNull();
  });
});

describe("o canvas de Fluxos não abre o painel de condição da aresta", () => {
  const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");

  it("o painel da aresta fica só para o follow-up", () => {
    expect(canvas).toMatch(/selectedEdge && !isFluxo && \(/);
  });

  it("Fluxos usa a linha própria e apaga com Delete", () => {
    expect(canvas).toMatch(/edgeTypes=\{isFluxo \? edgeTypes : undefined\}/);
    expect(canvas).toMatch(/deleteKeyCode=\{isFluxo \? \["Backspace", "Delete"\] : undefined\}/);
  });
});
