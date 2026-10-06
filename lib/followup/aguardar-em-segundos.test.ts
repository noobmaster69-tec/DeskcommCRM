import { describe, expect, it } from "vitest";

import { aguardarRespostaConfigSchema, segundosDaEspera, UNIDADES_DE_ESPERA } from "./blocos-do-fluxo";

/** Aguardar resposta em SEGUNDOS (fork jhoow): mínimo 10 s, máximo 31 dias. */
describe("Aguardar resposta — unidade segundos", () => {
  it("segundos vem primeiro na lista", () => {
    expect(UNIDADES_DE_ESPERA[0]).toBe("segundos");
  });

  it("converte cada unidade", () => {
    expect(segundosDaEspera(45, "segundos")).toBe(45);
    expect(segundosDaEspera(2, "minutos")).toBe(120);
    expect(segundosDaEspera(3, "horas")).toBe(10800);
    expect(segundosDaEspera(1, "dias")).toBe(86400);
  });

  it("aceita 10 s; recusa 9 s; recusa mais de 31 dias", () => {
    const ok = (valor: number, unidade: (typeof UNIDADES_DE_ESPERA)[number]) =>
      aguardarRespostaConfigSchema.safeParse({ tempo: { valor, unidade } }).success;
    expect(ok(10, "segundos")).toBe(true);
    expect(ok(9, "segundos")).toBe(false);
    expect(ok(31 * 86400, "segundos")).toBe(true);
    expect(ok(31 * 86400 + 1, "segundos")).toBe(false);
    expect(ok(32, "dias")).toBe(false);
    expect(ok(1, "minutos")).toBe(true);
  });
});
