/**
 * As VARIÁVEIS DO SISTEMA (fork jhoow, Campanhas › item 2): derivadas do
 * contato e do relógio, sempre presentes, nunca configuráveis. As da
 * organização (tela Configurações › Variáveis, migration 9013) moram em
 * `contacts.custom_fields` e não podem reusar estes nomes.
 *
 * `aliases`: os nomes antigos continuam valendo — `{nome}` dos Fluxos e
 * `{{saudacao}}` das Campanhas não podem quebrar em quem já os usa.
 */
export interface VariavelDoSistema {
  chave: string;
  descricao: string;
  exemplo: string;
  aliases?: readonly string[];
}

export const VARIAVEIS_DO_SISTEMA: readonly VariavelDoSistema[] = [
  { chave: "nome_profissional", descricao: "Nome completo do contato", exemplo: "Jonatas Pereira Gomes", aliases: ["nome"] },
  { chave: "primeiro_nome", descricao: "Primeira palavra do nome", exemplo: "Jonatas" },
  { chave: "ultimo_nome", descricao: "Última palavra do nome", exemplo: "Gomes" },
  { chave: "nome_curto", descricao: "Primeira palavra do nome, ou “amigo” se não houver nome", exemplo: "Jonatas" },
  { chave: "nome_empresa", descricao: "Nome da empresa do contato", exemplo: "Studio Jonatas" },
  { chave: "numero", descricao: "Telefone do contato", exemplo: "+55 11 91579-3995", aliases: ["telefone"] },
  { chave: "email", descricao: "E-mail do contato", exemplo: "jonatas@exemplo.com" },
  { chave: "saudacao_horario", descricao: "Bom dia / Boa tarde / Boa noite, no fuso do contato", exemplo: "Boa tarde", aliases: ["saudacao"] },
  { chave: "dia_semana", descricao: "Dia da semana, no fuso do contato", exemplo: "segunda-feira" },
  { chave: "data_atual", descricao: "Data de hoje (DD/MM/AAAA), no fuso do contato", exemplo: "05/10/2026" },
  { chave: "comentarios_google_maps", descricao: "Número de avaliações no Google Maps (se importado)", exemplo: "128" },
];

/** Todo nome que o sistema reserva (chaves + aliases + os dos Fluxos). */
export const NOMES_RESERVADOS: ReadonlySet<string> = new Set([
  ...VARIAVEIS_DO_SISTEMA.flatMap((v) => [v.chave, ...(v.aliases ?? [])]),
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
