import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { chaveDoCabecalho, lerLinhas, sugerirDestino, telefoneE164 } from "./importacao";
import { lerXlsx } from "./xlsx";

/** Item 1 (fork jhoow): a parte pura da importação de lista da campanha. */
describe("importar lista — mapeamento sugerido", () => {
  it("reconhece as colunas de sempre", () => {
    expect(sugerirDestino("Nome")).toBe("nome_profissional");
    expect(sugerirDestino("Empresa")).toBe("nome_empresa");
    expect(sugerirDestino("WhatsApp")).toBe("numero_contato");
    expect(sugerirDestino("Telefone celular")).toBe("numero_contato");
    expect(sugerirDestino("E-mail")).toBe("email");
    expect(sugerirDestino("Avaliações Google")).toBe("comentarios_google_maps");
  });

  it("o resto vira variável com chave limpa; nome reservado ganha sufixo", () => {
    expect(sugerirDestino("Bairro de atendimento")).toBe("var:bairro_de_atendimento");
    expect(chaveDoCabecalho("Primeiro nome")).toBe("primeiro_nome_importado");
    expect(sugerirDestino("###")).toBe("ignorar");
  });
});

describe("importar lista — telefone", () => {
  it("normaliza Brasil com e sem DDI e internacional", () => {
    expect(telefoneE164("(11) 99999-0000")).toBe("+5511999990000");
    expect(telefoneE164("55 11 99999-0000")).toBe("+5511999990000");
    expect(telefoneE164("+1 415 555 0100")).toBe("+14155550100");
    expect(telefoneE164("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("recusa lixo", () => {
    expect(telefoneE164("")).toBeNull();
    expect(telefoneE164("123")).toBeNull();
    expect(telefoneE164("abc")).toBeNull();
  });
});

describe("importar lista — linhas", () => {
  const cab = ["Nome", "Empresa", "Telefone", "Cidade"];
  const destinos = ["nome_profissional", "nome_empresa", "numero_contato", "var:cidade"] as const;

  it("separa válidas, inválidas (vermelho) e repetidas (fica a primeira)", () => {
    const r = lerLinhas(
      cab,
      [
        ["Ana", "Studio A", "11 99999-0001", "SP"],
        ["Bia", "", "xx", "RJ"],
        ["Ana 2", "", "+55 11 99999-0001", ""],
        ["Caio", "C Ltda", "21988887777", "Rio"],
      ],
      destinos,
    );
    expect(r.validas.map((l) => l.nome)).toEqual(["Ana", "Caio"]);
    expect(r.validas[0]).toMatchObject({
      linha: 1,
      empresa: "Studio A",
      telefone: "+5511999990001",
      campos: { nome_empresa: "Studio A", cidade: "SP" },
    });
    expect(r.invalidas).toEqual([{ linha: 2, valor: "xx", motivo: "Telefone fora do formato de envio" }]);
    expect(r.duplicadas).toEqual([{ linha: 3, telefone: "+5511999990001" }]);
  });

  it("coluna ignorada não entra", () => {
    const r = lerLinhas(cab, [["Ana", "A", "11999990001", "SP"]], ["ignorar", "ignorar", "numero_contato", "ignorar"]);
    expect(r.validas[0]).toMatchObject({ nome: null, empresa: null, campos: {} });
  });
});

describe("importar lista — XLSX", () => {
  function xlsx(folha: string, compartilhadas: string[]): Uint8Array {
    return zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Lista" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/sharedStrings.xml": strToU8(`<sst>${compartilhadas.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${folha}</sheetData></worksheet>`),
    });
  }

  it("lê strings compartilhadas, inline, números e buracos", () => {
    const bytes = xlsx(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Jo&amp;ão</t></is></c><c r="C2"><v>11999990001</v></c></row>',
      ["Nome", "Empresa", "Telefone"],
    );
    expect(lerXlsx(bytes)).toEqual([
      ["Nome", "Empresa", "Telefone"],
      ["Jo&ão", "", "11999990001"],
    ]);
  });

  it("arquivo que não é xlsx falha (a tela mostra o erro)", () => {
    expect(() => lerXlsx(zipSync({ "a.txt": strToU8("x") }))).toThrow();
  });
});

describe("importar lista — campos do contato (fork jhoow)", () => {
  it("cabeçalhos comuns caem no campo do catálogo", () => {
    expect(sugerirDestino("Cidade")).toBe("var:cidade");
    expect(sugerirDestino("País")).toBe("var:pais");
    expect(sugerirDestino("Website")).toBe("var:site_atual");
    expect(sugerirDestino("Google Maps URL")).toBe("var:google_maps_url");
    expect(sugerirDestino("Nota Google")).toBe("var:nota_avaliacoes_gg");
    expect(sugerirDestino("Especialidade")).toBe("var:especialidade");
    expect(sugerirDestino("Idioma")).toBe("var:idioma_prospeccao");
    expect(sugerirDestino("timezone")).toBe("var:fuso_horario");
    expect(sugerirDestino("Avaliações Google")).toBe("comentarios_google_maps");
  });

  it("avaliações vão para n_avaliacoes_gg (fonte única) e alias antigo vira a chave nova", () => {
    const r = lerLinhas(["Tel", "Reviews", "Fuso"], [["11999990001", "87 avaliações", "Europe/Lisbon"]], [
      "numero_contato",
      "comentarios_google_maps",
      "var:timezone",
    ]);
    expect(r.validas[0]!.campos).toEqual({ n_avaliacoes_gg: "87", fuso_horario: "Europe/Lisbon" });
  });

  it("nome composto e acento preservados; célula vazia não vira campo", () => {
    const r = lerLinhas(["Nome", "Tel", "Cidade"], [["  Ana Paula Ribeiro ", "11999990001", ""]], ["nome_profissional", "numero_contato", "var:cidade"]);
    expect(r.validas[0]).toMatchObject({ nome: "Ana Paula Ribeiro", campos: {} });
    const r2 = lerLinhas(["Nome", "Tel"], [["João Ávila", "11999990002"]], ["nome_profissional", "numero_contato"]);
    expect(r2.validas[0]!.nome).toBe("João Ávila");
  });
});

describe("modelo de 18 colunas (fork jhoow)", () => {
  const cab = [
    "nome_completo", "nome_curto", "nome_empresa", "whatsapp", "profissao_codigo", "especialidade", "tratamento_confirmado",
    "cidade", "pais", "idioma_contato", "site_atual", "origem_contato", "n_avaliacoes_gg", "nome_saudacao",
    "profissao_singular", "profissao_plural", "fuso_horario", "campanha_id",
  ];
  const destinos = cab.map((c) => sugerirDestino(c));

  it("as 18 colunas são reconhecidas pelo nome exato", () => {
    expect(destinos).toEqual([
      "nome_profissional", "var:nome_curto", "nome_empresa", "numero_contato", "var:profissao_codigo", "var:especialidade",
      "tratamento_confirmado", "var:cidade", "var:pais", "idioma_contato", "var:site_atual", "var:origem_contato",
      "comentarios_google_maps", "var:nome_saudacao", "var:profissao_singular", "var:profissao_plural", "var:fuso_horario",
      "campanha_id",
    ]);
  });

  it("linha completa: validações e conversões", () => {
    const r = lerLinhas(cab, [[
      "Jonatas Pereira Gomes", "Jonatas", "Studio Jonatas", "+351 912 345 678", "advogado", "direito tributário", "Dr.",
      "Lisboa", "pt", "pt_pt", "https://x.pt", "google_maps", "1.237", "Dr. Jonatas", "advogado", "advogados", "", "c-1",
    ]], destinos);
    expect(r.invalidas).toEqual([]);
    expect(r.validas[0]).toMatchObject({
      nome: "Jonatas Pereira Gomes",
      telefone: "+351912345678",
      locale: "pt-PT",
      campos: {
        nome_curto: "Jonatas",
        nome_empresa: "Studio Jonatas",
        tratamento: "Dr.",
        tratamento_confirmado: "true",
        pais: "PT",
        n_avaliacoes_gg: "1237",
        // fuso vazio → o do país
        fuso_horario: "Europe/Lisbon",
      },
    });
    expect(r.validas[0]!.campos).not.toHaveProperty("campanha_id");
  });

  it("obrigatórios com o motivo do parser; inválidos opcionais ficam vazios", () => {
    const r = lerLinhas(cab, [
      ["", "", "", "+5511999990001", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["Ana", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["Bia", "", "", "123", "", "", "", "", "Brasil", "português", "", "", "muitas", "", "", "", "Lua/Marte", ""],
      ["Caio", "", "", "+5511999990003", "", "", "", "", "XX", "", "", "", "", "", "", "", "Lua/Marte", ""],
      Array(18).fill(""),
    ], destinos);
    expect(r.invalidas.map((x) => [x.linha, x.motivo])).toEqual([
      [1, "Sem nome_completo"],
      [2, "Sem telefone no cadastro"],
      [3, "Telefone fora do formato de envio"],
    ]);
    expect(r.validas[0]!.campos).toMatchObject({ pais: "XX", fuso_horario: "UTC" });
    expect(r.vazias).toBe(1);
  });
});
