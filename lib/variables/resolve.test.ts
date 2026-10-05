import { describe, expect, it } from "vitest";

import { interpolarVariaveis, resolverVariavel, variaveisDoTexto } from "./resolve";
import { chaveCanonica, NOMES_RESERVADOS } from "./sistema";
import { variavelPersonalizadaSchema } from "./definicoes";

const TARDE_SP = new Date("2026-10-05T17:32:00.000Z"); // 14:32 em São Paulo
const ctx = {
  nome: "Jonatas Pereira Gomes",
  telefone: "+5511915793995",
  email: "j@exemplo.com",
  campos: { nome_empresa: "Studio Jonatas", comentarios_google_maps: 128, interesse: "ensaio" },
  quando: { agora: TARDE_SP, fuso: "America/Sao_Paulo" },
};

describe("variáveis do sistema (item 2)", () => {
  it("derivam do nome, empresa, telefone e e-mail", () => {
    expect(resolverVariavel("nome_profissional", ctx)).toBe("Jonatas Pereira Gomes");
    expect(resolverVariavel("primeiro_nome", ctx)).toBe("Jonatas");
    expect(resolverVariavel("ultimo_nome", ctx)).toBe("Gomes");
    expect(resolverVariavel("nome_curto", ctx)).toBe("Jonatas");
    expect(resolverVariavel("nome_empresa", ctx)).toBe("Studio Jonatas");
    expect(resolverVariavel("numero", ctx)).toBe("+5511915793995");
    expect(resolverVariavel("email", ctx)).toBe("j@exemplo.com");
    expect(resolverVariavel("comentarios_google_maps", ctx)).toBe("128");
  });

  it("nome_curto vira 'amigo' sem nome; ultimo_nome vazio com uma palavra só", () => {
    expect(resolverVariavel("nome_curto", { ...ctx, nome: null })).toBe("amigo");
    expect(resolverVariavel("ultimo_nome", { ...ctx, nome: "Ana" })).toBe("");
  });

  it("saudação, dia e data no FUSO do contato", () => {
    expect(resolverVariavel("saudacao_horario", ctx)).toBe("Boa tarde");
    expect(resolverVariavel("saudacao_horario", { ...ctx, quando: { agora: TARDE_SP, fuso: "Europe/Lisbon" } })).toBe("Boa noite");
    expect(resolverVariavel("dia_semana", ctx)).toBe("segunda-feira");
    expect(resolverVariavel("data_atual", ctx)).toBe("05/10/2026");
  });

  it("os nomes antigos continuam valendo (aliases)", () => {
    expect(chaveCanonica("nome")).toBe("nome_profissional");
    expect(chaveCanonica("saudacao")).toBe("saudacao_horario");
    expect(chaveCanonica("telefone")).toBe("numero");
    expect(resolverVariavel("saudacao", ctx)).toBe("Boa tarde");
  });

  it("personalizada vem de custom_fields; o padrão entra quando falta", () => {
    expect(resolverVariavel("interesse", ctx)).toBe("ensaio");
    expect(resolverVariavel("cidade", { ...ctx, padroes: { cidade: "São Paulo" } })).toBe("São Paulo");
    expect(resolverVariavel("constructor", ctx)).toBe("");
  });

  it("interpola {x} e {{x}}; sem valor vira vazio (fluxo) ou fica literal (prévia)", () => {
    const fluxo = interpolarVariaveis("{saudacao_horario}, {{primeiro_nome}}! {xpto}", ctx, { vazioQuandoFalta: true });
    expect(fluxo.texto).toBe("Boa tarde, Jonatas! ");
    expect(fluxo.faltando).toEqual(["xpto"]);
    const previa = interpolarVariaveis("Oi {xpto}", ctx, { vazioQuandoFalta: false });
    expect(previa.texto).toBe("Oi {xpto}");
    expect(variaveisDoTexto("{a} {{b}} {a}")).toEqual(["a", "b"]);
  });
});

describe("variável personalizada", () => {
  it("chave snake_case e sem reusar nome do sistema", () => {
    expect(variavelPersonalizadaSchema.safeParse({ key: "interesse_principal", label: "Interesse" }).success).toBe(true);
    expect(variavelPersonalizadaSchema.safeParse({ key: "Interesse", label: "x" }).success).toBe(false);
    expect(variavelPersonalizadaSchema.safeParse({ key: "primeiro_nome", label: "x" }).success).toBe(false);
    expect(NOMES_RESERVADOS.has("saudacao")).toBe(true);
  });

  it("seleção exige opções", () => {
    expect(variavelPersonalizadaSchema.safeParse({ key: "plano", label: "Plano", type: "selecao" }).success).toBe(false);
    expect(
      variavelPersonalizadaSchema.safeParse({ key: "plano", label: "Plano", type: "selecao", options: ["Básico"] }).success,
    ).toBe(true);
  });
});
