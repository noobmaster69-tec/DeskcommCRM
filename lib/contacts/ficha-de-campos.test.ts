import { describe, expect, it } from "vitest";

import type { VariavelPersonalizada } from "@/lib/variables/definicoes";
import { montarFicha, prepararAlteracao, type ContatoDaFicha } from "./ficha-de-campos";

/** A ficha de campos do contato (fork jhoow): grupos, valores por contato, validação. */
const contato: ContatoDaFicha = {
  name: "Ana Paula Ribeiro",
  display_name: null,
  phone_number: "+351912345678",
  email: null,
  locale: null,
  source: "whatsapp",
  last_activity_at: "2026-10-04T10:00:00Z",
  custom_fields: { comentarios_google_maps: 87, interesse: "implante", tratamento: "Dra." },
};
const def = (p: Partial<VariavelPersonalizada>): VariavelPersonalizada => ({
  id: "d",
  key: "x",
  label: "X",
  type: "texto",
  options: [],
  default_value: null,
  position: 0,
  visible_in_profile: true,
  ...p,
});

describe("montarFicha", () => {
  const grupos = montarFicha(contato, [def({ key: "idioma_conversa", label: "Idioma", type: "selecao", options: ["pt-PT", "es"] })], {
    id: "c1",
    nome: "Reativação",
  });
  const campo = (k: string) => grupos.flatMap((g) => g.campos).find((c) => c.chave === k)!;

  it("separa Dados do contato e Campos personalizados", () => {
    expect(grupos.find((g) => g.id === "contato")?.secao).toBe("dados");
    expect(grupos.filter((g) => g.secao === "personalizados").map((g) => g.id)).toContain("profissional");
  });

  it("nativos vêm das colunas; o antigo comentarios_google_maps aparece em n_avaliacoes_gg", () => {
    expect(campo("nome_completo").valor).toBe("Ana Paula Ribeiro");
    expect(campo("whatsapp")).toMatchObject({ valor: "+351912345678", somenteLeitura: true });
    expect(campo("n_avaliacoes_gg").valor).toBe(87);
    expect(campo("campanha_id").efetivo).toBe("Reativação");
  });

  it("calculado mostra o automático sem gravar valor", () => {
    expect(campo("nome_curto")).toMatchObject({ valor: null, efetivo: "Ana", aceitaManual: true });
    expect(campo("nome_saudacao").efetivo).toBe("Ana"); // tratamento NÃO confirmado
  });

  it("a definição da empresa dá opções ao campo padrão; dado importado solto aparece em Outros", () => {
    expect(campo("idioma_conversa")).toMatchObject({ tipo: "selecao", opcoes: ["pt-PT", "es"], rotulo: "Idioma" });
    expect(campo("interesse")).toMatchObject({ origem: "importado", valor: "implante" });
  });
});

describe("prepararAlteracao", () => {
  it("valida pelo tipo e grava por contato; vazio limpa", () => {
    const a = prepararAlteracao(contato, { nome_curto: "Ana Paula", tratamento_confirmado: "sim", nota_avaliacoes_gg: "4,8", tratamento: "" }, []);
    expect(a.erros).toEqual([]);
    expect(a.customFields).toMatchObject({ nome_curto: "Ana Paula", tratamento_confirmado: true, nota_avaliacoes_gg: 4.8 });
    expect(a.customFields).not.toHaveProperty("tratamento");
  });

  it("escrever o campo novo apaga a chave antiga (um valor só)", () => {
    const a = prepararAlteracao(contato, { n_avaliacoes_gg: 90 }, []);
    expect(a.customFields).toMatchObject({ n_avaliacoes_gg: 90 });
    expect(a.customFields).not.toHaveProperty("comentarios_google_maps");
  });

  it("nativos vão para a coluna; nome marca edição manual", () => {
    const a = prepararAlteracao(contato, { nome_completo: "Ana Paula Ribeiro Lopes", email: "ana@x.pt", idioma_contato: "pt-PT" }, []);
    expect(a.colunas).toEqual({ name: "Ana Paula Ribeiro Lopes", email: "ana@x.pt", locale: "pt-PT" });
    expect(a.nomeManual).toBe(true);
    expect(a.customFields).toBeNull();
  });

  it("recusa somente-leitura, formato errado e opção fora da lista", () => {
    const defs = [def({ key: "idioma_conversa", type: "selecao", options: ["pt-PT"] })];
    const a = prepararAlteracao(
      contato,
      { whatsapp: "+1", email: "nao-e-email", proximo_followup: "03/12/2026", fuso_horario: "Lisboa", idioma_conversa: "fr" },
      defs,
    );
    expect(a.erros.map((e) => [e.chave, e.codigo])).toEqual([
      ["whatsapp", "somente_leitura"],
      ["email", "invalido"],
      ["proximo_followup", "invalido"],
      ["fuso_horario", "invalido"],
      ["idioma_conversa", "opcao"],
    ]);
  });

  it("chave reservada não vira campo", () => {
    expect(prepararAlteracao(contato, { saudacao: "x" }, []).erros[0]?.codigo).toBe("desconhecido");
  });
});
