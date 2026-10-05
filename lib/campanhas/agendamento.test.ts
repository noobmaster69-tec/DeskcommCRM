import { describe, expect, it } from "vitest";

import {
  camposDoInstante,
  faltaAte,
  instanteDoHorarioLocal,
  minutosDoHorario,
  proximaAbertura,
  resumoDoInicio,
} from "./agendamento";

/** "Ritmo e Programação" (fork jhoow): o agendamento no fuso IANA, com horário de verão. */
describe("horário local → instante", () => {
  it("03/12/2026 12:00 em Lisboa (inverno, UTC+0) é 12:00Z", () => {
    expect(instanteDoHorarioLocal("2026-12-03", "12:00", "Europe/Lisbon")?.toISOString()).toBe("2026-12-03T12:00:00.000Z");
  });

  it("no verão de Lisboa (UTC+1) o mesmo relógio é uma hora antes em UTC", () => {
    expect(instanteDoHorarioLocal("2026-07-03", "12:00", "Europe/Lisbon")?.toISOString()).toBe("2026-07-03T11:00:00.000Z");
  });

  it("São Paulo é UTC−3 o ano todo (sem horário de verão desde 2019)", () => {
    expect(instanteDoHorarioLocal("2026-12-03", "12:00", "America/Sao_Paulo")?.toISOString()).toBe("2026-12-03T15:00:00.000Z");
  });

  it("minutos importam", () => {
    expect(instanteDoHorarioLocal("2026-10-05", "21:07", "Europe/Lisbon")?.toISOString()).toBe("2026-10-05T20:07:00.000Z");
  });

  it("o horário que NÃO existe (pulo de 29/03/2026 em Lisboa) é recusado", () => {
    expect(instanteDoHorarioLocal("2026-03-29", "01:30", "Europe/Lisbon")).toBeNull();
    expect(instanteDoHorarioLocal("2026-03-29", "02:00", "Europe/Lisbon")?.toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });

  it("o horário que acontece DUAS vezes (25/10/2026, 01:30 em Lisboa) usa o primeiro", () => {
    expect(instanteDoHorarioLocal("2026-10-25", "01:30", "Europe/Lisbon")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("ida e volta pelos campos da tela", () => {
    const i = instanteDoHorarioLocal("2026-12-03", "12:00", "Europe/Lisbon")!;
    expect(camposDoInstante(i, "Europe/Lisbon")).toEqual({ data: "2026-12-03", hora: "12:00" });
    expect(camposDoInstante(i, "America/Sao_Paulo")).toEqual({ data: "2026-12-03", hora: "09:00" });
  });

  it("formato e datas impossíveis", () => {
    expect(instanteDoHorarioLocal("2026-02-30", "12:00", "Europe/Lisbon")).toBeNull();
    expect(instanteDoHorarioLocal("2026-12-03", "25:00", "Europe/Lisbon")).toBeNull();
    expect(instanteDoHorarioLocal("03/12/2026", "12:00", "Europe/Lisbon")).toBeNull();
  });
});

describe("resumo da tela", () => {
  const agora = new Date("2026-10-05T19:37:00Z"); // 20:37 em Lisboa (UTC+1)

  it("hoje, em 23 minutos", () => {
    expect(resumoDoInicio({ agora, fuso: "Europe/Lisbon", modo: "agendar", data: "2026-10-05", hora: "21:00", janela: null })).toEqual({
      tipo: "programado",
      agora: "20:37",
      hoje: true,
      data: "05/10/2026",
      hora: "21:00",
      falta: { dias: 0, horas: 0, minutos: 23 },
      deslocado: null,
    });
  });

  it("03/12/2026 12:00 — dias, horas e minutos reais (atravessa a volta do horário de verão)", () => {
    const r = resumoDoInicio({ agora, fuso: "Europe/Lisbon", modo: "agendar", data: "2026-12-03", hora: "12:00", janela: null });
    // 19:37Z de 05/10 → 12:00Z de 03/12 = 58 dias 16h23
    expect(r).toMatchObject({ tipo: "programado", hoje: false, data: "03/12/2026", falta: { dias: 58, horas: 16, minutos: 23 } });
  });

  it("horário passado e fuso ausente viram erro, não frase", () => {
    expect(resumoDoInicio({ agora, fuso: "Europe/Lisbon", modo: "agendar", data: "2026-10-05", hora: "20:00", janela: null }).tipo).toBe("passado");
    expect(resumoDoInicio({ agora, fuso: null, modo: "agendar", data: "2026-12-03", hora: "12:00", janela: null }).tipo).toBe("sem_fuso");
    expect(resumoDoInicio({ agora, fuso: "Europe/Lisbon", modo: "agendar", data: "", hora: "12:00", janela: null }).tipo).toBe("invalido");
  });

  it("a janela diária empurra o primeiro envio — e a tela avisa para quando", () => {
    const janela = { inicio: minutosDoHorario("09:00")!, fim: minutosDoHorario("18:00")! };
    const r = resumoDoInicio({ agora, fuso: "Europe/Lisbon", modo: "agendar", data: "2026-10-05", hora: "21:00", janela });
    expect(r).toMatchObject({ tipo: "programado", deslocado: { data: "06/10/2026", hora: "09:00", hoje: false } });
    const agoraFora = resumoDoInicio({ agora, fuso: "Europe/Lisbon", modo: "agora", data: "", hora: "", janela });
    expect(agoraFora).toMatchObject({ tipo: "agora", agora: "20:37", deslocado: { hora: "09:00" } });
  });
});

describe("relógio", () => {
  it("falta arredonda para cima", () => {
    expect(faltaAte(new Date("2026-01-01T00:00:30Z"), new Date("2026-01-01T00:01:00Z"))).toEqual({ dias: 0, horas: 0, minutos: 1 });
  });

  it("próxima abertura no mesmo dia e no dia seguinte", () => {
    const j = { inicio: 9 * 60, fim: 18 * 60 };
    expect(proximaAbertura(new Date("2026-10-05T06:00:00Z"), "Europe/Lisbon", j).toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(proximaAbertura(new Date("2026-10-05T10:00:00Z"), "Europe/Lisbon", j).toISOString()).toBe("2026-10-05T10:00:00.000Z");
    // 24/10 sábado 20:00 Lisboa (UTC+1) → 25/10 09:00, já em UTC+0
    expect(proximaAbertura(new Date("2026-10-24T19:00:00Z"), "Europe/Lisbon", j).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("HH:mm", () => {
    expect(minutosDoHorario("09:30")).toBe(570);
    expect(minutosDoHorario("24:00")).toBe(1440);
    expect(minutosDoHorario("24:30")).toBeNull();
    expect(minutosDoHorario("9h")).toBeNull();
  });
});
