import { instanteDoHorarioLocal, relogioNoFuso } from "./agendamento";

/**
 * A COTA da campanha (fork jhoow, 9020): "chamar N por hora/dia/semana/mês".
 * Duas regras, puras:
 *  1. ESPAÇAR — o intervalo entre envios é o tempo útil do período (a janela
 *     diária, quando há) dividido pela cota: janela de 9 h e 3 por dia = um a
 *     cada 3 h. Com uma variação de ±10%, para não virar relógio de robô.
 *  2. LIMITAR — no período corrente (no fuso da campanha) não sai mais que N.
 */
export const PERIODOS_DA_COTA = ["hora", "dia", "semana", "mes"] as const;
export type PeriodoDaCota = (typeof PERIODOS_DA_COTA)[number];

export interface Cota {
  quantidade: number;
  periodo: PeriodoDaCota;
}

const dois = (n: number) => String(n).padStart(2, "0");

/** Minutos úteis por dia: a janela diária, ou o dia inteiro sem janela. */
function minutosUteisPorDia(janela: { inicio: number; fim: number } | null): number {
  return janela ? Math.max(1, janela.fim - janela.inicio) : 1440;
}

/** Segundos entre um envio e o próximo para cumprir a cota espalhada pelo período. */
export function intervaloDaCota(cota: Cota, janela: { inicio: number; fim: number } | null): number {
  const util = minutosUteisPorDia(janela) * 60;
  const total =
    cota.periodo === "hora" ? 3600 : cota.periodo === "dia" ? util : cota.periodo === "semana" ? util * 7 : util * 30;
  return Math.max(1, Math.floor(total / Math.max(1, cota.quantidade)));
}

/** O intervalo com ±10% de variação (o envio não cai sempre no mesmo minuto). */
export function intervaloComVariacao(segundos: number, sorteio: () => number = Math.random): number {
  return Math.round(segundos * (0.9 + sorteio() * 0.2));
}

/** O início do período corrente, no fuso: a hora cheia, o dia, a segunda-feira, o dia 1. */
export function inicioDoPeriodo(agora: Date, fuso: string, periodo: PeriodoDaCota): Date {
  const r = relogioNoFuso(agora, fuso);
  if (periodo === "hora") {
    return instanteDoHorarioLocal(`${r.ano}-${dois(r.mes)}-${dois(r.dia)}`, `${dois(r.hora)}:00`, fuso) ?? agora;
  }
  let ano = r.ano, mes = r.mes, dia = r.dia;
  if (periodo === "mes") dia = 1;
  if (periodo === "semana") {
    const semana = new Date(Date.UTC(r.ano, r.mes - 1, r.dia)).getUTCDay(); // 0 = domingo
    const voltar = (semana + 6) % 7; // segunda-feira
    const d = new Date(Date.UTC(r.ano, r.mes - 1, r.dia) - voltar * 86_400_000);
    ano = d.getUTCFullYear();
    mes = d.getUTCMonth() + 1;
    dia = d.getUTCDate();
  }
  return instanteDoHorarioLocal(`${ano}-${dois(mes)}-${dois(dia)}`, "00:00", fuso) ?? agora;
}

/** O início do PRÓXIMO período — quando a cota se renova. */
export function proximoPeriodo(agora: Date, fuso: string, periodo: PeriodoDaCota): Date {
  const inicio = inicioDoPeriodo(agora, fuso, periodo);
  const r = relogioNoFuso(inicio, fuso);
  const base = Date.UTC(r.ano, r.mes - 1, r.dia, 12);
  if (periodo === "hora") return new Date(inicio.getTime() + 3_600_000);
  const d =
    periodo === "dia"
      ? new Date(base + 86_400_000)
      : periodo === "semana"
        ? new Date(base + 7 * 86_400_000)
        : new Date(Date.UTC(r.ano, r.mes, 1, 12));
  const data = `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
  return instanteDoHorarioLocal(data, "00:00", fuso) ?? new Date(inicio.getTime() + 86_400_000);
}

/** "≈ 1 a cada 3 h" — o resumo da divisão, para a tela. */
export function descricaoDoIntervalo(segundos: number): { valor: number; unidade: "s" | "min" | "h" | "dias" } {
  if (segundos < 120) return { valor: segundos, unidade: "s" };
  if (segundos < 7200) return { valor: Math.round(segundos / 60), unidade: "min" };
  if (segundos < 172_800) return { valor: Math.round((segundos / 3600) * 10) / 10, unidade: "h" };
  return { valor: Math.round((segundos / 86_400) * 10) / 10, unidade: "dias" };
}
