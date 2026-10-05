import { campoDoCatalogo, chavesAntigasDe, chaveDeArmazenamento } from "./campos-do-contato";
import { chaveCanonica } from "./sistema";

/**
 * O RESOLVEDOR único de variáveis (fork jhoow) — campanha (envio e prévia),
 * blocos de Fluxo, follow-ups e a prévia por contato. Aceita `{chave}` e
 * `{{chave}}`, e o ALTERNATIVO `{chave|texto}`: sem valor, entra o texto.
 *
 * Fuso e idioma: saudação, dia da semana e data são do relógio do CONTATO e
 * do IDIOMA DA CONVERSA (`idioma_conversa`), não do servidor.
 */
export interface ContextoDoContato {
  nome: string | null;
  telefone: string | null;
  email?: string | null;
  /** `contacts.custom_fields` — campos padrão, variáveis personalizadas e dados importados. */
  campos: Record<string, unknown>;
  /** Defaults das variáveis personalizadas da organização (chave → valor). */
  padroes?: Record<string, string>;
  ultimaMensagem?: string | null;
  /** `contacts.locale`, `contacts.source`, `contacts.last_activity_at`. */
  locale?: string | null;
  origem?: string | null;
  ultimaInteracao?: string | null;
  /** A campanha que está enviando (ou a última do contato). */
  campanhaId?: string | null;
  /** Relógio do contato; ausente = a variável de tempo fica sem valor. `idioma` = o da conversa. */
  quando?: { agora: Date; fuso: string; idioma?: string };
}

/**
 * `{{chave}}`, `{chave}`, `{{chave|alternativo}}`, `{chave|alternativo}`.
 * Grupos: 1/2 (duplo: nome/alternativo), 3/4 (simples: nome/alternativo).
 */
export const TOKEN_DE_VARIAVEL =
  /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:\|([^{}|]*))?\}\}|\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:\|([^{}|]*))?\}/g;

/** O nome e o alternativo de um match de `TOKEN_DE_VARIAVEL`. */
export function partesDoToken(m: readonly (string | undefined)[]): { nome: string; alternativo: string | null } {
  const nome = (m[1] ?? m[3] ?? "").trim();
  const alt = m[1] !== undefined ? m[2] : m[4];
  return { nome, alternativo: alt === undefined ? null : alt.trim() };
}

const SIM_NAO: Record<string, [string, string]> = { pt: ["sim", "não"], es: ["sí", "no"], en: ["yes", "no"], nl: ["ja", "nee"] };

function emTexto(v: unknown, idioma = "pt"): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") {
    const par = SIM_NAO[idioma.slice(0, 2)] ?? SIM_NAO.pt!;
    return v ? par[0] : par[1];
  }
  return "";
}

function palavras(nome: string | null): string[] {
  return (nome ?? "").trim().split(/\s+/).filter(Boolean);
}

function horaNoFuso(agora: Date, fuso: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hour: "numeric", hourCycle: "h23" }).format(agora);
  return Number(h) % 24;
}

const SAUDACOES: Record<string, [string, string, string]> = {
  pt: ["Bom dia", "Boa tarde", "Boa noite"],
  es: ["Buenos días", "Buenas tardes", "Buenas noches"],
  en: ["Good morning", "Good afternoon", "Good evening"],
  nl: ["Goedemorgen", "Goedemiddag", "Goedenavond"],
};

/** Os cortes do falado (<12 manhã, <18 tarde), no idioma da conversa. Idioma sem tabela fica no português. */
export function saudacaoDoHorario(agora: Date, fuso: string, idioma = "pt-BR"): string {
  const h = horaNoFuso(agora, fuso);
  const s = SAUDACOES[idioma.slice(0, 2).toLowerCase()] ?? SAUDACOES.pt!;
  return h < 12 ? s[0] : h < 18 ? s[1] : s[2];
}

const proprio = (o: unknown, k: string): boolean =>
  !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

function lerCaminho(raiz: unknown, chave: string): unknown {
  if (proprio(raiz, chave)) return (raiz as Record<string, unknown>)[chave];
  let atual: unknown = raiz;
  for (const p of chave.split(".")) {
    if (!proprio(atual, p)) return undefined;
    atual = (atual as Record<string, unknown>)[p];
  }
  return atual;
}

/**
 * Lê o valor GUARDADO de uma chave em `campos` — SÓ propriedade própria
 * (`{constructor}` não atravessa o protótipo). Fonte única: o alias antigo
 * (`comentarios_google_maps`) lê o campo novo (`n_avaliacoes_gg`) e, se ele
 * não existe, a chave antiga. Sem valor: o padrão da organização.
 */
export function valorDoCampo(ctx: Pick<ContextoDoContato, "campos" | "padroes" | "quando">, chave: string): string {
  const idioma = ctx.quando?.idioma ?? "pt";
  const canonica = chaveDeArmazenamento(chave);
  for (const k of [canonica, ...chavesAntigasDe(canonica)]) {
    const v = emTexto(lerCaminho(ctx.campos, k), idioma);
    if (v) return v;
  }
  for (const k of [canonica, chave]) if (proprio(ctx.padroes, k)) return ctx.padroes![k]!;
  return "";
}

const campo = valorDoCampo;

/** O idioma da conversa: o do relógio da execução, o da ficha (conversa → prospecção) ou o do perfil. */
export function idiomaDaConversa(ctx: ContextoDoContato): string {
  return (
    ctx.quando?.idioma ||
    campo(ctx, "idioma_conversa") ||
    campo(ctx, "idioma_prospeccao") ||
    (ctx.locale ?? "").trim() ||
    "pt-BR"
  );
}

function nomeCurto(ctx: ContextoDoContato): string {
  return campo(ctx, "nome_curto") || (palavras(ctx.nome)[0] ?? "");
}

/** Tratamento confirmado + nome curto; incerto = só o nome curto. Valor manual manda. */
function nomeDeSaudacao(ctx: ContextoDoContato): string {
  const manual = campo(ctx, "nome_saudacao");
  if (manual) return manual;
  const curto = nomeCurto(ctx);
  if (!curto) return "";
  const confirmado = lerCaminho(ctx.campos, "tratamento_confirmado");
  const ok = confirmado === true || (typeof confirmado === "string" && /^(true|sim|1|yes|sí|si)$/i.test(confirmado.trim()));
  const tratamento = campo(ctx, "tratamento");
  return ok && tratamento ? `${tratamento} ${curto}` : curto;
}

function dataNoFuso(iso: string | null | undefined, fuso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** O valor de UMA variável. `""` = sem valor (a campanha usa isso para barrar envio com buraco). */
export function resolverVariavel(nome: string, ctx: ContextoDoContato): string {
  const bruto = nome.trim();
  const sistema = chaveCanonica(bruto);
  const p = palavras(ctx.nome);
  const fuso = ctx.quando?.fuso ?? "UTC";
  switch (sistema) {
    case "nome_completo":
      return p.join(" ");
    case "primeiro_nome":
      return p[0] ?? "";
    case "ultimo_nome":
      return p.length > 1 ? p[p.length - 1]! : "";
    case "nome_curto":
      return nomeCurto(ctx);
    case "nome_saudacao":
      return nomeDeSaudacao(ctx);
    case "whatsapp":
      return (ctx.telefone ?? "").trim();
    case "email":
      return (ctx.email ?? "").trim();
    case "idioma_contato":
      return (ctx.locale ?? "").trim();
    case "ultima_interacao":
      return dataNoFuso(ctx.ultimaInteracao, fuso);
    case "campanha_id":
      return (ctx.campanhaId ?? "").trim();
    case "saudacao_horario":
      return ctx.quando ? saudacaoDoHorario(ctx.quando.agora, ctx.quando.fuso, idiomaDaConversa(ctx)) : "";
    case "dia_semana":
      return ctx.quando
        ? new Intl.DateTimeFormat(idiomaDaConversa(ctx), { timeZone: ctx.quando.fuso, weekday: "long" }).format(ctx.quando.agora)
        : "";
    case "data_atual":
      return ctx.quando ? dataNoFuso(ctx.quando.agora.toISOString(), ctx.quando.fuso) : "";
  }
  if (bruto === "ultima_mensagem" || bruto === "last_user_message") return (ctx.ultimaMensagem ?? "").trim();
  if (chaveDeArmazenamento(bruto) === "origem_contato") return campo(ctx, "origem_contato") || (ctx.origem ?? "").trim();
  return campo(ctx, bruto);
}

/** A variável EXISTE (sistema, catálogo, alias, da organização ou guardada no contato)? */
export function ehVariavelConhecida(nome: string, personalizadas: ReadonlySet<string> | readonly string[], campos: Record<string, unknown> = {}): boolean {
  const n = nome.trim();
  if (chaveCanonica(n) || campoDoCatalogo(n)) return true;
  if (n === "ultima_mensagem" || n === "last_user_message") return true;
  const lista = personalizadas instanceof Set ? personalizadas : new Set(personalizadas);
  return lista.has(n) || proprio(campos, n) || lerCaminho(campos, n) !== undefined;
}

export interface Interpolado {
  texto: string;
  /** Variáveis usadas que ficaram sem valor (e sem alternativo), na ordem em que aparecem. */
  faltando: string[];
}

/** Marca onde uma variável vazia foi apagada — a limpeza só mexe AÍ. */
export const BURACO = "\uE000";

/**
 * Some a pontuação que a variável vazia deixou órfã — só em volta das marcas
 * `BURACO`, nunca no resto do texto: "Boa tarde, ␀, tudo bem?" → "Boa tarde,
 * tudo bem?"; "␀, tudo bem?" no começo → "Tudo bem?"; "Olá ␀ tudo" → "Olá tudo".
 */
export function limparPontuacaoOrfa(texto: string): string {
  let t = texto.replace(/[ \t]*\uE000[ \t]*/g, BURACO);
  t = t.replace(/\uE000{2,}/g, BURACO);
  // ",␀," → ","   ",␀." → "."
  t = t.replace(/([,;:])\uE000([,;:])/g, "$1");
  t = t.replace(/[,;:]\uE000([.!?])/g, "$1");
  // início de linha: "␀, tudo" → "Tudo"
  t = t.replace(/(^|\n)\uE000[,;:]?[ \t]*(\p{L})/gu, (_, ini: string, letra: string) => `${ini}${letra.toUpperCase()}`);
  // entre duas palavras vira um espaço; depois de pontuação, um espaço; senão some
  t = t.replace(/([\p{L}\p{N}])\uE000([\p{L}\p{N}])/gu, "$1 $2");
  t = t.replace(/([,;:])\uE000(?=\S)/g, "$1 ");
  return t.replace(/\uE000/g, "");
}

/**
 * Troca cada variável pelo valor. Sem valor: o ALTERNATIVO (`{x|texto}`) se
 * houver; senão `vazioQuandoFalta` true (Fluxos) apaga o token e limpa a
 * pontuação órfã — o cliente nunca recebe "Oi, {nome}!" nem "undefined";
 * false (prévia de campanha) mantém o token literal para o operador ver.
 */
export function interpolarVariaveis(texto: string, ctx: ContextoDoContato, opcoes: { vazioQuandoFalta: boolean }): Interpolado {
  const faltando: string[] = [];
  let apagou = false;
  const saida = texto.replace(TOKEN_DE_VARIAVEL, (literal, ...grupos: (string | undefined)[]) => {
    const { nome, alternativo } = partesDoToken([literal, ...grupos]);
    const valor = resolverVariavel(nome, ctx);
    if (valor !== "") return valor;
    if (alternativo !== null) {
      if (alternativo !== "") return alternativo;
      apagou = true;
      return BURACO;
    }
    if (!faltando.includes(nome)) faltando.push(nome);
    if (opcoes.vazioQuandoFalta) {
      apagou = true;
      return BURACO;
    }
    return literal;
  });
  return { texto: apagou ? limparPontuacaoOrfa(saida) : saida, faltando };
}

/** Variáveis que dependem do RELÓGIO: na prévia/preparação ficam literais, o envio resolve. */
export const VARIAVEIS_DE_TEMPO: ReadonlySet<string> = new Set(["saudacao_horario", "dia_semana", "data_atual"]);

/** As variáveis citadas num texto (as duas grafias), sem o alternativo. */
export function variaveisDoTexto(texto: string): string[] {
  const achadas: string[] = [];
  for (const m of texto.matchAll(TOKEN_DE_VARIAVEL)) {
    const { nome } = partesDoToken(m);
    if (nome && !achadas.includes(nome)) achadas.push(nome);
  }
  return achadas;
}
