import { describe, expect, it } from "vitest";
import { fimDoIntervalo, lerDataDoFluxo, proximaJanela } from "./intervalo";

const SP = "America/Sao_Paulo";
const vars = { nome: null, telefone: null, campos: { sessao: "10/10/2026 14:30" }, ultimaMensagem: null };
// 2026-10-05T15:30Z = segunda 12:30 em São Paulo (UTC-3).
const agora = new Date("2026-10-05T15:30:00Z");

describe("Intervalo inteligente dos fluxos", () => {
  it("lê data em vários formatos, no fuso da organização", () => {
    expect(lerDataDoFluxo("10/10/2026 14:30", SP)?.toISOString()).toBe("2026-10-10T17:30:00.000Z");
    expect(lerDataDoFluxo("2026-10-10", SP)?.toISOString()).toBe("2026-10-10T03:00:00.000Z");
    expect(lerDataDoFluxo("2026-10-10T12:00:00Z", SP)?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
    expect(lerDataDoFluxo("amanhã", SP)).toBeNull();
  });

  it("modo data: futura espera, passada ou ilegível segue agora", () => {
    expect(fimDoIntervalo({ modo: "data", quando: "{sessao}" }, agora, SP, vars)).toEqual({
      tipo: "esperar",
      ate: new Date("2026-10-10T17:30:00Z"),
    });
    expect(fimDoIntervalo({ modo: "data", quando: "01/01/2020" }, agora, SP, vars)).toEqual({ tipo: "agora", motivo: "data_no_passado" });
    expect(fimDoIntervalo({ modo: "data", quando: "{nada}" }, agora, SP, vars)).toEqual({ tipo: "agora", motivo: "data_ilegivel" });
  });

  it("horários: dentro segue; fora espera o próximo início (inclusive outro dia)", () => {
    expect(proximaJanela([{ dia: 1, inicio: "08:00", fim: "18:00" }], agora, SP)).toBeNull();
    expect(proximaJanela([{ dia: 1, inicio: "14:00", fim: "18:00" }], agora, SP)?.toISOString()).toBe("2026-10-05T17:00:00.000Z");
    expect(proximaJanela([{ dia: 3, inicio: "09:00", fim: "10:00" }], agora, SP)?.toISOString()).toBe("2026-10-07T12:00:00.000Z");
    // Só segunda de manhã, e já passou: a da semana que vem.
    expect(proximaJanela([{ dia: 1, inicio: "08:00", fim: "09:00" }], agora, SP)?.toISOString()).toBe("2026-10-12T11:00:00.000Z");
  });
});
