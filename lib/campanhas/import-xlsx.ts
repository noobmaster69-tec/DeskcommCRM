import { strToU8, zipSync } from "fflate";

import { fusoValido } from "./fuso";

/**
 * O MODELO DE PLANILHA da importação de lista (fork jhoow): as 18 colunas
 * reconhecidas pelo NOME EXATO, as validações de cada uma e o arquivo modelo
 * (aba "Contatos" + aba "Guia"). Puro: roda no navegador (prévia) e no
 * servidor. O TELEFONE não é validado aqui — vai para o parser E.164 que já
 * existe (`telefoneE164` / `normalizePhoneBR`).
 */

/** Destino de cada coluna do modelo (o mesmo vocabulário de `DestinoDaColuna`). */
export const COLUNAS_DO_MODELO = [
  { coluna: "nome_completo", destino: "nome_profissional", rotulo: "Nome completo", exemplo: "Jonatas Pereira Gomes", obrigatoria: true },
  { coluna: "nome_curto", destino: "var:nome_curto", rotulo: "Nome curto", exemplo: "Jonatas" },
  { coluna: "nome_empresa", destino: "nome_empresa", rotulo: "Nome da empresa", exemplo: "Studio Jonatas Retratos" },
  { coluna: "whatsapp", destino: "numero_contato", rotulo: "WhatsApp", exemplo: "+351 912 345 678", obrigatoria: true },
  { coluna: "profissao_codigo", destino: "var:profissao_codigo", rotulo: "Código da profissão", exemplo: "advogado" },
  { coluna: "especialidade", destino: "var:especialidade", rotulo: "Especialidade", exemplo: "direito tributário" },
  { coluna: "tratamento_confirmado", destino: "tratamento_confirmado", rotulo: "Tratamento confirmado", exemplo: "Dr." },
  { coluna: "cidade", destino: "var:cidade", rotulo: "Cidade", exemplo: "São Paulo" },
  { coluna: "pais", destino: "var:pais", rotulo: "País (ISO, ex.: BR, PT)", exemplo: "BR" },
  { coluna: "idioma_contato", destino: "idioma_contato", rotulo: "Idioma do contato", exemplo: "pt-BR" },
  { coluna: "site_atual", destino: "var:site_atual", rotulo: "Site atual", exemplo: "https://studiojonatas.com" },
  { coluna: "origem_contato", destino: "var:origem_contato", rotulo: "Origem do contato", exemplo: "google_maps" },
  { coluna: "n_avaliacoes_gg", destino: "comentarios_google_maps", rotulo: "Avaliações no Google", exemplo: "237" },
  { coluna: "nome_saudacao", destino: "var:nome_saudacao", rotulo: "Nome na saudação", exemplo: "Dr. Jonatas" },
  { coluna: "profissao_singular", destino: "var:profissao_singular", rotulo: "Profissão (singular)", exemplo: "advogado" },
  { coluna: "profissao_plural", destino: "var:profissao_plural", rotulo: "Profissão (plural)", exemplo: "advogados" },
  { coluna: "fuso_horario", destino: "var:fuso_horario", rotulo: "Fuso horário (IANA)", exemplo: "America/Sao_Paulo" },
  { coluna: "campanha_id", destino: "campanha_id", rotulo: "Campanha", exemplo: "" },
] as const;

export type ColunaDoModelo = (typeof COLUNAS_DO_MODELO)[number]["coluna"];

/** O destino de um cabeçalho que bate EXATAMENTE (sem diferenciar maiúscula/espaço nas pontas) com o modelo. */
export function destinoDoModelo(cabecalho: string): (typeof COLUNAS_DO_MODELO)[number]["destino"] | null {
  const c = cabecalho.trim().toLowerCase();
  return COLUNAS_DO_MODELO.find((x) => x.coluna === c)?.destino ?? null;
}

/** País → fuso padrão, quando o `fuso_horario` vem vazio ou inválido. */
export const FUSO_DO_PAIS: Readonly<Record<string, string>> = {
  BR: "America/Sao_Paulo",
  PT: "Europe/Lisbon",
  UK: "Europe/London",
  GB: "Europe/London",
  ES: "Europe/Madrid",
  NL: "Europe/Amsterdam",
  US: "America/New_York",
};
export const FUSO_SEM_PAIS = "UTC";

/** ISO 3166 alfa-2 (duas letras). Inválido = `null` (o campo fica vazio). */
export function paisIso(bruto: string): string | null {
  const p = bruto.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(p) ? p : null;
}

/** BCP 47 (pt-BR, pt-PT, en-GB, es-ES, nl-NL…). Aceita "pt_BR". Inválido = `null`. */
export function idiomaBcp47(bruto: string): string | null {
  const m = /^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{2}|\d{3}))?$/.exec(bruto.trim());
  if (!m) return null;
  return m[2] ? `${m[1]!.toLowerCase()}-${m[2].toUpperCase()}` : m[1]!.toLowerCase();
}

/** Inteiro (237, "1.234", "1 234"). Falhou = `null`. */
export function inteiro(bruto: string): number | null {
  const d = bruto.replace(/[\s.,]/g, "");
  return /^\d{1,9}$/.test(d) ? Number(d) : null;
}

/** O fuso final: o da coluna se for IANA válido; senão o do país; senão UTC. */
export function fusoFinal(fuso: string | undefined, pais: string | null | undefined): string {
  if (fuso && fusoValido(fuso.trim())) return fuso.trim();
  return (pais && FUSO_DO_PAIS[pais]) || FUSO_SEM_PAIS;
}

// ── O arquivo modelo (XLSX mínimo, sem biblioteca: o xlsx é um zip de XMLs) ──

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colunaLetra(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function folha(linhas: readonly (readonly string[])[]): string {
  const rows = linhas
    .map(
      (l, r) =>
        `<row r="${r + 1}">${l
          .map((v, c) => `<c r="${colunaLetra(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`)
          .join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

const GUIA: readonly string[][] = [
  ["Como preencher a planilha"],
  ["1. Use a aba Contatos. A linha 1 é o cabeçalho: não mude o nome das colunas."],
  ["2. Obrigatórias: nome_completo e whatsapp. As outras podem ficar vazias."],
  ["3. whatsapp: número completo com DDI, de preferência começando por + (ex.: +351 912 345 678, +55 11 98765-4321)."],
  ["   Número estrangeiro precisa de + ou 00. Sem DDI, o número é tratado como do Brasil."],
  ["4. tratamento_confirmado: Dr., Dra., Sr., Sra. — só preencha quando tiver certeza; vazio = só o nome."],
  ["5. pais: código de 2 letras (BR, PT, ES, NL, US). idioma_contato: pt-BR, pt-PT, en-GB, en-US, es-ES, nl-NL."],
  ["6. fuso_horario: nome IANA (America/Sao_Paulo, Europe/Lisbon). Vazio = o fuso do país."],
  ["7. n_avaliacoes_gg: só o número (ex.: 237)."],
  ["8. campanha_id pode ficar vazio: a lista entra na campanha em que você está importando."],
  ["9. Coluna extra (fora destas 18) pode virar variável personalizada na hora da importação."],
  ["10. Até 5.000 linhas por arquivo. Célula vazia não apaga dado que o contato já tem."],
];

/** O XLSX modelo: aba "Contatos" (as 18 colunas + 1 linha de exemplo) e aba "Guia". */
export function generateImportTemplate(): Uint8Array {
  const contatos = [COLUNAS_DO_MODELO.map((c) => c.coluna), COLUNAS_DO_MODELO.map((c) => c.exemplo)];
  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Contatos" sheetId="1" r:id="rId1"/><sheet name="Guia" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
  return zipSync({
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/worksheets/sheet1.xml": strToU8(folha(contatos)),
    "xl/worksheets/sheet2.xml": strToU8(folha(GUIA)),
  });
}
