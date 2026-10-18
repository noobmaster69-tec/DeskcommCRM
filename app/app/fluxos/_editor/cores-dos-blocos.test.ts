import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NOS_DA_SUPERFICIE } from "@/lib/followup/validate-publish";

import { NODE_COLORS, corDoBloco } from "./cores-dos-blocos";
import { BLOCK_THEME, GRUPOS_DO_DOCK, varsDoBloco } from "./tema-dos-blocos";

describe("cor de cada bloco de Fluxos (BLOCK_THEME)", () => {
  it("todo bloco do fluxo tem tema, e a cor sai dele em oklch", () => {
    for (const tipo of NOS_DA_SUPERFICIE.fluxo) {
      expect(BLOCK_THEME[tipo], tipo).toBeDefined();
      expect(NODE_COLORS[tipo], tipo).toMatch(/^oklch\(0\.66 [\d.]+ \d+\)$/);
    }
  });

  it("as matizes do pedido", () => {
    expect(NODE_COLORS.trigger).toBe("oklch(0.66 0.155 150)");
    expect(NODE_COLORS.mensagem).toBe("oklch(0.66 0.155 262)");
    expect(NODE_COLORS.distribuidor).toBe("oklch(0.66 0.155 88)");
    expect(NODE_COLORS.kanban).toBe("oklch(0.66 0.155 335)");
  });

  it("nenhum par de blocos divide a mesma cor — o mini-mapa os distingue", () => {
    const cores = NOS_DA_SUPERFICIE.fluxo.map((t) => NODE_COLORS[t]);
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("Distribuidor e Pixel usam texto escuro; os outros, branco", () => {
    expect(varsDoBloco("distribuidor")).toMatchObject({ "--c-on": "#1f1600" });
    expect(varsDoBloco("pixel")).toMatchObject({ "--c-on": "#1f1600" });
    expect(varsDoBloco("mensagem")).toMatchObject({ "--c-on": "#ffffff", "--c-light": "oklch(0.87 0.09 262)" });
  });

  it("o dock oferece todo bloco do fluxo, uma vez só", () => {
    const noDock = GRUPOS_DO_DOCK.flatMap((g) => g.tipos);
    expect(new Set(noDock).size).toBe(noDock.length);
    expect([...noDock].sort()).toEqual([...NOS_DA_SUPERFICIE.fluxo].sort());
  });

  it("tipo sem cor cai no cinza de reserva", () => {
    expect(corDoBloco("wait")).toBe("#555555");
    expect(corDoBloco(undefined)).toBe("#555555");
    expect(corDoBloco("mensagem")).toBe(NODE_COLORS.mensagem);
  });
});

describe("mini-mapa do canvas de Fluxos", () => {
  const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");

  it("pinta cada bloco com a cor do tipo", () => {
    expect(canvas).toMatch(/nodeColor=\{\(node\) => corDoBloco\(node\.type\)\}/);
  });
});
