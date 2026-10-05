/**
 * As VARIÁVEIS DO SISTEMA (fork jhoow): derivadas do contato, da execução e do
 * relógio, sempre presentes, nunca configuráveis. Os CAMPOS PADRÃO do contato
 * (empresa, profissão, cidade, idiomas…) moram em `campos-do-contato.ts` e são
 * guardados em `contacts.custom_fields`; as da organização (Configurações ›
 * Variáveis, 9013) também.
 *
 * `aliases`: os nomes antigos continuam valendo — `{nome}` dos Fluxos,
 * `{{saudacao}}` das Campanhas, `{nome_profissional}` e `{numero}` da tela de
 * variáveis. Fonte ÚNICA: `{nome_completo}` e `{nome_profissional}` leem o
 * MESMO `contacts.name`; `{whatsapp}` e `{numero}`, o mesmo telefone.
 */
export interface VariavelDoSistema {
  chave: string;
  descricao: string;
  exemplo: string;
  aliases?: readonly string[];
}

export const VARIAVEIS_DO_SISTEMA: readonly VariavelDoSistema[] = [
  { chave: "nome_completo", descricao: "Nome completo do contato (= {nome_profissional})", exemplo: "Ana Paula Ribeiro", aliases: ["nome_profissional", "nome"] },
  { chave: "primeiro_nome", descricao: "Primeira palavra do nome", exemplo: "Ana" },
  { chave: "ultimo_nome", descricao: "Última palavra do nome", exemplo: "Ribeiro" },
  { chave: "nome_curto", descricao: "Como chamar o contato — o campo da ficha (aceita “Ana Paula”) ou a primeira palavra do nome", exemplo: "Ana Paula" },
  { chave: "nome_saudacao", descricao: "Tratamento confirmado + nome curto (ex.: “Dra. Ana Paula”); sem confirmação, só o nome curto", exemplo: "Dra. Ana Paula" },
  { chave: "whatsapp", descricao: "WhatsApp do contato (= {numero})", exemplo: "+351 912 345 678", aliases: ["numero", "telefone"] },
  { chave: "email", descricao: "E-mail do contato", exemplo: "ana@exemplo.com" },
  { chave: "idioma_contato", descricao: "Idioma do contato (perfil)", exemplo: "pt-PT" },
  { chave: "ultima_interacao", descricao: "Data da última interação (DD/MM/AAAA)", exemplo: "04/10/2026" },
  { chave: "campanha_id", descricao: "A campanha que está enviando (ou a última que falou com o contato)", exemplo: "c0ffee00-…" },
  { chave: "saudacao_horario", descricao: "Bom dia / Boa tarde / Boa noite, no fuso e no idioma da conversa", exemplo: "Boa tarde", aliases: ["saudacao"] },
  { chave: "dia_semana", descricao: "Dia da semana, no fuso do contato", exemplo: "segunda-feira" },
  { chave: "data_atual", descricao: "Data de hoje (DD/MM/AAAA), no fuso do contato", exemplo: "05/10/2026" },
];

/** Aliases antigos de CAMPOS PADRÃO (guardados): o nome antigo lê o mesmo valor. */
export const ALIASES_DE_CAMPO: Readonly<Record<string, string>> = {
  empresa: "nome_empresa",
  comentarios_google_maps: "n_avaliacoes_gg",
  timezone: "fuso_horario",
};

/** Todo nome que o sistema reserva (chaves + aliases + os dos Fluxos). Os campos padrão NÃO: a organização pode configurá-los (opções, rótulo). */
export const NOMES_RESERVADOS: ReadonlySet<string> = new Set([
  ...VARIAVEIS_DO_SISTEMA.flatMap((v) => [v.chave, ...(v.aliases ?? [])]),
  ...Object.keys(ALIASES_DE_CAMPO),
  "ultima_mensagem",
  "last_user_message",
]);

/** O nome canônico de uma chave do sistema (resolve os aliases). `null` = não é do sistema. */
export function chaveCanonica(nome: string): string | null {
  const n = nome.trim().toLowerCase();
  for (const v of VARIAVEIS_DO_SISTEMA) if (v.chave === n || v.aliases?.includes(n)) return v.chave;
  return null;
}

/** Tipos de variável personalizada (CHECK da 9013). */
export const TIPOS_DE_VARIAVEL = ["texto", "numero", "data", "booleano", "selecao"] as const;
export type TipoDeVariavel = (typeof TIPOS_DE_VARIAVEL)[number];

/** Formato da chave personalizada (o mesmo CHECK do banco). */
export const CHAVE_DE_VARIAVEL = /^[a-z][a-z0-9_]{0,39}$/;
