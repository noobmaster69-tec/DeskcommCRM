import { describe, expect, it } from "vitest";

import { normalizePhoneBR } from "@/lib/webhooks/inbound";
import { COLUNAS_DO_MODELO, fusoFinal, generateImportTemplate, idiomaBcp47, inteiro, paisIso } from "./import-xlsx";
import { telefoneE164 } from "./importacao";
import { lerXlsx } from "./xlsx";

/** O modelo da importação (fork jhoow). */
describe("validações do modelo", () => {
  it("país ISO alfa-2, idioma BCP 47, inteiro", () => {
    expect(paisIso(" br ")).toBe("BR");
    expect(paisIso("Brasil")).toBeNull();
    expect(idiomaBcp47("pt_br")).toBe("pt-BR");
    expect(idiomaBcp47("en-GB")).toBe("en-GB");
    expect(idiomaBcp47("es")).toBe("es");
    expect(idiomaBcp47("português")).toBeNull();
    expect(inteiro("1.237")).toBe(1237);
    expect(inteiro("abc")).toBeNull();
  });

  it("fuso: válido fica; senão o do país; senão UTC", () => {
    expect(fusoFinal("Europe/Madrid", "PT")).toBe("Europe/Madrid");
    expect(fusoFinal("", "PT")).toBe("Europe/Lisbon");
    expect(fusoFinal("x", "UK")).toBe("Europe/London");
    expect(fusoFinal("x", "NL")).toBe("Europe/Amsterdam");
    expect(fusoFinal(undefined, "US")).toBe("America/New_York");
    expect(fusoFinal(undefined, "BR")).toBe("America/Sao_Paulo");
    expect(fusoFinal(undefined, "JP")).toBe("UTC");
  });

  it("o telefone da prévia é o MESMO parser do servidor (sem regra nova)", () => {
    for (const n of ["+351 912 345 678", "55 11 98765-4321", "(11) 98765-4321", "+34 612 345 678", "123", "351912345678"]) {
      expect(telefoneE164(n) === null).toBe(normalizePhoneBR(n) === null);
      if (normalizePhoneBR(n)) expect(normalizePhoneBR(telefoneE164(n)!)).toBe(normalizePhoneBR(n));
    }
  });
});

describe("arquivo modelo", () => {
  it("abre como planilha: aba Contatos com as 18 colunas + exemplo; aba Guia", () => {
    const linhas = lerXlsx(generateImportTemplate());
    expect(linhas[0]).toEqual(COLUNAS_DO_MODELO.map((c) => c.coluna));
    expect(linhas[0]).toHaveLength(18);
    expect(linhas[1]![0]).toBe("Jonatas Pereira Gomes");
  });
});
