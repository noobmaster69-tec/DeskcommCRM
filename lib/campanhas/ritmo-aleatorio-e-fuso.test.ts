import { describe, expect, it } from "vitest";

import { fusoDoContato, fusoValido, horaAgoraNoFuso, proximoEnvioAleatorio } from "./fuso";
import { criarCampanhaSchema } from "./schemas";
import { errosDoRitmo } from "@/components/campanhas/CamposDeRitmo";

const AGORA = new Date("2026-10-05T12:00:00.000Z");

describe("intervalo aleatório (item 7)", () => {
  it("o próximo envio cai entre o mínimo e o máximo", () => {
    expect(proximoEnvioAleatorio(AGORA, 60, 180, () => 0).getTime() - AGORA.getTime()).toBe(60_000);
    expect(proximoEnvioAleatorio(AGORA, 60, 180, () => 1).getTime() - AGORA.getTime()).toBe(180_000);
    const meio = proximoEnvioAleatorio(AGORA, 60, 180, () => 0.5).getTime() - AGORA.getTime();
    expect(meio).toBe(120_000);
  });

  it("sorteios diferentes dão intervalos diferentes (não é cadência fixa)", () => {
    const a = proximoEnvioAleatorio(AGORA, 60, 180, () => 0.1).getTime();
    const b = proximoEnvioAleatorio(AGORA, 60, 180, () => 0.9).getTime();
    expect(a).not.toBe(b);
  });

  it("validação: mínimo ≥ 10 e máximo ≥ mínimo", () => {
    const base = { minIntervalo: "60", maxIntervalo: "180", tetoDiario: "", tetoHorario: "", janelaInicio: "", janelaFim: "", fuso: "" };
    expect(errosDoRitmo(base)).toEqual([]);
    expect(errosDoRitmo({ ...base, minIntervalo: "5" })).toHaveLength(1);
    expect(errosDoRitmo({ ...base, maxIntervalo: "30" })).toHaveLength(1);
    const r = criarCampanhaSchema.safeParse({
      name: "x",
      channel_session_id: "11111111-1111-4111-8111-111111111111",
      base_legal: "consent",
      min_interval_seconds: 200,
      max_interval_seconds: 100,
    });
    expect(r.success).toBe(false);
  });
});

describe("fuso da campanha e do contato (item 7)", () => {
  it("valida nomes IANA", () => {
    expect(fusoValido("Europe/Lisbon")).toBe(true);
    expect(fusoValido("Marte/Base")).toBe(false);
    expect(fusoValido("")).toBe(false);
  });

  it("o campo timezone da ficha manda; depois o DDI de país de fuso único; senão o da campanha", () => {
    expect(fusoDoContato("+5511999999999", { timezone: "America/Manaus" }, "America/Sao_Paulo")).toBe("America/Manaus");
    expect(fusoDoContato("+351912345678", {}, "America/Sao_Paulo")).toBe("Europe/Lisbon");
    expect(fusoDoContato("+447911123456", {}, "America/Sao_Paulo")).toBe("Europe/London");
    // Brasil tem vários fusos: não chuta, usa o da campanha.
    expect(fusoDoContato("+5592999999999", {}, "Europe/Lisbon")).toBe("Europe/Lisbon");
    expect(fusoDoContato("+5511999999999", { timezone: "lixo" }, "America/Sao_Paulo")).toBe("America/Sao_Paulo");
  });

  it("a prévia mostra a hora no fuso escolhido", () => {
    expect(horaAgoraNoFuso(AGORA, "America/Sao_Paulo")).toBe("09:00");
    expect(horaAgoraNoFuso(AGORA, "Europe/Lisbon")).toBe("13:00");
  });
});
