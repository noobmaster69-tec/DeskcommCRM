/**
 * As cores que uma etapa (coluna do quadro) pode ter — a paleta pastel do Kommo.
 *
 * Fica guardada como hex em `crm_stages.color` (CHECK `crm_stages_color_format`:
 * `^#[0-9a-fA-F]{6}$` ou nulo). A tela oferece só estas oito, mas o banco aceita
 * qualquer hex: etapa que veio com outra cor (de API, importação ou de antes
 * desta paleta) continua aparecendo com a cor dela, e o seletor só não marca
 * nenhuma bolinha.
 *
 * O nome é texto de tela: quem mostra chama `t(NOMES_DAS_CORES[hex])` — a forma
 * de tabela constante que a cerca de i18n consegue conferir.
 */
export const NOMES_DAS_CORES = {
  "#a4c8fa": "Azul",
  "#dbe8fd": "Azul-claro",
  "#f9d9dc": "Rosa",
  "#a3efc5": "Verde",
  "#d7fc70": "Verde-claro",
  "#fdf08a": "Amarelo",
  "#f8b98a": "Laranja",
  "#d8dadd": "Cinza",
} as const;

export type CorDeEtapa = keyof typeof NOMES_DAS_CORES;

/** As oito, na ordem do seletor. A tabela acima é a fonte (e é o que `t()` lê). */
export const CORES_DE_ETAPA = Object.keys(NOMES_DAS_CORES) as CorDeEtapa[];

/** O formato que o banco aceita — o mesmo do CHECK. */
export const FORMATO_DE_COR = /^#[0-9a-fA-F]{6}$/;
