import { describe, expect, it } from "vitest";

import { fusoDoContato } from "@/lib/campanhas/fuso";
import { renderizar } from "@/lib/campanhas/renderizador";
import { campoDoCatalogo, chaveDeArmazenamento } from "./campos-do-contato";
import { interpolarVariaveis, limparPontuacaoOrfa, resolverVariavel, type ContextoDoContato } from "./resolve";

/** Campos do contato + resolução (fork jhoow): fonte única, tratamento, idioma e fallback. */
const TARDE_LISBOA = new Date("2026-10-05T14:30:00Z"); // 15:30 em Lisboa
const ana: ContextoDoContato = {
  nome: "Ana Paula Ribeiro",
  telefone: "+351912345678",
  email: "ana@exemplo.pt",
  campos: { nome_empresa: "Clínica Sorriso", comentarios_google_maps: 87, cidade: "Porto" },
  quando: { agora: TARDE_LISBOA, fuso: "Europe/Lisbon" },
};

describe("equivalências — fonte única", () => {
  it("nome_completo = nome_profissional; whatsapp = numero; n_avaliacoes_gg = comentarios_google_maps", () => {
    expect(resolverVariavel("nome_completo", ana)).toBe("Ana Paula Ribeiro");
    expect(resolverVariavel("nome_profissional", ana)).toBe("Ana Paula Ribeiro");
    expect(resolverVariavel("whatsapp", ana)).toBe("+351912345678");
    expect(resolverVariavel("numero", ana)).toBe("+351912345678");
    // valor gravado na chave ANTIGA aparece pela nova, e vice-versa
    expect(resolverVariavel("n_avaliacoes_gg", ana)).toBe("87");
    const novo = { ...ana, campos: { n_avaliacoes_gg: 120 } };
    expect(resolverVariavel("comentarios_google_maps", novo)).toBe("120");
    expect(chaveDeArmazenamento("comentarios_google_maps")).toBe("n_avaliacoes_gg");
    expect(campoDoCatalogo("timezone")?.chave).toBe("fuso_horario");
    expect(campoDoCatalogo("constructor")).toBeNull();
  });

  it("fuso_horario da ficha (ou o antigo timezone) manda na janela e na saudação", () => {
    expect(fusoDoContato("+5511999990000", { fuso_horario: "Europe/Lisbon" }, "America/Sao_Paulo")).toBe("Europe/Lisbon");
    expect(fusoDoContato("+5511999990000", { timezone: "Europe/Madrid" }, "America/Sao_Paulo")).toBe("Europe/Madrid");
  });
});

describe("nome curto, tratamento e saudação", () => {
  it("nome_curto aceita nome composto digitado na ficha", () => {
    expect(resolverVariavel("nome_curto", ana)).toBe("Ana");
    expect(resolverVariavel("nome_curto", { ...ana, campos: { nome_curto: "Ana Paula" } })).toBe("Ana Paula");
  });

  it("tratamento só entra CONFIRMADO; incerto = só o nome", () => {
    const base = { ...ana, campos: { nome_curto: "Ana Paula", tratamento: "Dra." } };
    expect(resolverVariavel("nome_saudacao", base)).toBe("Ana Paula");
    expect(resolverVariavel("nome_saudacao", { ...base, campos: { ...base.campos, tratamento_confirmado: true } })).toBe("Dra. Ana Paula");
    expect(resolverVariavel("nome_saudacao", { ...base, campos: { ...base.campos, tratamento_confirmado: "sim" } })).toBe("Dra. Ana Paula");
    // revisão manual manda sobre o cálculo
    expect(resolverVariavel("nome_saudacao", { ...base, campos: { ...base.campos, nome_saudacao: "Doutora Ana" } })).toBe("Doutora Ana");
  });

  it("o exemplo: {saudacao_horario}, {nome_saudacao}, tudo bem?", () => {
    const ctx = { ...ana, campos: { nome_curto: "Ana Paula", tratamento: "Dra.", tratamento_confirmado: true } };
    expect(interpolarVariaveis("{saudacao_horario}, {nome_saudacao}, tudo bem?", ctx, { vazioQuandoFalta: true }).texto).toBe(
      "Boa tarde, Dra. Ana Paula, tudo bem?",
    );
  });

  it("saudação no IDIOMA da conversa (ficha), no fuso do contato", () => {
    const es = { ...ana, campos: { idioma_conversa: "es" } };
    expect(resolverVariavel("saudacao_horario", es)).toBe("Buenas tardes");
    expect(resolverVariavel("saudacao_horario", { ...ana, campos: { idioma_conversa: "en-GB" } })).toBe("Good afternoon");
    expect(resolverVariavel("saudacao_horario", { ...ana, quando: { ...ana.quando!, idioma: "nl" } })).toBe("Goedemiddag");
    expect(resolverVariavel("saudacao_horario", ana)).toBe("Boa tarde");
  });
});

describe("campos vazios: alternativo seguro ou erro visível — nunca {chave} nem undefined", () => {
  const semNome = { ...ana, nome: null, campos: {} };

  it("fluxo: o buraco some e a pontuação órfã vai junto", () => {
    expect(interpolarVariaveis("{saudacao_horario}, {nome_saudacao}, tudo bem?", semNome, { vazioQuandoFalta: true }).texto).toBe(
      "Boa tarde, tudo bem?",
    );
    expect(interpolarVariaveis("{nome_saudacao}, tudo bem?", { ...semNome, quando: undefined }, { vazioQuandoFalta: true }).texto).toBe("Tudo bem?");
    expect(interpolarVariaveis("Oi {nome_curto}!", semNome, { vazioQuandoFalta: true }).texto).toBe("Oi!");
    expect(interpolarVariaveis("Olá {cidade} tudo", semNome, { vazioQuandoFalta: true }).texto).toBe("Olá tudo");
  });

  it("alternativo {x|texto}", () => {
    expect(interpolarVariaveis("Oi {nome_curto|tudo bem}!", semNome, { vazioQuandoFalta: false }).texto).toBe("Oi tudo bem!");
    expect(interpolarVariaveis("Oi {{nome_curto|amigo}}!", ana, { vazioQuandoFalta: false }).texto).toBe("Oi Ana!");
  });

  it("a limpeza só mexe onde houve buraco", () => {
    expect(limparPontuacaoOrfa("Preço : R$ 10 , ok :)")).toBe("Preço : R$ 10 , ok :)");
  });

  it("campanha: sem valor e sem alternativo = falta visível (o envio barra)", () => {
    const r = renderizar("Oi {nome_saudacao}, {cidade}", { nome: null, campos: {} });
    expect(r.faltando).toEqual(["nome_saudacao", "cidade"]);
    expect(r.texto).toBe("Oi {nome_saudacao}, {cidade}");
    const alt = renderizar("Oi {nome_saudacao|tudo bem}", { nome: null, campos: {} });
    expect(alt).toMatchObject({ texto: "Oi tudo bem", faltando: [] });
  });

  it("booleano e datas viram texto legível", () => {
    expect(resolverVariavel("nao_contatar", { ...ana, campos: { nao_contatar: false } })).toBe("não");
    expect(resolverVariavel("ultima_interacao", { ...ana, ultimaInteracao: "2026-10-04T23:30:00Z" })).toBe("05/10/2026");
    expect(resolverVariavel("campanha_id", { ...ana, campanhaId: "c1" })).toBe("c1");
  });
});

describe("sem misturar destinatários", () => {
  it("cada contexto resolve só o seu", () => {
    const outro = { ...ana, nome: "Bruno Costa", campos: { nome_curto: "Bruno" } };
    const texto = "{nome_curto}";
    expect([ana, outro].map((c) => interpolarVariaveis(texto, c, { vazioQuandoFalta: true }).texto)).toEqual(["Ana", "Bruno"]);
  });
});
