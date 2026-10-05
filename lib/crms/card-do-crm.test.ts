import { describe, expect, it } from "vitest";

import { PALETA_DO_AVATAR, corDoAvatar } from "./cor-do-avatar";
import { validarExclusaoDeCrm } from "./excluir";

describe("cor do avatar do CRM", () => {
  it("sem cor escolhida, sai da paleta e é sempre a mesma para o mesmo nome", () => {
    const a = corDoAvatar("Girly - Moda Feminina");
    expect(PALETA_DO_AVATAR).toContain(a);
    expect(corDoAvatar("Girly - Moda Feminina")).toBe(a);
    expect(corDoAvatar("  girly - moda feminina ")).toBe(a);
  });

  it("a cor escolhida no modal manda", () => {
    expect(corDoAvatar("Qualquer", "#123456")).toBe("#123456");
  });

  it("nomes diferentes usam a paleta toda", () => {
    const cores = new Set(Array.from({ length: 60 }, (_, i) => corDoAvatar(`CRM ${i}`)));
    expect(cores.size).toBe(PALETA_DO_AVATAR.length);
  });
});

describe("excluir CRM de vez", () => {
  const vazio = { nome: "Vendas", negocios: 0, fontesDeWebhook: [], regrasAtivas: [] };
  it("CRM sem negócio e sem nada apontando: pode", () => {
    expect(validarExclusaoDeCrm({ name: "Teste", is_default: false }, [vazio])).toEqual({ ok: true });
  });
  it("padrão, com negócio, com captura ou com automação: não pode", () => {
    expect(validarExclusaoDeCrm({ name: "P", is_default: true }, [vazio]).ok).toBe(false);
    const r = validarExclusaoDeCrm({ name: "T", is_default: false }, [{ ...vazio, negocios: 2 }]);
    expect(r.ok === false && r.erro).toMatch(/2 negócios\. Arquive/);
    expect(validarExclusaoDeCrm({ name: "T", is_default: false }, [{ ...vazio, fontesDeWebhook: ["Site"] }]).ok).toBe(false);
    expect(validarExclusaoDeCrm({ name: "T", is_default: false }, [{ ...vazio, regrasAtivas: ["Boas-vindas"] }]).ok).toBe(false);
  });
});
