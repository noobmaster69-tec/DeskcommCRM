/**
 * O bloco INTERVALO INTELIGENTE dos fluxos (fork jhoow, Fase C) — puro: devolve
 * ATÉ QUANDO o fluxo espera, ou `null` para seguir agora.
 *
 *  - `duracao`: agora + valor × unidade;
 *  - `data`: até a data/hora pedida (ISO, `DD/MM/AAAA HH:MM`, `AAAA-MM-DD`…),
 *    no FUSO DA ORGANIZAÇÃO quando o texto não traz fuso; aceita variável
 *    (`{data_sessao}`). Data no passado ou ilegível = segue agora — e quem chama
 *    registra o motivo, para não prender o contato num texto mal digitado;
 *  - `horarios`: dentro de uma janela (dia da semana + HH:MM–HH:MM, no fuso da
 *    organização) segue agora; fora, espera o começo da próxima janela.
 */
import type { z } from "zod";
import type { intervaloConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { instanteDe, partesNoFuso } from "@/lib/agenda/fuso";
import { interpolar, type ContextoDeVariaveis } from "./variaveis";

export type ConfigDoIntervalo = z.infer<typeof intervaloConfigSchema>;

const SEGUNDOS = { segundos: 1, minutos: 60, horas: 3600, dias: 86400 } as const;

export type FimDoIntervalo =
  | { tipo: "agora"; motivo?: "data_no_passado" | "data_ilegivel" | "dentro_da_janela" }
  | { tipo: "esperar"; ate: Date };

/** Lê o texto de data. Sem fuso explícito, é hora de parede da organização. */
export function lerDataDoFluxo(texto: string, fuso: string): Date | null {
  const t = texto.trim();
  if (!t) return null;
  // ISO com fuso explícito (Z ou ±HH:MM): o instante é o que está escrito.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(t);
  let ano: number, mes: number, dia: number, hora = 0, minuto = 0;
  if (m) {
    [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [hora, minuto] = [Number(m[4]), Number(m[5])];
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(?:às\s+)?(\d{1,2})(?::|h)(\d{2})?)?$/i.exec(t);
    if (!m) return null;
    [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [hora, minuto] = [Number(m[4]), Number(m[5] ?? 0)];
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const d = instanteDe({ ano, mes, dia, hora, minuto, segundo: 0 }, fuso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** O começo da próxima janela, ou `null` quando AGORA já está dentro de uma. */
export function proximaJanela(
  janelas: ReadonlyArray<{ dia: number; inicio: string; fim: string }>,
  agora: Date,
  fuso: string,
): Date | null {
  const p = partesNoFuso(agora, fuso);
  const hoje = new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay();
  const minutoAgora = p.hora * 60 + p.minuto;
  for (const j of janelas) {
    if (j.dia === hoje && minutoAgora >= minutosDe(j.inicio) && minutoAgora < minutosDe(j.fim)) return null;
  }
  // Procura nos próximos 7 dias (e no resto de hoje) o primeiro início.
  for (let d = 0; d <= 7; d++) {
    const base = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + d));
    const dow = base.getUTCDay();
    const inicios = janelas
      .filter((j) => j.dia === dow)
      .map((j) => minutosDe(j.inicio))
      .filter((min) => d > 0 || min > minutoAgora)
      .sort((a, b) => a - b);
    if (inicios.length > 0) {
      const min = inicios[0]!;
      return instanteDe(
        {
          ano: base.getUTCFullYear(),
          mes: base.getUTCMonth() + 1,
          dia: base.getUTCDate(),
          hora: Math.floor(min / 60),
          minuto: min % 60,
          segundo: 0,
        },
        fuso,
      );
    }
  }
  return null;
}

export function fimDoIntervalo(
  config: ConfigDoIntervalo,
  agora: Date,
  fuso: string,
  variaveis: ContextoDeVariaveis,
): FimDoIntervalo {
  switch (config.modo) {
    case "duracao":
      return { tipo: "esperar", ate: new Date(agora.getTime() + config.valor * SEGUNDOS[config.unidade] * 1000) };
    case "data": {
      const quando = lerDataDoFluxo(interpolar(config.quando, variaveis), fuso);
      if (!quando) return { tipo: "agora", motivo: "data_ilegivel" };
      if (quando.getTime() <= agora.getTime()) return { tipo: "agora", motivo: "data_no_passado" };
      return { tipo: "esperar", ate: quando };
    }
    case "horarios": {
      const ate = proximaJanela(config.janelas, agora, fuso);
      return ate ? { tipo: "esperar", ate } : { tipo: "agora", motivo: "dentro_da_janela" };
    }
  }
}
