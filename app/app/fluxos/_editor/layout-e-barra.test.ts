import { describe, expect, it } from "vitest";

import { haQuanto } from "./BarraDoFluxo";
import { etapasDoFluxo } from "./layout-do-fluxo";

describe('"Salvo há…" da topbar', () => {
  const agora = Date.parse("2026-10-17T12:00:00Z");
  it("conta em minutos, horas e dias", () => {
    expect(haQuanto(agora - 20_000, agora)).toBe("agora");
    expect(haQuanto(agora - 2 * 60_000, agora)).toBe("há 2 min");
    expect(haQuanto(agora - 3 * 3_600_000, agora)).toBe("há 3 h");
    expect(haQuanto(agora - 2 * 86_400_000, agora)).toBe("há 2 d");
  });
});

describe("etapa N do bloco (subtítulo do modal)", () => {
  it("segue o caminho a partir do Início, em largura; solto fica no fim", () => {
    const nodes = [
      { id: "m2", type: "mensagem" },
      { id: "solto", type: "kanban" },
      { id: "ini", type: "trigger" },
      { id: "m1", type: "mensagem" },
      { id: "d", type: "distribuidor" },
    ];
    const edges = [
      { source: "ini", target: "m1" },
      { source: "m1", target: "d" },
      { source: "d", target: "m2" },
    ];
    const etapas = etapasDoFluxo(nodes, edges);
    expect(etapas.get("ini")).toBe(1);
    expect(etapas.get("m1")).toBe(2);
    expect(etapas.get("d")).toBe(3);
    expect(etapas.get("m2")).toBe(4);
    expect(etapas.get("solto")).toBe(5);
  });
});
