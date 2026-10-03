import { describe, expect, it } from "vitest";
import { escolherFluxoDeEntrada, type FluxoComEntrada } from "./entrada";

const f = (id: string, gatilhos: string[], extra: Partial<FluxoComEntrada> = {}): FluxoComEntrada => ({
  id,
  nome: id,
  gatilhos,
  exato: false,
  primeiroContato: false,
  ...extra,
});

describe("entrada automática dos fluxos", () => {
  it("palavra contida, sem diferença de maiúscula e acento, como palavra inteira", () => {
    const fluxos = [f("preco", ["preço"])];
    expect(escolherFluxoDeEntrada(fluxos, "Qual o PRECO do retrato?", false)?.fluxo.id).toBe("preco");
    // "preço" dentro de "apreçoar" não é a palavra.
    expect(escolherFluxoDeEntrada(fluxos, "vou apreçoar depois", false)).toBeNull();
  });

  it("expressão de várias palavras casa dentro da mensagem", () => {
    expect(escolherFluxoDeEntrada([f("c", ["quero comprar"])], "oi, quero comprar 2", false)?.fluxo.id).toBe("c");
  });

  it("modo exato: só a mensagem inteira (pontuação nas pontas não conta)", () => {
    const fluxos = [f("menu", ["menu"], { exato: true })];
    expect(escolherFluxoDeEntrada(fluxos, "Menu!", false)?.fluxo.id).toBe("menu");
    expect(escolherFluxoDeEntrada(fluxos, "me manda o menu", false)).toBeNull();
  });

  it("ganha o fluxo com mais palavras presentes; palavra ganha de primeiro contato", () => {
    const fluxos = [f("a", ["retrato"]), f("b", ["retrato", "preço"]), f("novo", [], { primeiroContato: true })];
    expect(escolherFluxoDeEntrada(fluxos, "preço do retrato", true)).toEqual({ fluxo: fluxos[1], porque: "palavra" });
    expect(escolherFluxoDeEntrada(fluxos, "oi", true)).toEqual({ fluxo: fluxos[2], porque: "primeiro_contato" });
    expect(escolherFluxoDeEntrada(fluxos, "oi", false)).toBeNull();
  });
});
