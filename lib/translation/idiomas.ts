/**
 * Idiomas da tradução automática do Inbox (fork jhoow, 9022).
 *
 * Um locale aqui é BCP-47 curto: `pt-BR`, `en-US`, `es-ES`. A comparação que
 * decide "precisa traduzir?" é pela LÍNGUA (`pt-BR` e `pt-PT` não se traduzem
 * entre si) — a variante só afina o texto que o modelo escreve.
 */

/** DDI → locale. Ordem não importa: a busca tenta o prefixo mais longo primeiro. */
export const LOCALE_POR_DDI: Record<string, string> = {
  "1": "en-US",
  "44": "en-GB",
  "351": "pt-PT",
  "55": "pt-BR",
  "34": "es-ES",
  "31": "nl-NL",
  "33": "fr-FR",
  "49": "de-DE",
  "39": "it-IT",
  "52": "es-MX",
  "54": "es-AR",
};

const PREFIXOS = Object.keys(LOCALE_POR_DDI).sort((a, b) => b.length - a.length);

/** O locale pelo código do país do telefone, ou `null` quando o DDI não está no mapa. */
export function localeDoTelefone(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  const prefixo = PREFIXOS.find((p) => d.startsWith(p));
  return prefixo ? LOCALE_POR_DDI[prefixo]! : null;
}

/** A língua só (`pt`, `en`), sem a variante. */
export function linguaDe(locale: string | null | undefined): string | null {
  const l = (locale ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return l && /^[a-z]{2}$/.test(l) ? l : null;
}

/** Os dois falam a mesma língua? Desconhecido nunca "é igual". */
export function mesmaLingua(a: string | null | undefined, b: string | null | undefined): boolean {
  const la = linguaDe(a);
  return la !== null && la === linguaDe(b);
}

const VARIANTE_PADRAO: Record<string, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  nl: "nl-NL",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
};

const POR_NOME: Record<string, string> = {
  portugues: "pt-BR",
  "portugues do brasil": "pt-BR",
  "portugues de portugal": "pt-PT",
  portuguese: "pt-BR",
  ingles: "en-US",
  english: "en-US",
  espanhol: "es-ES",
  spanish: "es-ES",
  espanol: "es-ES",
  holandes: "nl-NL",
  dutch: "nl-NL",
  nederlands: "nl-NL",
  frances: "fr-FR",
  french: "fr-FR",
  alemao: "de-DE",
  german: "de-DE",
  italiano: "it-IT",
  italian: "it-IT",
};

/**
 * Normaliza o que vier (`en`, `EN_us`, `Inglês`, `pt-br`) para `en-US`/`pt-BR`.
 * `null` quando não dá para reconhecer — nunca chuta.
 */
export function normalizarLocale(valor: string | null | undefined): string | null {
  const bruto = (valor ?? "").trim();
  if (!bruto) return null;
  const m = /^([a-z]{2})(?:[-_]([a-z]{2}))?$/i.exec(bruto);
  if (m) {
    const lingua = m[1]!.toLowerCase();
    return m[2] ? `${lingua}-${m[2].toUpperCase()}` : (VARIANTE_PADRAO[lingua] ?? lingua);
  }
  const chave = bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\(.*\)\s*/g, "")
    .trim();
  return POR_NOME[chave] ?? null;
}

/** Os idiomas oferecidos nos seletores (cliente e atendente). */
export const IDIOMAS_OFERECIDOS = ["pt-BR", "pt-PT", "en-US", "en-GB", "es-ES", "nl-NL", "fr-FR", "de-DE", "it-IT"] as const;

const NOME_PT: Record<string, string> = {
  pt: "português",
  en: "inglês",
  es: "espanhol",
  nl: "holandês",
  fr: "francês",
  de: "alemão",
  it: "italiano",
};

const VARIANTE_PT: Record<string, string> = {
  "pt-BR": "português do Brasil",
  "pt-PT": "português de Portugal",
  "en-US": "inglês (EUA)",
  "en-GB": "inglês (Reino Unido)",
  "es-ES": "espanhol (Espanha)",
  "es-MX": "espanhol (México)",
  "es-AR": "espanhol (Argentina)",
};

/** "inglês" — a língua, em português, minúscula (para "Traduzido do inglês"). */
export function nomeDaLingua(locale: string | null | undefined): string {
  const l = linguaDe(locale);
  return (l && NOME_PT[l]) ?? (locale ?? "idioma desconhecido");
}

/** "inglês (EUA)" — com a variante, para seletores e para o prompt do modelo. */
export function nomeDoIdioma(locale: string | null | undefined): string {
  if (!locale) return "idioma desconhecido";
  return VARIANTE_PT[locale] ?? nomeDaLingua(locale);
}
