import { describe, expect, it } from "vitest";

import { corpoDaCota, errosDoRitmo, type ValoresDeRitmo } from "@/components/campanhas/CamposDeRitmo";
import { descricaoDoIntervalo, inicioDoPeriodo, intervaloComVariacao, intervaloDaCota, proximoPeriodo } from "./cota";

/** Cota por período (fork jhoow, 9020): "3 por dia numa janela de 9 h = 1 a cada 3 h". */
describe("cota da campanha", () => {
  const janela9h = { inicio: 9 * 60, fim: 18 * 60 };

  it("divide o período útil pela cota", () => {
    expect(intervaloDaCota({ quantidade: 3, periodo: "dia" }, janela9h)).toBe(3 * 3600);
    expect(intervaloDaCota({ quantidade: 3, periodo: "dia" }, null)).toBe(8 * 3600);
    expect(intervaloDaCota({ quantidade: 10, periodo: "hora" }, janela9h)).toBe(360);
    expect(intervaloDaCota({ quantidade: 21, periodo: "semana" }, janela9h)).toBe(3 * 3600);
    expect(intervaloDaCota({ quantidade: 90, periodo: "mes" }, janela9h)).toBe(3 * 3600);
    expect(descricaoDoIntervalo(3 * 3600)).toEqual({ valor: 3, unidade: "h" });
  });

  it("variação de ±10%", () => {
    expect(intervaloComVariacao(1000, () => 0)).toBe(900);
    expect(intervaloComVariacao(1000, () => 1)).toBe(1100);
  });

  it("período no fuso da campanha: dia, hora, semana (segunda) e mês", () => {
    const agora = new Date("2026-10-07T19:37:00Z"); // quarta, 20:37 em Lisboa (UTC+1)
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "dia").toISOString()).toBe("2026-10-06T23:00:00.000Z");
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "hora").toISOString()).toBe("2026-10-07T19:00:00.000Z");
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "semana").toISOString()).toBe("2026-10-04T23:00:00.000Z"); // segunda 05/10
    expect(inicioDoPeriodo(agora, "Europe/Lisbon", "mes").toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(proximoPeriodo(agora, "Europe/Lisbon", "dia").toISOString()).toBe("2026-10-07T23:00:00.000Z");
    // o mês que atravessa a volta do horário de verão (25/10): 1º de novembro já é UTC+0
    expect(proximoPeriodo(agora, "Europe/Lisbon", "mes").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("formulário: quantidade e período juntos", () => {
    const base = { minIntervalo: "60", maxIntervalo: "180", tetoDiario: "", tetoHorario: "", janelaInicio: "", janelaFim: "", fuso: "" } as ValoresDeRitmo;
    expect(errosDoRitmo({ ...base, cotaQuantidade: "3", cotaPeriodo: "dia" })).toEqual([]);
    expect(errosDoRitmo({ ...base, cotaQuantidade: "3", cotaPeriodo: "" })).toEqual(["cota"]);
    expect(errosDoRitmo({ ...base, cotaQuantidade: "0", cotaPeriodo: "dia" })).toEqual(["cota"]);
    expect(corpoDaCota({ cotaQuantidade: "3", cotaPeriodo: "dia" })).toEqual({ cota_quantidade: 3, cota_periodo: "dia" });
    expect(corpoDaCota({ cotaQuantidade: "", cotaPeriodo: "" })).toEqual({ cota_quantidade: null, cota_periodo: null });
  });
});
