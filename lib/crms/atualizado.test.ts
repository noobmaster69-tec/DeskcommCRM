import { describe, expect, it } from "vitest";

import { atualizacaoDoCrm } from "./atualizado";

// 3 out 2026, 9h00 no fuso local de quem roda — o teste fala em hora LOCAL,
// porque "ontem" é o dia de quem olha.
const AGORA = new Date(2026, 9, 3, 9, 0, 0);
const antes = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();
const MIN = 60_000;
const H = 60 * MIN;

describe("atualizacaoDoCrm", () => {
  it("sem negócio nenhum", () => {
    expect(atualizacaoDoCrm(null, AGORA)).toEqual({ frase: "Sem negócios ainda" });
  });

  it("menos de um minuto → agora (e relógio adiantado não vira número negativo)", () => {
    expect(atualizacaoDoCrm(antes(30_000), AGORA)).toEqual({ frase: "Atualizado agora" });
    expect(atualizacaoDoCrm(antes(-5 * MIN), AGORA)).toEqual({ frase: "Atualizado agora" });
  });

  it("minutos e horas, no mesmo dia", () => {
    expect(atualizacaoDoCrm(antes(5 * MIN), AGORA)).toEqual({ frase: "Atualizado há {n} min", n: 5 });
    expect(atualizacaoDoCrm(antes(3 * H + 10 * MIN), AGORA)).toEqual({ frase: "Atualizado há {n} h", n: 3 });
  });

  it("'ontem' é do calendário: 22h da véspera, às 9h, é ontem — não 'há 11 h'", () => {
    expect(atualizacaoDoCrm(new Date(2026, 9, 2, 22, 0).toISOString(), AGORA)).toEqual({
      frase: "Atualizado ontem",
    });
  });

  it("antes de ontem → em dias", () => {
    expect(atualizacaoDoCrm(new Date(2026, 8, 29, 18, 0).toISOString(), AGORA)).toEqual({
      frase: "Atualizado há {n} dias",
      n: 4,
    });
  });
});
