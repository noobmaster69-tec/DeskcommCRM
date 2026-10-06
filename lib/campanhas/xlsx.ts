import { strFromU8, unzipSync } from "fflate";

/**
 * Lê a aba "Contatos" (ou a primeira com dados) de um .xlsx como matriz de textos (fork jhoow,
 * Campanhas › item 1). Sem biblioteca nova: o .xlsx é um zip de XMLs, e o
 * `fflate` (já instalado) abre o zip. Suporta strings compartilhadas, inline e
 * números; fórmulas entram pelo VALOR em cache. Células vazias viram "".
 */
function decodificar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function textoDoNo(xml: string): string {
  return decodificar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? "").join(""));
}

function colunaDaRef(ref: string): number {
  const letras = ref.replace(/\d+$/, "");
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function lerXlsx(bytes: Uint8Array): string[][] {
  const arquivos = unzipSync(bytes);
  const texto = (nome: string) => (arquivos[nome] ? strFromU8(arquivos[nome]!) : "");

  const compartilhadas = [...texto("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDoNo(m[1] ?? ""));

  // A aba "Contatos" (o modelo); sem ela, a PRIMEIRA aba com dados (fork jhoow).
  const rels = texto("xl/_rels/workbook.xml.rels");
  const caminhoDe = (rid: string) => {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels);
    return rel?.[1] ? `xl/${rel[1].replace(/^\/?xl\//, "")}` : null;
  };
  const abas = [...texto("xl/workbook.xml").matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g)].map((m) => ({
    nome: decodificar(m[1] ?? ""),
    caminho: caminhoDe(m[2] ?? ""),
  }));
  const comDados = (c: string | null) => !!c && /<row\b[^>]*>[\s\S]*?<c\b/.test(texto(c));
  const contatos = abas.find((a) => a.nome.trim().toLowerCase() === "contatos" && comDados(a.caminho));
  const caminho = contatos?.caminho ?? abas.find((a) => comDados(a.caminho))?.caminho ?? "xl/worksheets/sheet1.xml";
  const folha = texto(caminho);
  if (!folha) throw new Error("planilha vazia ou formato não reconhecido");

  const linhas: string[][] = [];
  for (const m of folha.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha: string[] = [];
    for (const c of (m[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1] ?? "";
      const corpo = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(atributos)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(atributos)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? "";
      let valor = "";
      if (tipo === "s") valor = compartilhadas[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textoDoNo(corpo);
      else valor = decodificar(v);
      const col = ref ? colunaDaRef(ref) : linha.length;
      while (linha.length < col) linha.push("");
      linha[col] = valor;
    }
    linhas.push(linha);
  }
  return linhas;
}
