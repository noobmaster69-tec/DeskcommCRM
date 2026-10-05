/**
 * IMPORTAR LISTA DE CONTATOS para a campanha (fork jhoow, Campanhas › item 1) —
 * a parte PURA: o que cada coluna da planilha vira, a validação de telefone e
 * os duplicados. Roda igual no navegador (prévia) e no servidor (gravação).
 */
import { CAMPOS_DO_CONTATO, campoDoCatalogo } from "@/lib/variables/campos-do-contato";
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

/**
 * Os CAMPOS DO CATÁLOGO que uma coluna pode preencher (fork jhoow) — os mesmos
 * da ficha do contato. Ficam como `var:<chave>`; nome, telefone e e-mail têm
 * destino próprio acima.
 */
export const DESTINOS_DO_CATALOGO: ReadonlyArray<{ valor: DestinoDaColuna; rotulo: string }> = CAMPOS_DO_CONTATO.filter(
  (c) => (c.origem === "padrao" || c.aceitaManual) && c.chave !== "nome_empresa" && c.chave !== "n_avaliacoes_gg",
).map((c) => ({ valor: `var:${c.chave}` as DestinoDaColuna, rotulo: c.rotulo }));

/** Sinônimos de cabeçalho → campo do catálogo (sem acento, minúsculo). */
const SINONIMOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(cidade|city|municipio|localidade)$/, "cidade"],
  [/^(pais|country)$/, "pais"],
  [/^(site|website|site atual|url do site|pagina)$/, "site_atual"],
  [/(maps.*(url|link)|link.*maps|google maps url)/, "google_maps_url"],
  [/^(nota|rating|nota (no )?google|estrelas)$/, "nota_avaliacoes_gg"],
  [/^(especialidade|specialty|area)$/, "especialidade"],
  [/^(profissao|profession|ocupacao|cargo)$/, "profissao_singular"],
  [/^(tratamento|titulo|title)$/, "tratamento"],
  [/^(idioma|lingua|language)$/, "idioma_prospeccao"],
  [/^(fuso|fuso horario|timezone|time zone)$/, "fuso_horario"],
  [/^(nome curto|apelido|como chamar)$/, "nome_curto"],
  [/^(origem|fonte|source)$/, "origem_contato"],
  [/^(status)$/, "status_contato"],
  [/^(observacao|observacoes|obs|nota interna)$/, "observacao_personalizacao"],
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
  // Os sinônimos do catálogo primeiro: "Google Maps URL" e "Nota Google" não são avaliações.
  for (const [rx, campo] of SINONIMOS) if (rx.test(c)) return `var:${campo}`;
  if (/^(nome|name|nome[ _]?(do[ _]?)?profissional|nome[ _]?completo|contato|responsavel)$/.test(c)) return "nome_profissional";
  if (/(empresa|company|negocio|estabelecimento|loja|razao social|nome[ _]?fantasia)/.test(c)) return "nome_empresa";
  if (/(telefone|celular|whats|fone|phone|numero|n[ºo°]? ?contato)/.test(c)) return "numero_contato";
  if (/(e-?mail)/.test(c)) return "email";
  if (/(avalia|review|coment|google)/.test(c)) return "comentarios_google_maps";
  const chave = chaveDoCabecalho(cabecalho);
  if (chave && variaveisExistentes.includes(chave)) return `var:${chave}`;
  // Cabeçalho que já é a chave de um campo do catálogo (ou alias antigo) vai para ele.
  const doCatalogo = chave ? campoDoCatalogo(chave) : null;
  if (doCatalogo) return `var:${doCatalogo.chave}`;
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
      // Fonte única: as avaliações vão para `n_avaliacoes_gg` (o `{comentarios_google_maps}` lê o mesmo valor).
      else if (destino === "comentarios_google_maps") l.campos.n_avaliacoes_gg = valor.replace(/[^\d]/g, "") || valor;
      else if (destino.startsWith("var:")) {
        const k = destino.slice(4);
        l.campos[campoDoCatalogo(k)?.chave ?? k] = valor.slice(0, 1000);
      }
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
