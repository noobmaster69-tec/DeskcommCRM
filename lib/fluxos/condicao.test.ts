import { describe, expect, it } from "vitest";
import { avaliarCondicao, avaliarCondicional, type RetratoDaCondicao } from "./condicao";

// 2026-10-05T15:30Z = segunda-feira, 12:30 em São Paulo.
const base: RetratoDaCondicao = {
  nome: "Maria Silva",
  telefone: "+55 (11) 99999-0000",
  email: "Maria@Ex.com",
  etiquetas: ["Cliente VIP", "retrato"],
  campos: { idade: 31, cidade: "Recife", vazio: "" },
  statusDaConversa: "open",
  atendente: null,
  ultimaEntradaEm: "2026-10-05T10:00:00Z",
  fuso: "America/Sao_Paulo",
  agora: new Date("2026-10-05T15:30:00Z"),
  variaveis: { nome: "Maria", telefone: null, campos: { minimo: "30" }, ultimaMensagem: null },
};
const c = (campo: object, operador: string, valor?: unknown, valor_ate?: unknown) =>
  ({ id: "x", campo, operador, ...(valor !== undefined ? { valor } : {}), ...(valor_ate !== undefined ? { valor_ate } : {}) }) as never;

describe("Condicional dos fluxos", () => {
  it("etiqueta: sem diferença de maiúscula e acento; lista de valores = qualquer um", () => {
    expect(avaliarCondicao(c({ tipo: "etiqueta" }, "igual", "cliente vip"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "etiqueta" }, "igual", ["x", "RETRATO"]), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "etiqueta" }, "nao_contem", "vip"), base)).toBe(false);
    expect(avaliarCondicao(c({ tipo: "etiqueta" }, "vazio"), { ...base, etiquetas: [] })).toBe(true);
  });

  it("dia da semana por número ou nome, hora e data no fuso da organização", () => {
    expect(avaliarCondicao(c({ tipo: "dia_semana" }, "igual", "segunda"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "dia_semana" }, "igual", ["0", "6"]), base)).toBe(false);
    expect(avaliarCondicao(c({ tipo: "hora" }, "entre", "08:00", "18:00"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "hora" }, "maior", "13:00"), base)).toBe(false);
    expect(avaliarCondicao(c({ tipo: "data" }, "igual", "2026-10-05"), base)).toBe(true);
  });

  it("janela de 24h, número, e-mail e campo da ficha (número compara como número)", () => {
    expect(avaliarCondicao(c({ tipo: "janela_24h" }, "igual", "aberta"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "janela_24h" }, "igual", "aberta"), { ...base, ultimaEntradaEm: null })).toBe(false);
    expect(avaliarCondicao(c({ tipo: "numero" }, "contem", "99999"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "email" }, "igual", "maria@ex.com"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "campo_custom", chave: "idade" }, "maior", "{minimo}"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "campo_custom", chave: "idade" }, "maior", "100"), base)).toBe(false);
    expect(avaliarCondicao(c({ tipo: "campo_custom", chave: "vazio" }, "vazio"), base)).toBe(true);
    expect(avaliarCondicao(c({ tipo: "atendente" }, "vazio"), base)).toBe(true);
  });

  it("todas = E, qualquer = OU", () => {
    const sim = c({ tipo: "nome" }, "contem", "maria");
    const nao = c({ tipo: "nome" }, "contem", "joão");
    expect(avaliarCondicional({ regra: "todas", condicoes: [sim, nao] }, base)).toBe(false);
    expect(avaliarCondicional({ regra: "qualquer", condicoes: [sim, nao] }, base)).toBe(true);
  });
});
