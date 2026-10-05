"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import {
  type FaltaParaComecar,
  type JanelaDiaria,
  type ResumoDoInicio,
  camposDoInstante,
  horarioDosMinutos,
  instanteDoHorarioLocal,
  minutosDoHorario,
  resumoDoInicio,
} from "@/lib/campanhas/agendamento";
import { FUSOS_PRINCIPAIS, fusoValido, todosOsFusos } from "@/lib/campanhas/fuso";

export interface ValoresDeRitmo {
  minIntervalo: string;
  maxIntervalo: string;
  tetoDiario: string;
  tetoHorario: string;
  /** Janela diária "HH:mm" ("" = sem janela própria). */
  janelaInicio: string;
  janelaFim: string;
  /** "" = o fuso do número. */
  fuso: string;
  /** Início da campanha (só na criação/edição do rascunho). */
  inicioModo?: "agora" | "agendar";
  /** "AAAA-MM-DD" e "HH:mm", no fuso da campanha. */
  inicioData?: string;
  inicioHora?: string;
}

export type ErroDoRitmo = "minimo" | "maximo" | "fuso" | "janela" | "agenda_sem_fuso" | "agenda_invalida" | "agenda_passado";

/** A frase de cada erro — tabela constante, para o t() achar no dicionário. */
export const TEXTO_DO_ERRO_DO_RITMO: Record<ErroDoRitmo, string> = {
  minimo: "O intervalo mínimo é de pelo menos 10 segundos.",
  maximo: "O intervalo máximo não pode ser menor que o mínimo.",
  fuso: "Fuso horário desconhecido.",
  janela: "A janela diária precisa de início e fim (HH:mm), e o fim depois do início.",
  agenda_sem_fuso: "Para agendar, escolha o fuso horário da campanha.",
  agenda_invalida: "Escolha uma data e um horário válidos — esse horário não existe nesse dia no fuso escolhido (mudança de horário de verão).",
  agenda_passado: "O horário agendado já passou. Escolha uma data e hora no futuro.",
};

/** A janela em minutos, ou `null` quando vazia/incompleta. */
export function janelaDosValores(v: Pick<ValoresDeRitmo, "janelaInicio" | "janelaFim">): JanelaDiaria | null {
  const inicio = minutosDoHorario(v.janelaInicio);
  const fim = minutosDoHorario(v.janelaFim);
  return inicio !== null && fim !== null && fim > inicio ? { inicio, fim } : null;
}

/** Os erros que a tela mostra antes de deixar salvar. */
export function errosDoRitmo(v: ValoresDeRitmo, agora: Date = new Date()): ErroDoRitmo[] {
  const erros: ErroDoRitmo[] = [];
  const min = Number(v.minIntervalo);
  const max = Number(v.maxIntervalo);
  if (!Number.isFinite(min) || min < 10) erros.push("minimo");
  if (!Number.isFinite(max) || max < min) erros.push("maximo");
  if (v.fuso && !fusoValido(v.fuso)) erros.push("fuso");
  const algumaJanela = v.janelaInicio.trim() !== "" || v.janelaFim.trim() !== "";
  if (algumaJanela && !janelaDosValores(v)) erros.push("janela");
  if (v.inicioModo === "agendar") {
    if (!v.fuso || !fusoValido(v.fuso)) erros.push("agenda_sem_fuso");
    else {
      const inicio = instanteDoHorarioLocal(v.inicioData ?? "", v.inicioHora ?? "", v.fuso);
      if (!inicio) erros.push("agenda_invalida");
      else if (inicio.getTime() <= agora.getTime()) erros.push("agenda_passado");
    }
  }
  return erros;
}

/** Os valores de janela e início de uma campanha gravada. */
export function programacaoDaCampanha(c: {
  janela_inicio_hora?: number | null;
  janela_fim_hora?: number | null;
  janela_inicio_minuto?: number | null;
  janela_fim_minuto?: number | null;
  scheduled_at?: string | null;
  timezone?: string | null;
}): Pick<ValoresDeRitmo, "janelaInicio" | "janelaFim" | "inicioModo" | "inicioData" | "inicioHora"> {
  const ini = c.janela_inicio_minuto ?? (c.janela_inicio_hora != null ? c.janela_inicio_hora * 60 : null);
  const fim = c.janela_fim_minuto ?? (c.janela_fim_hora != null ? c.janela_fim_hora * 60 : null);
  const agendada = !!c.scheduled_at && fusoValido(c.timezone);
  const campos = agendada ? camposDoInstante(new Date(c.scheduled_at!), c.timezone!) : { data: "", hora: "" };
  return {
    janelaInicio: ini === null ? "" : horarioDosMinutos(ini),
    janelaFim: fim === null ? "" : horarioDosMinutos(fim),
    inicioModo: agendada ? "agendar" : "agora",
    inicioData: campos.data,
    inicioHora: campos.hora,
  };
}

/** O corpo da janela para a API: em minutos (9018); a de horas é zerada. */
export function corpoDaJanela(v: Pick<ValoresDeRitmo, "janelaInicio" | "janelaFim">) {
  const j = janelaDosValores(v);
  return {
    janela_inicio_minuto: j?.inicio ?? null,
    janela_fim_minuto: j?.fim ?? null,
    janela_inicio_hora: null,
    janela_fim_hora: null,
  };
}

/** O instante agendado (ISO) — `null` em "Iniciar agora" ou quando inválido. */
export function instanteAgendado(v: ValoresDeRitmo): string | null {
  if (v.inicioModo !== "agendar" || !fusoValido(v.fuso)) return null;
  return instanteDoHorarioLocal(v.inicioData ?? "", v.inicioHora ?? "", v.fuso)?.toISOString() ?? null;
}

const OUTRO = "__outro__";
const SELECT = "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm";
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** Hora e minuto SEMPRE em HH:mm (o `<input type="time">` vira 12h em alguns navegadores). */
function HoraMinuto({
  id,
  valor,
  onChange,
  vazio,
  ateVinteQuatro,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  vazio?: string;
  ateVinteQuatro?: boolean;
}) {
  const t = useT();
  const [h, m] = valor ? valor.split(":") : ["", ""];
  const horas = ateVinteQuatro ? [...HORAS, "24"] : HORAS;
  return (
    <div className="flex items-center gap-1" data-testid={id}>
      <select
        id={id}
        aria-label={t("Hora")}
        className={SELECT}
        value={h ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : `${e.target.value}:${e.target.value === "24" ? "00" : m || "00"}`)}
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
        {horas.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span aria-hidden>:</span>
      <select
        aria-label={t("Minuto")}
        className={SELECT}
        value={m ?? ""}
        disabled={!h || h === "24"}
        onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
      >
        {!h && <option value="">--</option>}
        {MINUTOS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}

/** O nome do lugar do fuso para a frase ("Portugal"), ou o próprio fuso IANA. */
export function lugarDoFuso(fuso: string): string {
  const conhecido = FUSOS_PRINCIPAIS.find((f) => f.fuso === fuso);
  return conhecido ? conhecido.rotulo.replace(/^\S+\s+/u, "") : fuso;
}

const UNIDADES = {
  dia: ["dia", "dias"],
  hora: ["hora", "horas"],
  minuto: ["minuto", "minutos"],
} as const;

/** "58 dias, 16 horas e 23 minutos" — sem as partes zeradas; "menos de 1 minuto" nunca (arredonda para cima). */
export function useDuracao() {
  const t = useT();
  return (f: FaltaParaComecar): string => {
    const partes: string[] = [];
    const um = (n: number, u: keyof typeof UNIDADES) => `${n} ${t(UNIDADES[u][n === 1 ? 0 : 1])}`;
    if (f.dias) partes.push(um(f.dias, "dia"));
    if (f.horas) partes.push(um(f.horas, "hora"));
    if (f.minutos || partes.length === 0) partes.push(um(f.minutos, "minuto"));
    return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} ${t("e")} ${partes[partes.length - 1]}`;
  };
}

export type EstadoDaProgramacao = "previa" | "planejada" | "agendada" | "em_execucao";

const ROTULO_DO_ESTADO: Record<EstadoDaProgramacao, string> = {
  previa: "Prévia — ainda não salva",
  planejada: "Planejado — confirme em Agendar depois de preparar a lista",
  agendada: "Agendamento confirmado",
  em_execucao: "Em execução",
};

/** A frase dinâmica: "Agora em Portugal são 20:37 — início programado para hoje às 21:00, em 23 minutos." */
export function FraseDoInicio({
  resumo,
  fuso,
  estado,
  testid,
}: {
  resumo: ResumoDoInicio;
  fuso: string | null;
  estado: EstadoDaProgramacao;
  testid: string;
}) {
  const t = useT();
  const duracao = useDuracao();
  if (resumo.tipo === "sem_fuso" || !fuso) return null;
  const lugar = lugarDoFuso(fuso);
  const agoraEm = resumo.tipo === "invalido" ? "" : `${t("Agora em")} ${lugar} ${t("são")} ${resumo.agora}`;
  let frase = "";
  if (resumo.tipo === "agora") frase = `${agoraEm} — ${t("a campanha começa a enviar assim que for iniciada.")}`;
  if (resumo.tipo === "programado")
    frase = resumo.hoje
      ? `${agoraEm} — ${t("início programado para hoje às")} ${resumo.hora}, ${t("em")} ${duracao(resumo.falta)}.`
      : `${t("Início programado para")} ${resumo.data} ${t("às")} ${resumo.hora}, ${t("no fuso de")} ${lugar} — ${t("faltam")} ${duracao(resumo.falta)}.`;
  const deslocado = resumo.tipo === "agora" || resumo.tipo === "programado" ? resumo.deslocado : null;
  if (!frase) return null;
  return (
    <div className="space-y-1 rounded-md border border-border p-3 text-sm" data-testid={testid} aria-live="polite">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(ROTULO_DO_ESTADO[estado])}</p>
      <p>{frase}</p>
      {deslocado && (
        <p className="text-warning-fg">
          {t("A janela diária de envio desloca o primeiro envio para")}{" "}
          {deslocado.hoje ? t("hoje") : deslocado.data} {t("às")} {deslocado.hora}.
        </p>
      )}
    </div>
  );
}

/** Relógio que anda sozinho enquanto a tela está aberta (o resumo não envelhece). */
export function useAgora(passoMs = 15_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), passoMs);
    return () => clearInterval(id);
  }, [passoMs]);
  return agora;
}

/** O fuso da campanha: os principais primeiro; "Outro…" abre a lista IANA inteira. */
export function SeletorDeFuso({ prefixo, fuso, onFuso }: { prefixo: string; fuso: string; onFuso: (f: string) => void }) {
  const t = useT();
  const principais = FUSOS_PRINCIPAIS.map((f) => f.fuso) as readonly string[];
  const [mostrarOutro, setMostrarOutro] = useState(fuso !== "" && !principais.includes(fuso));
  const lista = useMemo(() => (mostrarOutro ? todosOsFusos() : []), [mostrarOutro]);
  return (
    <div className="space-y-2">
      <Label htmlFor={`${prefixo}-fuso`}>{t("Fuso horário da campanha")}</Label>
      <select
        id={`${prefixo}-fuso`}
        className={SELECT}
        value={mostrarOutro ? OUTRO : fuso}
        onChange={(e) => {
          if (e.target.value === OUTRO) {
            setMostrarOutro(true);
            return;
          }
          setMostrarOutro(false);
          onFuso(e.target.value);
        }}
        data-testid={`${prefixo}-fuso`}
      >
        <option value="">{t("O do número (Conexões › Proteção de envio)")}</option>
        {FUSOS_PRINCIPAIS.map((f) => (
          <option key={f.fuso} value={f.fuso}>
            {`${t(f.rotulo)} (${f.fuso})`}
          </option>
        ))}
        <option value={OUTRO}>{t("Outro…")}</option>
      </select>
      {mostrarOutro && (
        <select
          aria-label={t("Escolha o fuso")}
          className={SELECT}
          value={fuso}
          onChange={(e) => onFuso(e.target.value)}
          data-testid={`${prefixo}-fuso-outro`}
        >
          <option value="">{t("Escolha o fuso")}</option>
          {lista.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** O INÍCIO: agora ou agendado — data (calendário), HH:mm e o fuso, visível ao lado. */
export function CamposDeInicio({
  v,
  onChange,
  prefixo,
}: {
  v: Pick<ValoresDeRitmo, "fuso" | "inicioModo" | "inicioData" | "inicioHora">;
  onChange: (campo: "fuso" | "inicioModo" | "inicioData" | "inicioHora", valor: string) => void;
  prefixo: string;
}) {
  const t = useT();
  return (
    <fieldset className="space-y-3" data-testid={`${prefixo}-inicio`}>
      <legend className="text-sm font-medium">{t("Início da campanha")}</legend>
      <div role="radiogroup" aria-label={t("Início da campanha")} className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${prefixo}-inicio-modo`}
            checked={v.inicioModo !== "agendar"}
            onChange={() => onChange("inicioModo", "agora")}
          />
          {t("Iniciar agora")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${prefixo}-inicio-modo`}
            checked={v.inicioModo === "agendar"}
            onChange={() => onChange("inicioModo", "agendar")}
          />
          {t("Agendar")}
        </label>
      </div>
      {v.inicioModo === "agendar" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-data`}>{t("Data")}</Label>
            <Input
              id={`${prefixo}-data`}
              type="date"
              value={v.inicioData ?? ""}
              onChange={(e) => onChange("inicioData", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-hora-inicio`}>{t("Horário (HH:mm)")}</Label>
            <HoraMinuto
              id={`${prefixo}-hora-inicio`}
              valor={v.inicioHora ?? ""}
              vazio="--"
              onChange={(x) => onChange("inicioHora", x)}
            />
          </div>
        </div>
      )}
      <SeletorDeFuso prefixo={prefixo} fuso={v.fuso} onFuso={(f) => onChange("fuso", f)} />
      <p className="text-xs text-muted-foreground">
        {t("A data e a hora valem no fuso da campanha, com o horário de verão dessa data — não no fuso do seu computador.")}
      </p>
    </fieldset>
  );
}

/**
 * RITMO E PROGRAMAÇÃO (fork jhoow): o INÍCIO da campanha (evento: agora ou
 * agendado, com data, HH:mm e fuso), o RITMO de envio e a JANELA DIÁRIA
 * (restrição recorrente, HH:mm). Usado na criação/edição (com início) e no
 * ajuste de uma campanha viva (sem início — ela já foi programada).
 */
export function CamposDeRitmo({
  v,
  onChange,
  prefixo,
  comInicio = false,
}: {
  v: ValoresDeRitmo;
  onChange: (campo: keyof ValoresDeRitmo, valor: string) => void;
  prefixo: string;
  comInicio?: boolean;
}) {
  const t = useT();
  const agora = useAgora();
  const erros = errosDoRitmo(v, agora);
  const janela = janelaDosValores(v);
  const fuso = v.fuso && fusoValido(v.fuso) ? v.fuso : null;
  const resumo = resumoDoInicio({
    agora,
    fuso,
    modo: comInicio && v.inicioModo === "agendar" ? "agendar" : "agora",
    data: v.inicioData ?? "",
    hora: v.inicioHora ?? "",
    janela,
  });

  const seletorDeFuso = <SeletorDeFuso prefixo={prefixo} fuso={v.fuso} onFuso={(f) => onChange("fuso", f)} />;

  return (
    <div className="space-y-6">
      {comInicio && <CamposDeInicio v={v} onChange={onChange} prefixo={prefixo} />}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("Ritmo de envio")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-min`}>{t("Intervalo mínimo (segundos)")}</Label>
            <Input id={`${prefixo}-min`} type="number" min={10} value={v.minIntervalo} onChange={(e) => onChange("minIntervalo", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-max`}>{t("Intervalo máximo (segundos)")}</Label>
            <Input id={`${prefixo}-max`} type="number" min={10} value={v.maxIntervalo} onChange={(e) => onChange("maxIntervalo", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-hora`}>{t("Máximo por hora")}</Label>
            <Input id={`${prefixo}-hora`} type="number" min={1} value={v.tetoHorario} onChange={(e) => onChange("tetoHorario", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-dia`}>{t("Máximo por dia")}</Label>
            <Input id={`${prefixo}-dia`} type="number" min={1} value={v.tetoDiario} onChange={(e) => onChange("tetoDiario", e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Cada envio aguarda um tempo aleatório entre esses valores. Evita o padrão robótico que o WhatsApp detecta.")}
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("Janela diária de envio")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Restrição que se repete todo dia — não é a data de início. Em branco, vale a do número.")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-inicio`}>{t("Enviar só a partir das")}</Label>
            <HoraMinuto id={`${prefixo}-inicio`} valor={v.janelaInicio} vazio="--" onChange={(x) => onChange("janelaInicio", x)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-fim`}>{t("Parar de enviar às")}</Label>
            <HoraMinuto id={`${prefixo}-fim`} valor={v.janelaFim} vazio="--" ateVinteQuatro onChange={(x) => onChange("janelaFim", x)} />
          </div>
        </div>
        {!comInicio && seletorDeFuso}
        <p className="text-xs text-muted-foreground">
          {t("Quando o fuso do contato é conhecido (campo fuso_horario da ficha ou o DDI de um país de fuso único), a janela vale no fuso dele.")}
        </p>
      </fieldset>

      {comInicio && (
        <FraseDoInicio resumo={resumo} fuso={fuso} estado="previa" testid={`${prefixo}-resumo`} />
      )}
      {comInicio && !fuso && v.inicioModo !== "agendar" && (
        <p className="text-sm text-muted-foreground" data-testid={`${prefixo}-resumo`}>
          {t("Sem fuso próprio, a campanha segue o relógio do número.")}
        </p>
      )}
      {erros.length > 0 && (
        <ul className="space-y-1 text-sm text-error-fg" role="alert">
          {erros.map((e) => (
            <li key={e}>{t(TEXTO_DO_ERRO_DO_RITMO[e])}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
