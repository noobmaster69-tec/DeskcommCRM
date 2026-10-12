import { describe, expect, it } from "vitest";
import { linguaDe, localeDoTelefone, mesmaLingua, nomeDaLingua, normalizarLocale } from "./idiomas";
import { idiomaConhecido, type ContatoDoIdioma } from "./locale";

describe("idioma pelo DDI", () => {
  it.each([
    ["+1 939 230 1037", "en-US"],
    ["+447700900123", "en-GB"],
    ["+351912345678", "pt-PT"],
    ["+5519920425772", "pt-BR"],
    ["+34612345678", "es-ES"],
    ["+31612345678", "nl-NL"],
    ["+33612345678", "fr-FR"],
    ["+4915112345678", "de-DE"],
    ["+393123456789", "it-IT"],
    ["+5215512345678", "es-MX"],
    ["+5491112345678", "es-AR"],
  ])("%s → %s", (tel, locale) => {
    expect(localeDoTelefone(tel)).toBe(locale);
  });
  it("+351 não cai no +35x de outro país nem no +3 genérico", () => {
    expect(localeDoTelefone("351912345678")).toBe("pt-PT");
  });
  it("DDI fora do mapa e número curto devolvem null", () => {
    expect(localeDoTelefone("+81312345678")).toBeNull();
    expect(localeDoTelefone("1234")).toBeNull();
    expect(localeDoTelefone(null)).toBeNull();
  });
});

describe("normalizarLocale", () => {
  it.each([
    ["en", "en-US"],
    ["EN_us", "en-US"],
    ["pt-br", "pt-BR"],
    ["Inglês", "en-US"],
    ["Português de Portugal", "pt-PT"],
    ["espanhol (Español)", "es-ES"],
    ["klingon", null],
    ["", null],
  ])("%s → %s", (entrada, saida) => {
    expect(normalizarLocale(entrada)).toBe(saida);
  });
  it("compara pela língua: pt-BR e pt-PT não se traduzem entre si", () => {
    expect(mesmaLingua("pt-BR", "pt-PT")).toBe(true);
    expect(mesmaLingua("en-US", "pt-BR")).toBe(false);
    expect(mesmaLingua(null, null)).toBe(false);
    expect(linguaDe("en-GB")).toBe("en");
    expect(nomeDaLingua("en-GB")).toBe("inglês");
  });
});

const base: ContatoDoIdioma = {
  id: "c1",
  organization_id: "o1",
  locale: null,
  locale_source: null,
  locale_detected: null,
  phone_number: null,
  custom_fields: null,
};

describe("a cascata do idioma do contato", () => {
  it("manual vence o DDI", () => {
    expect(idiomaConhecido({ ...base, locale: "es-ES", locale_source: "manual", phone_number: "+5519920425772" })).toEqual({
      locale: "es-ES",
      source: "manual",
    });
  });
  it("o campo idioma_contato da ficha é manual e vence tudo", () => {
    expect(
      idiomaConhecido({ ...base, custom_fields: { idioma_contato: "Inglês" }, locale: "pt-BR", locale_source: "ddi" }),
    ).toEqual({ locale: "en-US", source: "manual" });
  });
  it("locale antigo sem origem é tratado como escolha de gente", () => {
    expect(idiomaConhecido({ ...base, locale: "pt-PT", phone_number: "+5519920425772" })).toEqual({
      locale: "pt-PT",
      source: "manual",
    });
  });
  it("sem manual, o DDI decide — e vence a detecção", () => {
    expect(
      idiomaConhecido({ ...base, locale: "de-DE", locale_source: "detected", locale_detected: "de-DE", phone_number: "+447700900123" }),
    ).toEqual({ locale: "en-GB", source: "ddi" });
  });
  it("sem manual nem DDI, vale a detecção em cache", () => {
    expect(idiomaConhecido({ ...base, locale_detected: "fr-FR", phone_number: "+81312345678" })).toEqual({
      locale: "fr-FR",
      source: "detected",
    });
  });
  it("nada conhecido: null, e a detecção pelo modelo fica a cargo de quem resolve", () => {
    expect(idiomaConhecido(base)).toEqual({ locale: null, source: null });
  });
});
