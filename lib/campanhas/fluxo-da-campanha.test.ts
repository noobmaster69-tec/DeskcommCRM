import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { criarCampanhaSchema } from "./schemas";
import { MOTIVOS_DE_EXCLUSAO, TEXTO_DA_EXCLUSAO } from "./tipos";
import { corpoDaCampanha, valoresDaCampanha } from "@/app/app/campaigns/_form/valores";

const base = {
  name: "Reativação",
  channel_session_id: "11111111-1111-4111-8111-111111111111",
  base_legal: "consent" as const,
};

describe("campanha que inicia fluxo (item 4)", () => {
  it("modo fluxo exige o fluxo; modo texto segue como antes", () => {
    expect(criarCampanhaSchema.safeParse({ ...base, mode: "flow" }).success).toBe(false);
    expect(
      criarCampanhaSchema.safeParse({ ...base, mode: "flow", flow_id: "22222222-2222-4222-8222-222222222222" }).success,
    ).toBe(true);
    expect(criarCampanhaSchema.safeParse({ ...base, message_body: "Oi" }).success).toBe(true);
  });

  it("o formulário salva mode/flow_id e não exige texto no modo fluxo", () => {
    const v = { ...valoresDaCampanha(), modo: "flow" as const, fluxo: "f-1" };
    const corpo = corpoDaCampanha(v);
    expect(corpo).toMatchObject({ mode: "flow", flow_id: "f-1" });
    const texto = corpoDaCampanha({ ...valoresDaCampanha(), texto: "Oi" });
    expect(texto).toMatchObject({ mode: "text", flow_id: null, message_body: "Oi" });
  });

  it("quem já está em outro fluxo fica de fora, com motivo legível", () => {
    expect(MOTIVOS_DE_EXCLUSAO).toContain("ja_em_fluxo");
    expect(TEXTO_DA_EXCLUSAO.ja_em_fluxo).toMatch(/outro fluxo/);
  });

  it("a rodada inscreve no fluxo (mesmo inscreverNoFluxo do Disparar) e pausa se o fluxo sumiu", () => {
    const rodada = readFileSync("lib/campanhas/rodada.ts", "utf8");
    expect(rodada).toMatch(/if \(campanha\.mode === "flow"\)/);
    expect(rodada).toMatch(/inscreverNoFluxo\(admin,/);
    expect(rodada).toMatch(/FALHAS_DA_CAMPANHA = new Set\(\["fluxo_inexistente", "fluxo_nao_publicado"\]\)/);
  });
});
