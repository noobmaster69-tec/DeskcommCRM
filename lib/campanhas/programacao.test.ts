import { describe, expect, it } from "vitest";

import {
  corpoDaJanela,
  errosDoRitmo,
  instanteAgendado,
  programacaoDaCampanha,
  type ValoresDeRitmo,
} from "@/components/campanhas/CamposDeRitmo";
import { podeMandarAgora, proximaTentativa } from "./ritmo";
import { criarCampanhaSchema, editarCampanhaSchema, problemaDoInicioPlanejado } from "./schemas";

/** "Ritmo e Programação" (fork jhoow): início agendado ≠ janela diária. */
const base: ValoresDeRitmo = {
  minIntervalo: "60",
  maxIntervalo: "180",
  tetoDiario: "",
  tetoHorario: "",
  janelaInicio: "",
  janelaFim: "",
  fuso: "Europe/Lisbon",
  inicioModo: "agendar",
  inicioData: "2026-12-03",
  inicioHora: "12:00",
};
const agora = new Date("2026-10-05T19:37:00Z");

describe("formulário", () => {
  it("03/12/2026 12:00 Europe/Lisbon vira 12:00Z e volta igual", () => {
    expect(errosDoRitmo(base, agora)).toEqual([]);
    const iso = instanteAgendado(base)!;
    expect(iso).toBe("2026-12-03T12:00:00.000Z");
    expect(programacaoDaCampanha({ scheduled_at: iso, timezone: "Europe/Lisbon" })).toMatchObject({
      inicioModo: "agendar",
      inicioData: "2026-12-03",
      inicioHora: "12:00",
    });
  });

  it("recusa passado, sem fuso e horário inexistente", () => {
    expect(errosDoRitmo({ ...base, inicioData: "2026-10-05", inicioHora: "20:00" }, agora)).toEqual(["agenda_passado"]);
    expect(errosDoRitmo({ ...base, fuso: "" }, agora)).toEqual(["agenda_sem_fuso"]);
    expect(errosDoRitmo({ ...base, inicioData: "2027-03-28", inicioHora: "01:30" }, agora)).toEqual(["agenda_invalida"]);
    expect(errosDoRitmo({ ...base, inicioModo: "agora", fuso: "" }, agora)).toEqual([]);
  });

  it("janela em HH:mm: completa e coerente, gravada em minutos", () => {
    expect(errosDoRitmo({ ...base, janelaInicio: "09:30" }, agora)).toEqual(["janela"]);
    expect(errosDoRitmo({ ...base, janelaInicio: "18:00", janelaFim: "09:00" }, agora)).toEqual(["janela"]);
    expect(corpoDaJanela({ janelaInicio: "09:30", janelaFim: "18:15" })).toEqual({
      janela_inicio_minuto: 570,
      janela_fim_minuto: 1095,
      janela_inicio_hora: null,
      janela_fim_hora: null,
    });
    expect(corpoDaJanela({ janelaInicio: "", janelaFim: "" }).janela_inicio_minuto).toBeNull();
  });

  it("campanha antiga com janela em horas reabre em HH:mm", () => {
    expect(programacaoDaCampanha({ janela_inicio_hora: 8, janela_fim_hora: 20 })).toMatchObject({ janelaInicio: "08:00", janelaFim: "20:00", inicioModo: "agora" });
    expect(programacaoDaCampanha({ janela_inicio_hora: 8, janela_fim_hora: 20, janela_inicio_minuto: 510, janela_fim_minuto: 1200 })).toMatchObject({ janelaInicio: "08:30" });
  });
});

describe("rodada: janela em minutos", () => {
  const ritmo = {
    intervaloSegundos: null,
    janelaInicioHora: null,
    janelaFimHora: null,
    janelaInicioMinuto: 21 * 60,
    janelaFimMinuto: 22 * 60 + 30,
    tetoDiario: null,
    tetoHorario: null,
  };
  const estado = { ultimoEnvio: null, enviadasHoje: 0, enviadasNaUltimaHora: 0 };

  it("20:59 em Lisboa espera; a nova tentativa é EXATAMENTE às 21:00", () => {
    const veto = podeMandarAgora(ritmo, estado, new Date("2026-10-05T19:59:00Z"), "Europe/Lisbon");
    expect(veto).toMatchObject({ pode: false, motivo: "fora_da_janela" });
    expect(proximaTentativa(veto, new Date("2026-10-05T19:59:00Z"))?.toISOString()).toBe("2026-10-05T20:00:00.000Z");
  });

  it("21:00 e 22:29 podem; 22:30 não", () => {
    expect(podeMandarAgora(ritmo, estado, new Date("2026-10-05T20:00:00Z"), "Europe/Lisbon").pode).toBe(true);
    expect(podeMandarAgora(ritmo, estado, new Date("2026-10-05T21:29:00Z"), "Europe/Lisbon").pode).toBe(true);
    expect(podeMandarAgora(ritmo, estado, new Date("2026-10-05T21:30:00Z"), "Europe/Lisbon").pode).toBe(false);
  });
});

describe("API", () => {
  const c = {
    name: "x",
    channel_session_id: "11111111-1111-4111-8111-111111111111",
    base_legal: "consent" as const,
  };

  it("aceita o início planejado e a janela em minutos; recusa janela pela metade", () => {
    expect(criarCampanhaSchema.safeParse({ ...c, scheduled_at: "2026-12-03T12:00:00.000Z", timezone: "Europe/Lisbon", janela_inicio_minuto: 570, janela_fim_minuto: 1095 }).success).toBe(true);
    expect(editarCampanhaSchema.safeParse({ janela_inicio_minuto: 570 }).success).toBe(false);
    expect(editarCampanhaSchema.safeParse({ janela_inicio_minuto: null, janela_fim_minuto: null }).success).toBe(true);
  });

  it("o servidor recusa passado e agendamento sem fuso", () => {
    expect(problemaDoInicioPlanejado("2026-10-05T19:00:00Z", "Europe/Lisbon", agora)).toMatch(/passou/);
    expect(problemaDoInicioPlanejado("2026-12-03T12:00:00Z", null, agora)).toMatch(/fuso/);
    expect(problemaDoInicioPlanejado("2026-12-03T12:00:00Z", "Europe/Lisbon", agora)).toBeNull();
    expect(problemaDoInicioPlanejado(null, null, agora)).toBeNull();
  });
});
