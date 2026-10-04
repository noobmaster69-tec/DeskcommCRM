import { describe, expect, it } from "vitest";

import {
  iniciaisDoCrm,
  normalizarSlug,
  slugDeCrm,
  updatesDePadraoDeCrm,
  validarArquivamentoDeCrm,
  validarNomeDeCrm,
  validarSlugDeCrm,
  type CrmEditavel,
} from "./crms";

function crm(parcial: Partial<CrmEditavel> & { id: string; name: string }): CrmEditavel {
  return { slug: parcial.id, is_default: false, archived_at: null, ...parcial };
}

const PADRAO = crm({ id: "padrao", name: "PADRÃO", is_default: true });
const GIRLY = crm({ id: "clientes-girly", name: "Clientes Girly" });
const VELHO = crm({ id: "europa-2025", name: "Europa 2025", archived_at: "2026-01-01T00:00:00Z" });

describe("iniciaisDoCrm", () => {
  it.each([
    ["Clientes Girly", "CG"],
    ["PADRÃO", "PA"],
    ["PA Advogados - EUROPA", "PA"],
    ["crm", "CR"],
    ["ótica central", "ÓC"],
    ["X", "X"],
    ["🚀 Lançamento", "LA"],
    ["   ", "?"],
  ])("%s → %s", (nome, esperado) => {
    expect(iniciaisDoCrm(nome)).toBe(esperado);
  });
});

describe("slugDeCrm", () => {
  it("deriva do nome sem acento", () => {
    expect(slugDeCrm("PA Advogados - EUROPA")).toBe("pa-advogados-europa");
  });
  it("nome só de emoji cai na raiz `crm`, não em `etapa`", () => {
    expect(slugDeCrm("🚀")).toBe("crm");
  });
  it("desvia de slug ocupado, arquivado inclusive", () => {
    expect(slugDeCrm("Europa 2025", [VELHO.slug])).toBe("europa-2025-2");
  });
});

describe("normalizarSlug", () => {
  it("aceita a barra da tela, caixa alta e acento", () => {
    expect(normalizarSlug("/Clientes-Girly")).toBe("clientes-girly");
    expect(normalizarSlug("Padrão")).toBe("padrao");
  });
  it("recusa o que não cabe no formato do banco", () => {
    expect(normalizarSlug("a")).toBeNull();
    expect(normalizarSlug("com/barra")).toBeNull();
    expect(normalizarSlug("x".repeat(41))).toBeNull();
  });
});

describe("validarNomeDeCrm", () => {
  it("recusa nome vazio e nome longo demais", () => {
    expect(validarNomeDeCrm("  ", [], null).ok).toBe(false);
    expect(validarNomeDeCrm("x".repeat(81), [], null).ok).toBe(false);
  });
  it("recusa duplicata lida como a mesma (acento e caixa)", () => {
    const r = validarNomeDeCrm("padrao", [PADRAO], null);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("«PADRÃO»") });
  });
  it("não colide consigo mesmo nem com arquivado", () => {
    expect(validarNomeDeCrm("PADRÃO", [PADRAO], PADRAO.id).ok).toBe(true);
    expect(validarNomeDeCrm("Europa 2025", [VELHO], null).ok).toBe(true);
  });
});

describe("validarSlugDeCrm", () => {
  it("recusa slug ocupado por arquivado, dizendo que está arquivado", () => {
    const r = validarSlugDeCrm("europa-2025", [VELHO], null);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("(arquivado)") });
  });
  it("recusa formato inválido", () => {
    expect(validarSlugDeCrm("Com Espaço", [], null).ok).toBe(false);
  });
  it("aceita o próprio slug na edição", () => {
    expect(validarSlugDeCrm("padrao", [PADRAO], PADRAO.id).ok).toBe(true);
  });
});

describe("validarArquivamentoDeCrm", () => {
  const funil = (over: Partial<{ name: string; is_default: boolean; fontesDeWebhook: string[]; regrasAtivas: string[] }> = {}) => ({
    name: "Ensaio",
    is_default: false,
    fontesDeWebhook: [] as string[],
    regrasAtivas: [] as string[],
    ...over,
  });
  it("o padrão não se arquiva", () => {
    expect(validarArquivamentoDeCrm(PADRAO, []).ok).toBe(false);
  });
  it("CRM com funis vivos SE ARQUIVA — os funis vão junto (Fase D, 9009)", () => {
    expect(validarArquivamentoDeCrm(GIRLY, [funil(), funil({ name: "Upsell" })]).ok).toBe(true);
  });
  it("funil que é o padrão da organização barra", () => {
    const r = validarArquivamentoDeCrm(GIRLY, [funil({ is_default: true })]);
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("funil padrão da organização") });
  });
  it("funil com formulário barra, citando o formulário", () => {
    expect(validarArquivamentoDeCrm(GIRLY, [funil({ fontesDeWebhook: ["Site"] })])).toEqual({
      ok: false,
      erro: expect.stringContaining("«Site»"),
    });
  });
  it("funil com automação ativa barra, citando a automação", () => {
    expect(validarArquivamentoDeCrm(GIRLY, [funil({ regrasAtivas: ["Boas-vindas"] })])).toEqual({
      ok: false,
      erro: expect.stringContaining("«Boas-vindas»"),
    });
  });
  it("CRM vazio e não padrão se arquiva", () => {
    expect(validarArquivamentoDeCrm(GIRLY, []).ok).toBe(true);
  });
});

describe("updatesDePadraoDeCrm", () => {
  it("libera o antigo ANTES de marcar o novo (índice único imediato)", () => {
    expect(updatesDePadraoDeCrm([PADRAO, GIRLY], GIRLY.id)).toEqual([
      { crmId: PADRAO.id, patch: { is_default: false } },
      { crmId: GIRLY.id, patch: { is_default: true } },
    ]);
  });
  it("pedir o que já é não escreve nada", () => {
    expect(updatesDePadraoDeCrm([PADRAO, GIRLY], PADRAO.id)).toEqual([]);
  });
  it("org sem padrão: só marca o novo", () => {
    expect(updatesDePadraoDeCrm([GIRLY], GIRLY.id)).toEqual([
      { crmId: GIRLY.id, patch: { is_default: true } },
    ]);
  });
});
