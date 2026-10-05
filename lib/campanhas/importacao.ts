/**
 * IMPORTAR LISTA DE CONTATOS para a campanha (fork jhoow, Campanhas › item 1) —
 * a parte PURA: o que cada coluna da planilha vira, a validação de telefone e
 * os duplicados. Roda igual no navegador (prévia) e no servidor (gravação).
 */
import { CHAVE_DE_VARIAVEL, NOMES_RESERVADOS } from "@/lib/variables/sistema";

/** Teto de linhas por importação: o mesmo limite de contatos de uma campanha. */
export const MAX_LINHAS_IMPORTADAS = 5000;

/** O que uma coluna pode representar. `var:<chave>` = variável (existente ou nova); `ignorar` = não entra. */
export type DestinoDaColuna =
  | "nome_profissional"
  | "nome_empresa"
  | "numero_contato"
  | "email"
  | "comentarios_google_maps"
  | "ignorar"
  | `var:${string}`;

export const DESTINOS_FIXOS: ReadonlyArray<{ valor: DestinoDaColuna; rotulo: string }> = [
  { valor: "nome_profissional", rotulo: "Nome do profissional" },
  { valor: "nome_empresa", rotulo: "Nome da empresa" },
  { valor: "numero_contato", rotulo: "Número do contato" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "comentarios_google_maps", rotulo: "Avaliações no Google Maps" },
  { valor: "ignorar", rotulo: "Ignorar esta coluna" },
];

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** A chave de variável sugerida para um cabeçalho ("Cidade da loja" → "cidade_da_loja"). */
export function chaveDoCabecalho(cabecalho: string): string {
  const k = semAcento(cabecalho)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);
  if (!k || !CHAVE_DE_VARIAVEL.test(k)) return "";
  return NOMES_RESERVADOS.has(k) ? `${k}_importado` : k;
}

/** O destino sugerido para cada cabeçalho — o operador confere e troca no mapeamento visual. */
export function sugerirDestino(cabecalho: string, variaveisExistentes: readonly string[] = []): DestinoDaColuna {
  const c = semAcento(cabecalho);
  if (/^(nome|name|nome[ _]?(do[ _]?)?profissional|nome[ _]?completo|contato|responsavel)$/.test(c)) return "nome_profissional";
  if (/(empresa|company|negocio|estabelecimento|loja|razao social|nome[ _]?fantasia)/.test(c)) return "nome_empresa";
  if (/(telefone|celular|whats|fone|phone|numero|n[ºo°]? ?contato)/.test(c)) return "numero_contato";
  if (/(e-?mail)/.test(c)) return "email";
  if (/(avalia|review|coment|google)/.test(c)) return "comentarios_google_maps";
  const chave = chaveDoCabecalho(cabecalho);
  if (chave && variaveisExistentes.includes(chave)) return `var:${chave}`;
  return chave ? `var:${chave}` : "ignorar";
}

/**
 * Telefone → E.164, a MESMA régua do servidor (`normalizePhoneBR`): "+" na
 * frente = internacional como está; 12–13 dígitos começando por 55 = Brasil com
 * DDI; 10–11 dígitos = Brasil sem DDI; "00" na frente = discagem internacional.
 */
export function telefoneE164(bruto: string): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  let digitos = t.replace(/\D/g, "");
  if (t.startsWith("+")) return /^\d{8,15}$/.test(digitos) ? `+${digitos}` : null;
  if (digitos.startsWith("00")) {
    digitos = digitos.slice(2);
    return /^\d{8,15}$/.test(digitos) ? `+${digitos}` : null;
  }
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return `+${digitos}`;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return null;
}

export interface LinhaImportada {
  /** Número da linha na planilha (1 = primeira linha de dados). */
  linha: number;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  email: string | null;
  /** Variáveis (custom_fields) — inclui nome_empresa e comentarios_google_maps. */
  campos: Record<string, string>;
}

export interface ResultadoDaLeitura {
  validas: LinhaImportada[];
  /** Linhas sem telefone válido — destacadas em vermelho na prévia. */
  invalidas: Array<{ linha: number; valor: string }>;
  /** Linhas com o mesmo telefone de uma linha anterior (fica a primeira). */
  duplicadas: Array<{ linha: number; telefone: string }>;
}

/** Aplica o mapeamento às linhas da planilha. */
export function lerLinhas(
  cabecalho: readonly string[],
  linhas: readonly (readonly string[])[],
  destinos: readonly DestinoDaColuna[],
): ResultadoDaLeitura {
  const validas: LinhaImportada[] = [];
  const invalidas: ResultadoDaLeitura["invalidas"] = [];
  const duplicadas: ResultadoDaLeitura["duplicadas"] = [];
  const vistos = new Set<string>();
  linhas.slice(0, MAX_LINHAS_IMPORTADAS).forEach((celulas, i) => {
    const numero = i + 1;
    const l: LinhaImportada = { linha: numero, nome: null, empresa: null, telefone: null, email: null, campos: {} };
    let telefoneBruto = "";
    cabecalho.forEach((_, c) => {
      const destino = destinos[c] ?? "ignorar";
      const valor = (celulas[c] ?? "").trim();
      if (!valor || destino === "ignorar") return;
      if (destino === "nome_profissional") l.nome = valor.slice(0, 200);
      else if (destino === "nome_empresa") {
        l.empresa = valor.slice(0, 200);
        l.campos.nome_empresa = l.empresa;
      } else if (destino === "numero_contato") telefoneBruto = valor;
      else if (destino === "email") l.email = valor.slice(0, 254);
      else if (destino === "comentarios_google_maps") l.campos.comentarios_google_maps = valor.replace(/[^\d]/g, "") || valor;
      else if (destino.startsWith("var:")) l.campos[destino.slice(4)] = valor.slice(0, 1000);
    });
    const tel = telefoneE164(telefoneBruto);
    if (!tel) {
      invalidas.push({ linha: numero, valor: telefoneBruto });
      return;
    }
    if (vistos.has(tel)) {
      duplicadas.push({ linha: numero, telefone: tel });
      return;
    }
    vistos.add(tel);
    l.telefone = tel;
    validas.push(l);
  });
  return { validas, invalidas, duplicadas };
}

/** O que fazer quando o telefone já é de um contato do CRM. */
export const POLITICAS_DE_DUPLICATA = ["pular", "atualizar", "manter"] as const;
export type PoliticaDeDuplicata = (typeof POLITICAS_DE_DUPLICATA)[number];
