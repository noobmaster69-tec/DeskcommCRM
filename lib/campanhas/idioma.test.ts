import { describe, expect, it, vi } from "vitest";

import { blocoDeIdioma, camposParaIA, idiomaParaIA } from "@/lib/variables/contexto-da-ia";
import { idiomaDoEnvio, iniciarIdiomaDaExecucao } from "./idioma";

/** O idioma da campanha (fork jhoow): inicia, não sobrescreve, e vai para a IA. */
describe("idioma do envio", () => {
  it("conversa estabelecida > prospecção > campanha > perfil", () => {
    expect(idiomaDoEnvio({ idioma_conversa: "es", idioma_prospeccao: "pt-PT" }, "en", "pt-BR")).toBe("es");
    expect(idiomaDoEnvio({ idioma_prospeccao: "pt-PT" }, "en", "pt-BR")).toBe("pt-PT");
    expect(idiomaDoEnvio({}, "en", "pt-BR")).toBe("en");
    expect(idiomaDoEnvio({}, null, "pt-BR")).toBe("pt-BR");
    expect(idiomaDoEnvio(null, null, null)).toBeUndefined();
  });

  it("grava SÓ onde falta — a chave existente ganha (jsonb || atual)", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await iniciarIdiomaDaExecucao({ query }, { organizationId: "o", contactId: "c", conversationId: "v", idioma: "pt-PT" });
    expect(query).toHaveBeenCalledTimes(2);
    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
    for (const [sql, params] of calls) {
      expect(sql).toMatch(/jsonb_build_object\('idioma_prospeccao', \$3::text, 'idioma_conversa', \$3::text\) \|\| coalesce/);
      expect(sql).toMatch(/where organization_id = \$1 and id = \$2/);
      expect(params).toEqual(["o", expect.any(String), "pt-PT"]);
    }
  });

  it("sem idioma na campanha não escreve nada; falha não derruba", async () => {
    const query = vi.fn(async () => {
      throw new Error("x");
    });
    await iniciarIdiomaDaExecucao({ query }, { organizationId: "o", contactId: "c", conversationId: null, idioma: "" });
    expect(query).not.toHaveBeenCalled();
    await expect(iniciarIdiomaDaExecucao({ query }, { organizationId: "o", contactId: "c", conversationId: null, idioma: "es" })).resolves.toBeUndefined();
  });
});

describe("IA", () => {
  const ctx = {
    nome: "Ana Paula Ribeiro",
    telefone: "+351912345678",
    campos: { nome_curto: "Ana Paula", tratamento: "Dra.", tratamento_confirmado: true, profissao_singular: "dentista", vazio: "" },
  };

  it("recebe os campos preenchidos, já resolvidos", () => {
    const c = camposParaIA(ctx);
    expect(c).toMatchObject({ nome_curto: "Ana Paula", nome_saudacao: "Dra. Ana Paula", profissao_singular: "dentista" });
    expect(c).not.toHaveProperty("vazio");
    expect(c).not.toHaveProperty("whatsapp");
  });

  it("idioma: o do contexto da conversa manda; o bloco proíbe trocar por 'ok'", () => {
    expect(idiomaParaIA({ ...ctx, campos: { idioma_conversa: "es" } }, "pt-PT")).toBe("pt-PT");
    expect(idiomaParaIA({ ...ctx, campos: { idioma_conversa: "es" } }, null)).toBe("es");
    expect(idiomaParaIA(ctx, null)).toBeNull();
    expect(blocoDeIdioma("pt-PT")).toMatch(/Converse em pt-PT[\s\S]*"ok"[\s\S]*NÃO muda o idioma/);
    expect(blocoDeIdioma(null)).toBe("");
  });
});
