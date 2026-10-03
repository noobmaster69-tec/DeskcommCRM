import { describe, expect, it } from "vitest";
import { interpolar, valorDaVariavel, variaveisSugeridas } from "./variaveis";

const ctx = {
  nome: "Maria da Silva",
  telefone: "5511999999999",
  campos: { cidade: "Recife", idade: 31, ai: { response: "olá" }, "ai.score": "9" },
  ultimaMensagem: "quero o retrato",
};

describe("variáveis dos fluxos", () => {
  it("resolve contato, última mensagem e campos da ficha (inclusive com ponto)", () => {
    expect(valorDaVariavel("primeiro_nome", ctx)).toBe("Maria");
    expect(valorDaVariavel("telefone", ctx)).toBe("5511999999999");
    expect(valorDaVariavel("last_user_message", ctx)).toBe("quero o retrato");
    expect(valorDaVariavel("idade", ctx)).toBe("31");
    expect(valorDaVariavel("ai.response", ctx)).toBe("olá");
    expect(valorDaVariavel("ai.score", ctx)).toBe("9");
  });

  it("variável inexistente vira vazio — o cliente nunca recebe o {token} cru", () => {
    expect(interpolar("Oi {nome}, de {cidade}? {nada}", ctx).trim()).toBe("Oi Maria da Silva, de Recife?");
    expect(interpolar("Oi, {inexistente}!", ctx)).not.toContain("{");
  });

  it("aceita espaço dentro das chaves e não mexe em texto sem variável", () => {
    expect(interpolar("{ primeiro_nome }", ctx)).toBe("Maria");
    expect(interpolar("*promo* de 50% {}", ctx)).toBe("*promo* de 50% {}");
  });

  it("sugestões trazem as fixas e os campos da organização", () => {
    expect(variaveisSugeridas(["cidade"])).toEqual(["nome", "primeiro_nome", "telefone", "ultima_mensagem", "cidade"]);
  });
});
