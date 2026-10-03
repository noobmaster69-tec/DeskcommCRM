/**
 * A avaliação do bloco CONDICIONAL dos fluxos (fork jhoow, Fase C) — puro, sem
 * banco: quem chama monta o `RetratoDaCondicao` e o relógio.
 *
 * Regras de leitura, iguais para todos os campos:
 *  - texto compara SEM diferença de maiúscula/minúscula e de espaço nas pontas;
 *  - `maior`/`menor`/`entre` comparam como NÚMERO quando os dois lados são
 *    número, e como texto ordenável quando não são — é o que faz `HH:MM` e
 *    `YYYY-MM-DD` funcionarem sem um operador por formato;
 *  - campo multivalorado (etiquetas): `igual`/`contem` = alguma etiqueta casa;
 *    `diferente`/`nao_contem` = nenhuma casa;
 *  - valor com variável (`{campo}`) é interpolado antes de comparar.
 */
import type { z } from "zod";
import type { condicaoDoFluxoSchema, condicionalConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { partesNoFuso } from "@/lib/agenda/fuso";
import { interpolar, type ContextoDeVariaveis } from "./variaveis";

export type CondicaoDoFluxo = z.infer<typeof condicaoDoFluxoSchema>;
export type ConfigDaCondicional = z.infer<typeof condicionalConfigSchema>;

export interface RetratoDaCondicao {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  etiquetas: string[];
  campos: Record<string, unknown>;
  /** `conversations.status` (open, pending, closed…). */
  statusDaConversa: string | null;
  /** `conversations.assigned_to_user_id`. */
  atendente: string | null;
  /** Última mensagem do CONTATO na conversa (janela de 24h do WhatsApp). */
  ultimaEntradaEm: string | null;
  fuso: string;
  agora: Date;
  variaveis: ContextoDeVariaveis;
}

const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
const JANELA_MS = 24 * 3_600_000;

function normal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function numero(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function comparar(a: string, b: string): number {
  const na = numero(a);
  const nb = numero(b);
  if (na !== null && nb !== null) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Dia da semana aceito como número (0 = domingo) ou nome ("segunda", "Sábado"). */
function diaComoTexto(v: string): string {
  const n = numero(v);
  if (n !== null && n >= 0 && n <= 6) return String(n);
  const i = DIAS.findIndex((d) => d.startsWith(v.slice(0, 3)));
  return i >= 0 ? String(i) : v;
}

/** Os valores do lado do CAMPO (vários para etiquetas). `null` = campo vazio. */
function ladoDoCampo(c: CondicaoDoFluxo, r: RetratoDaCondicao): string[] {
  const p = partesNoFuso(r.agora, r.fuso);
  const dois = (n: number) => String(n).padStart(2, "0");
  switch (c.campo.tipo) {
    case "etiqueta":
      return r.etiquetas.map(normal);
    case "dia_semana":
      return [String(new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay())];
    case "hora":
      return [`${dois(p.hora)}:${dois(p.minuto)}`];
    case "data":
      return [`${p.ano}-${dois(p.mes)}-${dois(p.dia)}`];
    case "janela_24h": {
      const aberta = r.ultimaEntradaEm !== null && r.agora.getTime() - new Date(r.ultimaEntradaEm).getTime() < JANELA_MS;
      return [aberta ? "aberta" : "fechada"];
    }
    case "status_atendimento":
      return r.statusDaConversa ? [normal(r.statusDaConversa)] : [];
    case "atendente":
      return r.atendente ? [normal(r.atendente)] : [];
    case "nome":
      return r.nome ? [normal(r.nome)] : [];
    case "numero":
      return r.telefone ? [r.telefone.replace(/\D/g, "")] : [];
    case "email":
      return r.email ? [normal(r.email)] : [];
    case "campo_custom": {
      const v = r.campos[c.campo.chave];
      return v === null || v === undefined || v === "" ? [] : [normal(v)];
    }
  }
}

/** Os valores do lado da REGRA, já interpolados e normalizados. */
function ladoDaRegra(c: CondicaoDoFluxo, r: RetratoDaCondicao): string[] {
  const brutos = Array.isArray(c.valor) ? c.valor : c.valor === undefined ? [] : [c.valor];
  return brutos
    .map((v) => normal(interpolar(String(v), r.variaveis)))
    .map((v) => {
      if (c.campo.tipo === "dia_semana") return diaComoTexto(v);
      if (c.campo.tipo === "numero") return v.replace(/\D/g, "");
      return v;
    })
    .filter((v) => v !== "");
}

export function avaliarCondicao(c: CondicaoDoFluxo, r: RetratoDaCondicao): boolean {
  const campo = ladoDoCampo(c, r);
  const regra = ladoDaRegra(c, r);
  switch (c.operador) {
    case "vazio":
      return campo.length === 0;
    case "nao_vazio":
      return campo.length > 0;
    case "igual":
      return campo.some((v) => regra.includes(v));
    case "diferente":
      return !campo.some((v) => regra.includes(v));
    case "contem":
      return campo.some((v) => regra.some((x) => v.includes(x)));
    case "nao_contem":
      return !campo.some((v) => regra.some((x) => v.includes(x)));
    case "maior":
      return regra[0] !== undefined && campo.some((v) => comparar(v, regra[0]!) > 0);
    case "menor":
      return regra[0] !== undefined && campo.some((v) => comparar(v, regra[0]!) < 0);
    case "entre": {
      const de = regra[0];
      const ate = c.valor_ate !== undefined ? normal(interpolar(String(c.valor_ate), r.variaveis)) : regra[1];
      if (de === undefined || ate === undefined) return false;
      return campo.some((v) => comparar(v, de) >= 0 && comparar(v, ate) <= 0);
    }
  }
}

/** `todas` = E; `qualquer` = OU. */
export function avaliarCondicional(config: ConfigDaCondicional, r: RetratoDaCondicao): boolean {
  const resultados = config.condicoes.map((c) => avaliarCondicao(c, r));
  return config.regra === "qualquer" ? resultados.some(Boolean) : resultados.every(Boolean);
}
