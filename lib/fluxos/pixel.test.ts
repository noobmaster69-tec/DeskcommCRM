import { describe, expect, it } from "vitest";
import { lerValorMonetario } from "./pixel";

describe("lerValorMonetario — o valor do bloco Pixel", () => {
  it.each([
    ["320", 320],
    ["R$ 29,90", 29.9],
    ["29.90", 29.9],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["R$1.500", 1500],
    ["1.500.000", 1500000],
    ["US$ 59", 59],
  ])("%s → %s", (texto, esperado) => {
    expect(lerValorMonetario(texto)).toBe(esperado);
  });

  it("sem número devolve null", () => {
    expect(lerValorMonetario("")).toBeNull();
    expect(lerValorMonetario("grátis")).toBeNull();
  });
});
