/**
 * PROGRAMAÇÃO DA CAMPANHA (fork jhoow, "Ritmo e Programação"): o início é um
 * EVENTO — "03/12/2026 às 12:00 em Europe/Lisbon" — e vira UM instante UTC
 * (`campaigns.scheduled_at`) mais o fuso escolhido (`campaigns.timezone`). A
 * janela diária é outra coisa: uma restrição que se repete todo dia.
 *
 * Tudo aqui é aritmética de relógio com as regras do fuso IANA NA DATA
 * agendada (horário de verão incluído) via `Intl` — nunca o fuso do navegador,
 * do servidor, nem uma diferença fixa entre países.
 */

export interface PartesDoRelogio {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

const FORMATADORES = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = FORMATADORES.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATADORES.set(fuso, f);
  }
  return f;
}

/** O relógio de parede de um instante, num fuso. */
export function relogioNoFuso(instante: Date, fuso: string): PartesDoRelogio & { segundo: number } {
  const p = Object.fromEntries(formatador(fuso).formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Deslocamento do fuso (ms) NAQUELE instante: relógio local − UTC. */
function deslocamento(instante: Date, fuso: string): number {
  const r = relogioNoFuso(instante, fuso);
  const comoUtc = Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

const mesmoRelogio = (a: PartesDoRelogio, b: PartesDoRelogio) =>
  a.ano === b.ano && a.mes === b.mes && a.dia === b.dia && a.hora === b.hora && a.minuto === b.minuto;

/**
 * "AAAA-MM-DD" + "HH:mm" num fuso → o instante. `null` quando esse horário não
 * existe naquele dia (o pulo do horário de verão: em Lisboa, 29/03/2026 02:30
 * não acontece). No horário que acontece DUAS vezes (a volta), vale o primeiro.
 */
export function instanteDoHorarioLocal(data: string, hora: string, fuso: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!d || !h) return null;
  const alvo: PartesDoRelogio = { ano: +d[1]!, mes: +d[2]!, dia: +d[3]!, hora: +h[1]!, minuto: +h[2]! };
  if (alvo.mes < 1 || alvo.mes > 12 || alvo.dia < 1 || alvo.dia > 31 || alvo.hora > 23 || alvo.minuto > 59) return null;
  const comoUtc = Date.UTC(alvo.ano, alvo.mes - 1, alvo.dia, alvo.hora, alvo.minuto);
  // Os dois deslocamentos possíveis em volta do horário (antes e depois de uma
  // eventual mudança); o candidato que devolve o MESMO relógio é o certo.
  const candidatos = [comoUtc - 36 * 3600_000, comoUtc + 36 * 3600_000, comoUtc]
    .map((t) => deslocamento(new Date(t), fuso))
    .filter((o, i, a) => a.indexOf(o) === i)
    .map((o) => new Date(comoUtc - o))
    .filter((inst) => mesmoRelogio(relogioNoFuso(inst, fuso), alvo))
    .sort((a, b) => a.getTime() - b.getTime());
  return candidatos[0] ?? null;
}

const dois = (n: number) => String(n).padStart(2, "0");

/** O instante como os campos da tela: data "AAAA-MM-DD" e hora "HH:mm", no fuso. */
export function camposDoInstante(instante: Date, fuso: string): { data: string; hora: string } {
  const r = relogioNoFuso(instante, fuso);
  return { data: `${r.ano}-${dois(r.mes)}-${dois(r.dia)}`, hora: `${dois(r.hora)}:${dois(r.minuto)}` };
}

/** "DD/MM/AAAA" e "HH:mm" do instante, no fuso — para as frases. */
export function textoDoInstante(instante: Date, fuso: string): { data: string; hora: string } {
  const r = relogioNoFuso(instante, fuso);
  return { data: `${dois(r.dia)}/${dois(r.mes)}/${r.ano}`, hora: `${dois(r.hora)}:${dois(r.minuto)}` };
}

/** "HH:mm" ↔ minutos do dia (0..1440). `null` = inválido ou vazio. */
export function minutosDoHorario(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}
export function horarioDosMinutos(min: number): string {
  return `${dois(Math.floor(min / 60))}:${dois(min % 60)}`;
}

export interface FaltaParaComecar {
  dias: number;
  horas: number;
  minutos: number;
}

/** Quanto falta, arredondando os segundos PARA CIMA (falta 1 min, não 0). */
export function faltaAte(agora: Date, inicio: Date): FaltaParaComecar {
  const totalMin = Math.max(0, Math.ceil((inicio.getTime() - agora.getTime()) / 60_000));
  return { dias: Math.floor(totalMin / 1440), horas: Math.floor((totalMin % 1440) / 60), minutos: totalMin % 60 };
}

export interface JanelaDiaria {
  /** Minutos do dia, [inicio, fim). */
  inicio: number;
  fim: number;
}

/** O minuto do dia (0..1439) do instante, no fuso. */
export function minutoDoDia(instante: Date, fuso: string): number {
  const r = relogioNoFuso(instante, fuso);
  return r.hora * 60 + r.minuto;
}

export function dentroDaJanela(instante: Date, fuso: string, janela: JanelaDiaria | null): boolean {
  if (!janela) return true;
  const m = minutoDoDia(instante, fuso);
  return m >= janela.inicio && m < janela.fim;
}

/**
 * Quando a janela abre de novo a partir de `instante` (no fuso). O próprio
 * instante quando já está dentro.
 */
export function proximaAbertura(instante: Date, fuso: string, janela: JanelaDiaria | null): Date {
  if (!janela || dentroDaJanela(instante, fuso, janela)) return instante;
  const hoje = camposDoInstante(instante, fuso);
  const abre = horarioDosMinutos(janela.inicio);
  const hojeAbre = instanteDoHorarioLocal(hoje.data, abre, fuso);
  if (hojeAbre && hojeAbre.getTime() > instante.getTime()) return hojeAbre;
  // Amanhã (meio-dia + 24h cai sempre no dia seguinte, com ou sem horário de verão).
  const r = relogioNoFuso(instante, fuso);
  const amanha = new Date(Date.UTC(r.ano, r.mes - 1, r.dia, 12) + 24 * 3600_000);
  const data = `${amanha.getUTCFullYear()}-${dois(amanha.getUTCMonth() + 1)}-${dois(amanha.getUTCDate())}`;
  return instanteDoHorarioLocal(data, abre, fuso) ?? new Date(instante.getTime() + 24 * 3600_000);
}

export type EstadoDoInicio = "rascunho" | "agendada" | "em_execucao" | "outra";

export type ResumoDoInicio =
  | { tipo: "sem_fuso" }
  | { tipo: "invalido" }
  | { tipo: "passado"; agora: string }
  | { tipo: "agora"; agora: string; deslocado: { data: string; hora: string; hoje: boolean } | null }
  | {
      tipo: "programado";
      agora: string;
      hoje: boolean;
      data: string;
      hora: string;
      falta: FaltaParaComecar;
      deslocado: { data: string; hora: string; hoje: boolean } | null;
    };

/**
 * O resumo da tela, calculado: "Agora em Portugal são 20:37 — início
 * programado para hoje às 21:00, em 23 minutos." A frase é montada na tela
 * (tradução); aqui ficam só os números.
 */
export function resumoDoInicio(entrada: {
  agora: Date;
  fuso: string | null;
  modo: "agora" | "agendar";
  data: string;
  hora: string;
  janela: JanelaDiaria | null;
}): ResumoDoInicio {
  const { agora, fuso, janela } = entrada;
  if (!fuso) return { tipo: "sem_fuso" };
  const agoraTxt = textoDoInstante(agora, fuso).hora;
  const hojeTxt = textoDoInstante(agora, fuso).data;
  const deslocar = (inst: Date) => {
    const abre = proximaAbertura(inst, fuso, janela);
    if (abre.getTime() === inst.getTime()) return null;
    const t = textoDoInstante(abre, fuso);
    return { ...t, hoje: t.data === hojeTxt };
  };
  if (entrada.modo === "agora") return { tipo: "agora", agora: agoraTxt, deslocado: deslocar(agora) };
  const inicio = instanteDoHorarioLocal(entrada.data, entrada.hora, fuso);
  if (!inicio) return { tipo: "invalido" };
  if (inicio.getTime() <= agora.getTime()) return { tipo: "passado", agora: agoraTxt };
  const t = textoDoInstante(inicio, fuso);
  return {
    tipo: "programado",
    agora: agoraTxt,
    hoje: t.data === hojeTxt,
    data: t.data,
    hora: t.hora,
    falta: faltaAte(agora, inicio),
    deslocado: deslocar(inicio),
  };
}
