import { describe, expect, it } from "vitest";

import {
  GLOBAIS_VAZIOS,
  casaCondicao,
  casaPalavraChave,
  escolherPalavraChave,
  salvarDisparosSchema,
  semGatilhoGlobal,
  type PalavraChave,
} from "./disparos";
import { escolherEntrada, type FluxoComEntrada } from "./entrada";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const palavra = (n: number, extra: Partial<PalavraChave> = {}): PalavraChave => ({
  id: ID(n),
  name: `Palavra-chave ${n}`,
  fluxo_id: ID(100 + n),
  logic_operator: "or",
  conditions: [{ operador: "contem", valor: "preço" }],
  active: true,
  ...extra,
});

describe("condições da palavra-chave (item 12)", () => {
  it("cada operador, sem acento e sem caixa", () => {
    expect(casaCondicao("Qual o PRECO?", { operador: "contem", valor: "preço" })).toBe(true);
    expect(casaCondicao("oi", { operador: "igual", valor: "Oi!" })).toBe(true);
    expect(casaCondicao("oi tudo bem", { operador: "igual", valor: "oi" })).toBe(false);
    expect(casaCondicao("oi", { operador: "diferente", valor: "tchau" })).toBe(true);
    expect(casaCondicao("quero comprar", { operador: "nao_contem", valor: "preço" })).toBe(true);
    expect(casaCondicao("Olá, bom dia", { operador: "comeca", valor: "ola" })).toBe(true);
    expect(casaCondicao("me manda o catálogo", { operador: "termina", valor: "catalogo" })).toBe(true);
  });

  it("qualquer = OR, todas = AND", () => {
    const conds = [
      { operador: "contem" as const, valor: "preço" },
      { operador: "contem" as const, valor: "frete" },
    ];
    expect(casaPalavraChave("qual o preço?", { logic_operator: "or", conditions: conds })).toBe(true);
    expect(casaPalavraChave("qual o preço?", { logic_operator: "and", conditions: conds })).toBe(false);
    expect(casaPalavraChave("preço e frete?", { logic_operator: "and", conditions: conds })).toBe(true);
  });

  it("vale a primeira ATIVA, com fluxo, na ordem da tela", () => {
    const lista = [palavra(1, { active: false }), palavra(2, { fluxo_id: null }), palavra(3), palavra(4)];
    expect(escolherPalavraChave(lista, "e o preço?")?.id).toBe(ID(3));
    expect(escolherPalavraChave(lista, "")).toBeNull();
  });
});

describe("gatilhos globais", () => {
  it("o badge 'Sem fluxos' aparece só com os quatro vazios", () => {
    expect(semGatilhoGlobal(GLOBAIS_VAZIOS)).toBe(true);
    expect(semGatilhoGlobal({ ...GLOBAIS_VAZIOS, attendance_closed_fluxo_id: ID(9) })).toBe(false);
  });

  it("o corpo do Salvar recusa palavra sem condição, horas fora de 1..720 e id repetido", () => {
    expect(salvarDisparosSchema.safeParse({ palavras: [palavra(1)], globais: GLOBAIS_VAZIOS }).success).toBe(true);
    expect(salvarDisparosSchema.safeParse({ palavras: [palavra(1, { conditions: [] })], globais: GLOBAIS_VAZIOS }).success).toBe(false);
    expect(
      salvarDisparosSchema.safeParse({ palavras: [], globais: { ...GLOBAIS_VAZIOS, default_response_hours: 0 } }).success,
    ).toBe(false);
    expect(salvarDisparosSchema.safeParse({ palavras: [palavra(1), palavra(1)], globais: GLOBAIS_VAZIOS }).success).toBe(false);
  });
});

describe("a ordem das portas de entrada", () => {
  const fluxoComGatilho: FluxoComEntrada = { id: "f-gatilho", nome: "x", gatilhos: ["preço"], exato: false, primeiroContato: true };
  const disparos = {
    palavras: [palavra(1)],
    globais: { ...GLOBAIS_VAZIOS, welcome_fluxo_id: ID(50), default_response_fluxo_id: ID(60) },
  };

  it("palavra-chave da tela Disparos vem antes da palavra-gatilho do fluxo", () => {
    expect(escolherEntrada(disparos, [fluxoComGatilho], "qual o preço?", false)).toEqual({
      fluxoId: ID(101),
      porque: "disparo_palavra_chave",
    });
    expect(escolherEntrada({ ...disparos, palavras: [] }, [fluxoComGatilho], "qual o preço?", false)).toEqual({
      fluxoId: "f-gatilho",
      porque: "palavra",
    });
  });

  it("boas-vindas na primeira mensagem, antes do 'primeiro contato' do fluxo", () => {
    expect(escolherEntrada(disparos, [fluxoComGatilho], "oi", true)).toEqual({ fluxoId: ID(50), porque: "boas_vindas" });
  });

  it("nada casou: resposta padrão", () => {
    expect(escolherEntrada(disparos, [fluxoComGatilho], "oi", false)).toEqual({ fluxoId: ID(60), porque: "resposta_padrao" });
    expect(escolherEntrada({ palavras: [], globais: GLOBAIS_VAZIOS }, [], "oi", false)).toBeNull();
  });
});
