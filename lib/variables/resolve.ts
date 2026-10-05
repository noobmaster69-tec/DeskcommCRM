import { chaveCanonica } from "./sistema";

/**
 * O RESOLVEDOR único de variáveis (fork jhoow, Campanhas › item 2) — usado pela
 * campanha (envio e prévia) e pelos blocos de Fluxo. Aceita as duas grafias que
 * o produto já tinha: `{chave}` (Fluxos) e `{{chave}}` (Campanhas).
 *
 * Fuso e idioma: a saudação, o dia da semana e a data são do relógio do
 * CONTATO (o fuso que a campanha resolveu para ele — item 7), não do servidor.
 */
export interface ContextoDoContato {
  nome: string | null;
  telefone: string | null;
  email?: string | null;
  /** `contacts.custom_fields` — variáveis personalizadas e dados importados. */
  campos: Record<string, unknown>;
  /** Defaults das variáveis personalizadas da organização (chave → valor). */
  padroes?: Record<string, string>;
  ultimaMensagem?: string | null;
  /** Relógio do contato; ausente = a variável de tempo fica sem valor. */
  quando?: { agora: Date; fuso: string; idioma?: string };
}

export const TOKEN_DE_VARIAVEL = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}|\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}/g;

function emTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function palavras(nome: string | null): string[] {
  return (nome ?? "").trim().split(/\s+/).filter(Boolean);
}

function horaNoFuso(agora: Date, fuso: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hour: "numeric", hourCycle: "h23" }).format(agora);
  return Number(h) % 24;
}

/** Os cortes do português falado (os mesmos da saudação de campanha desde o piloto): <12 dia, <18 tarde. */
export function saudacaoDoHorario(agora: Date, fuso: string, idioma = "pt-BR"): string {
  const h = horaNoFuso(agora, fuso);
  const es = idioma.startsWith("es");
  if (h < 12) return es ? "Buenos días" : "Bom dia";
  if (h < 18) return es ? "Buenas tardes" : "Boa tarde";
  return es ? "Buenas noches" : "Boa noite";
}

const proprio = (o: unknown, k: string): boolean =>
  !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

/** Lê `campos[chave]` (com caminho `a.b`) SÓ em propriedade própria — `{constructor}` não atravessa o protótipo. */
export function valorDoCampo(ctx: Pick<ContextoDoContato, "campos" | "padroes">, chave: string): string {
  if (proprio(ctx.campos, chave)) return emTexto(ctx.campos[chave]) || (ctx.padroes?.[chave] ?? "");
  let atual: unknown = ctx.campos;
  for (const p of chave.split(".")) {
    if (!proprio(atual, p)) return proprio(ctx.padroes, chave) ? ctx.padroes![chave]! : "";
    atual = (atual as Record<string, unknown>)[p];
  }
  return emTexto(atual) || (proprio(ctx.padroes, chave) ? ctx.padroes![chave]! : "");
}

const campo = valorDoCampo;

/** O valor de UMA variável. `""` = sem valor (a campanha usa isso para barrar envio com buraco). */
export function resolverVariavel(nome: string, ctx: ContextoDoContato): string {
  const bruto = nome.trim();
  const sistema = chaveCanonica(bruto);
  const p = palavras(ctx.nome);
  switch (sistema) {
    case "nome_profissional":
      return p.join(" ");
    case "primeiro_nome":
      return p[0] ?? "";
    case "ultimo_nome":
      return p.length > 1 ? p[p.length - 1]! : "";
    case "nome_curto":
      return p[0] ?? "amigo";
    case "nome_empresa":
      return campo(ctx, "nome_empresa") || campo(ctx, "empresa");
    case "numero":
      return (ctx.telefone ?? "").trim();
    case "email":
      return (ctx.email ?? "").trim();
    case "comentarios_google_maps":
      return campo(ctx, "comentarios_google_maps");
    case "saudacao_horario":
      return ctx.quando ? saudacaoDoHorario(ctx.quando.agora, ctx.quando.fuso, ctx.quando.idioma) : "";
    case "dia_semana":
      return ctx.quando
        ? new Intl.DateTimeFormat(ctx.quando.idioma ?? "pt-BR", { timeZone: ctx.quando.fuso, weekday: "long" }).format(ctx.quando.agora)
        : "";
    case "data_atual":
      return ctx.quando
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.quando.fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(ctx.quando.agora)
        : "";
  }
  if (bruto === "ultima_mensagem" || bruto === "last_user_message") return (ctx.ultimaMensagem ?? "").trim();
  return campo(ctx, bruto);
}

export interface Interpolado {
  texto: string;
  /** Variáveis usadas que ficaram sem valor (na ordem em que aparecem). */
  faltando: string[];
}

/**
 * Troca cada variável pelo valor. `vazioQuandoFalta`: true (Fluxos) apaga o
 * token sem valor — o cliente nunca recebe "Oi, {nome}!"; false (prévia de
 * campanha) mantém o token literal para o operador ver o buraco.
 */
export function interpolarVariaveis(texto: string, ctx: ContextoDoContato, opcoes: { vazioQuandoFalta: boolean }): Interpolado {
  const faltando: string[] = [];
  const saida = texto.replace(TOKEN_DE_VARIAVEL, (literal, duplo: string | undefined, simples: string | undefined) => {
    const nome = (duplo ?? simples ?? "").trim();
    const valor = resolverVariavel(nome, ctx);
    if (valor === "") {
      if (!faltando.includes(nome)) faltando.push(nome);
      return opcoes.vazioQuandoFalta ? "" : literal;
    }
    return valor;
  });
  return { texto: saida, faltando };
}

/** Variáveis que dependem do RELÓGIO: na prévia/preparação ficam literais, o envio resolve. */
export const VARIAVEIS_DE_TEMPO: ReadonlySet<string> = new Set(["saudacao_horario", "dia_semana", "data_atual"]);

/** As variáveis citadas num texto (as duas grafias). */
export function variaveisDoTexto(texto: string): string[] {
  const achadas: string[] = [];
  for (const m of texto.matchAll(TOKEN_DE_VARIAVEL)) {
    const nome = (m[1] ?? m[2] ?? "").trim();
    if (nome && !achadas.includes(nome)) achadas.push(nome);
  }
  return achadas;
}
