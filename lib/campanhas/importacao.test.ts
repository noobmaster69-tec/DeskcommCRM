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
    expect(r.invalidas).toEqual([{ linha: 2, valor: "xx" }]);
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
