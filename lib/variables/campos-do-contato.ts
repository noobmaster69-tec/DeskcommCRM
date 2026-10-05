import { ALIASES_DE_CAMPO, type TipoDeVariavel } from "./sistema";

/**
 * O CATÁLOGO DE CAMPOS DO CONTATO (fork jhoow): o que a ficha mostra e edita,
 * o que o importador mapeia e o que as mensagens resolvem — UMA lista.
 *
 *  - `nativo`: coluna de `contacts` (nome, WhatsApp, e-mail, idioma, última
 *    interação). Fonte única: os aliases (`nome_profissional`, `numero`) leem
 *    a mesma coluna.
 *  - `calculado`: derivado (nome curto, nome de saudação, campanha). Alguns
 *    aceitam um valor MANUAL que manda sobre o cálculo (nome curto "Ana Paula").
 *  - `padrao`: guardado em `contacts.custom_fields[chave]` — valor de CADA
 *    contato, nunca global. A organização pode configurar rótulo e opções
 *    (Configurações › Variáveis) sem mudar a tela.
 *
 * Campos da organização que não estão aqui entram no grupo "Outros campos",
 * pela definição em `contact_custom_fields` — campo novo aparece sem frontend.
 */
export type OrigemDoCampo = "nativo" | "calculado" | "padrao";
export type TipoDoCampo = TipoDeVariavel | "telefone" | "email" | "url" | "datahora";

export type GrupoDoCampo = "contato" | "profissional" | "localizacao" | "presenca" | "relacionamento" | "outros";

export interface CampoDoCatalogo {
  chave: string;
  rotulo: string;
  tipo: TipoDoCampo;
  origem: OrigemDoCampo;
  grupo: GrupoDoCampo;
  /** Coluna de `contacts` (nativos). */
  coluna?: "name" | "phone_number" | "email" | "locale" | "last_activity_at";
  /** Não se edita pela ficha (o WhatsApp muda pelo cadastro, que valida o número). */
  somenteLeitura?: boolean;
  /** Calculado que aceita valor manual (guardado em custom_fields[chave]). */
  aceitaManual?: boolean;
  opcoes?: readonly string[];
  dica?: string;
}

export const GRUPOS: ReadonlyArray<{ id: GrupoDoCampo; rotulo: string; secao: "dados" | "personalizados" }> = [
  { id: "contato", rotulo: "Identificação e contato", secao: "dados" },
  { id: "profissional", rotulo: "Perfil profissional", secao: "personalizados" },
  { id: "localizacao", rotulo: "Localização e idioma", secao: "personalizados" },
  { id: "presenca", rotulo: "Presença online", secao: "personalizados" },
  { id: "relacionamento", rotulo: "Relacionamento", secao: "personalizados" },
  { id: "outros", rotulo: "Outros campos", secao: "personalizados" },
];

export const CAMPOS_DO_CONTATO: readonly CampoDoCatalogo[] = [
  // ─── Dados do contato ───
  { chave: "nome_completo", rotulo: "Nome completo", tipo: "texto", origem: "nativo", grupo: "contato", coluna: "name" },
  { chave: "nome_curto", rotulo: "Nome curto", tipo: "texto", origem: "calculado", grupo: "contato", aceitaManual: true, dica: "Como chamar a pessoa. Aceita nome composto (“Ana Paula”). Em branco: a primeira palavra do nome." },
  { chave: "nome_saudacao", rotulo: "Nome na saudação", tipo: "texto", origem: "calculado", grupo: "contato", aceitaManual: true, dica: "Em branco: tratamento + nome curto quando o tratamento está confirmado; senão, só o nome curto." },
  { chave: "whatsapp", rotulo: "WhatsApp", tipo: "telefone", origem: "nativo", grupo: "contato", coluna: "phone_number", somenteLeitura: true },
  { chave: "email", rotulo: "E-mail", tipo: "email", origem: "nativo", grupo: "contato", coluna: "email" },
  { chave: "idioma_contato", rotulo: "Idioma do contato", tipo: "texto", origem: "nativo", grupo: "contato", coluna: "locale", dica: "Código do idioma (ex.: pt-BR, pt-PT, es, en)." },
  { chave: "origem_contato", rotulo: "Origem do contato", tipo: "texto", origem: "padrao", grupo: "contato", dica: "De onde veio (ex.: Google Maps, indicação). Em branco: a origem técnica do cadastro." },
  { chave: "ultima_interacao", rotulo: "Última interação", tipo: "datahora", origem: "nativo", grupo: "contato", coluna: "last_activity_at", somenteLeitura: true },
  { chave: "campanha_id", rotulo: "Última campanha", tipo: "texto", origem: "calculado", grupo: "contato", somenteLeitura: true },
  // ─── Perfil profissional ───
  { chave: "nome_empresa", rotulo: "Nome da empresa", tipo: "texto", origem: "padrao", grupo: "profissional" },
  { chave: "profissao_codigo", rotulo: "Código da profissão", tipo: "texto", origem: "padrao", grupo: "profissional" },
  { chave: "especialidade", rotulo: "Especialidade", tipo: "texto", origem: "padrao", grupo: "profissional" },
  { chave: "profissao_singular", rotulo: "Profissão (singular)", tipo: "texto", origem: "padrao", grupo: "profissional", dica: "No idioma da conversa (ex.: fotógrafa / fotógrafo / photographer)." },
  { chave: "profissao_plural", rotulo: "Profissão (plural)", tipo: "texto", origem: "padrao", grupo: "profissional", dica: "No idioma da conversa (ex.: fotógrafos)." },
  { chave: "tratamento", rotulo: "Tratamento", tipo: "texto", origem: "padrao", grupo: "profissional", dica: "Ex.: Dr., Dra., Sr., Sra. — no idioma da conversa." },
  { chave: "tratamento_confirmado", rotulo: "Tratamento confirmado", tipo: "booleano", origem: "padrao", grupo: "profissional", dica: "Só com confirmação o tratamento entra no {nome_saudacao}." },
  // ─── Localização e idioma ───
  { chave: "cidade", rotulo: "Cidade", tipo: "texto", origem: "padrao", grupo: "localizacao" },
  { chave: "pais", rotulo: "País", tipo: "texto", origem: "padrao", grupo: "localizacao" },
  { chave: "fuso_horario", rotulo: "Fuso horário", tipo: "texto", origem: "padrao", grupo: "localizacao", dica: "Fuso IANA (ex.: Europe/Lisbon). A janela das campanhas e a saudação usam este fuso." },
  { chave: "idioma_prospeccao", rotulo: "Idioma da prospecção", tipo: "texto", origem: "padrao", grupo: "localizacao", dica: "Começa pelo idioma da campanha." },
  { chave: "idioma_conversa", rotulo: "Idioma da conversa", tipo: "texto", origem: "padrao", grupo: "localizacao", dica: "O idioma em que a IA e os blocos respondem. Começa pelo idioma da campanha." },
  // ─── Presença online ───
  { chave: "site_atual", rotulo: "Site atual", tipo: "url", origem: "padrao", grupo: "presenca" },
  { chave: "google_maps_url", rotulo: "Google Maps (link)", tipo: "url", origem: "padrao", grupo: "presenca" },
  { chave: "n_avaliacoes_gg", rotulo: "Avaliações no Google (quantidade)", tipo: "numero", origem: "padrao", grupo: "presenca", dica: "= {comentarios_google_maps}" },
  { chave: "nota_avaliacoes_gg", rotulo: "Nota no Google", tipo: "numero", origem: "padrao", grupo: "presenca" },
  // ─── Relacionamento ───
  { chave: "status_contato", rotulo: "Status do contato", tipo: "texto", origem: "padrao", grupo: "relacionamento" },
  { chave: "proximo_followup", rotulo: "Próximo follow-up", tipo: "data", origem: "padrao", grupo: "relacionamento" },
  { chave: "nao_contatar", rotulo: "Não contatar", tipo: "booleano", origem: "padrao", grupo: "relacionamento", dica: "Marcado: campanhas não enviam para este contato." },
  { chave: "observacao_personalizacao", rotulo: "Observação para personalização", tipo: "texto", origem: "padrao", grupo: "relacionamento" },
];

const POR_CHAVE = new Map(CAMPOS_DO_CONTATO.map((c) => [c.chave, c]));

/** O nome novo de um alias antigo — SÓ propriedade própria (`constructor` não é alias). */
function aliasDe(k: string): string | null {
  return Object.prototype.hasOwnProperty.call(ALIASES_DE_CAMPO, k) ? ALIASES_DE_CAMPO[k]! : null;
}

/** O campo do catálogo de uma chave (aceita aliases antigos). */
export function campoDoCatalogo(chave: string): CampoDoCatalogo | null {
  const k = chave.trim().toLowerCase();
  return POR_CHAVE.get(aliasDe(k) ?? k) ?? null;
}

/** As chaves antigas que guardam o MESMO valor de um campo padrão (`n_avaliacoes_gg` ← `comentarios_google_maps`). */
export function chavesAntigasDe(chave: string): string[] {
  return Object.entries(ALIASES_DE_CAMPO)
    .filter(([, canonica]) => canonica === chave)
    .map(([antiga]) => antiga);
}

/** Onde um valor é GUARDADO em custom_fields: o nome canônico (alias antigo → novo). */
export function chaveDeArmazenamento(chave: string): string {
  const k = chave.trim();
  return aliasDe(k.toLowerCase()) ?? k;
}

/** Os campos padrão (guardados) — os que a organização pode configurar e o importador mapeia. */
export const CHAVES_PADRAO: ReadonlySet<string> = new Set(
  CAMPOS_DO_CONTATO.filter((c) => c.origem === "padrao" || c.aceitaManual).map((c) => c.chave),
);
