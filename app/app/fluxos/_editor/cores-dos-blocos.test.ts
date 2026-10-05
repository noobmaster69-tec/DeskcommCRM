import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NOS_DA_SUPERFICIE } from "@/lib/followup/validate-publish";

import { NODE_COLORS, corDoBloco } from "./cores-dos-blocos";

describe("cor de cada bloco de Fluxos (itens 4, 5 e 9)", () => {
  it("todo bloco que o popover oferece tem cor própria, em hex", () => {
    for (const tipo of NOS_DA_SUPERFICIE.fluxo) {
      expect(NODE_COLORS[tipo], tipo).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("nenhum par de blocos divide a mesma cor — o mini-mapa os distingue", () => {
    const cores = NOS_DA_SUPERFICIE.fluxo.map((t) => NODE_COLORS[t]);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("tipo sem cor cai no cinza de reserva", () => {
    expect(corDoBloco("wait")).toBe("#555555");
    expect(corDoBloco(undefined)).toBe("#555555");
    expect(corDoBloco("mensagem")).toBe(NODE_COLORS.mensagem);
  });
});

describe("mini-mapa do canvas de Fluxos (item 9)", () => {
  const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");

  it("pinta cada bloco com a cor dele e usa o fundo escuro do Leona", () => {
    expect(canvas).toMatch(/nodeColor=\{\(node\) => corDoBloco\(node\.type\)\}/);
    expect(canvas).toMatch(/nodeStrokeWidth=\{2\}/);
    expect(canvas).toMatch(/maskColor="rgba\(0,0,0,0\.6\)"/);
    expect(canvas).toMatch(/backgroundColor: "rgba\(20,20,25,0\.9\)", border: "1px solid #333", borderRadius: 8/);
    expect(canvas).toMatch(/position="bottom-right"\s+pannable\s+zoomable/);
  });

  it("tem o rótulo Mini Map", () => {
    expect(canvas).toMatch(/data-testid="fluxo-minimapa-rotulo"/);
  });
});
