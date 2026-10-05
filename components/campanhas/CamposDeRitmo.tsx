"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { FUSOS_PRINCIPAIS, fusoValido, horaAgoraNoFuso, todosOsFusos } from "@/lib/campanhas/fuso";
import { horaNoFuso } from "@/lib/campanhas/relogio";

export interface ValoresDeRitmo {
  minIntervalo: string;
  maxIntervalo: string;
  tetoDiario: string;
  tetoHorario: string;
  janelaInicio: string;
  janelaFim: string;
  /** "" = o fuso do número. */
  fuso: string;
}

export type ErroDoRitmo = "minimo" | "maximo" | "fuso";

/** A frase de cada erro — tabela constante, para o t() achar no dicionário. */
export const TEXTO_DO_ERRO_DO_RITMO: Record<ErroDoRitmo, string> = {
  minimo: "O intervalo mínimo é de pelo menos 10 segundos.",
  maximo: "O intervalo máximo não pode ser menor que o mínimo.",
  fuso: "Fuso horário desconhecido.",
};

/** Os erros que a tela mostra antes de deixar salvar. */
export function errosDoRitmo(v: ValoresDeRitmo): ErroDoRitmo[] {
  const erros: ErroDoRitmo[] = [];
  const min = Number(v.minIntervalo);
  const max = Number(v.maxIntervalo);
  if (!Number.isFinite(min) || min < 10) erros.push("minimo");
  if (!Number.isFinite(max) || max < min) erros.push("maximo");
  if (v.fuso && !fusoValido(v.fuso)) erros.push("fuso");
  return erros;
}

const OUTRO = "__outro__";
const FUSO_PADRAO_DA_PREVIA = "America/Sao_Paulo";

/**
 * O ritmo da campanha (fork jhoow, Campanhas › item 7): intervalo SORTEADO
 * entre mínimo e máximo, tetos, janela e o FUSO em que a janela vale — com a
 * prévia "agora no fuso escolhido são HH:MM — pode enviar". Usado na criação e
 * no ajuste de uma campanha já rodando.
 */
export function CamposDeRitmo({
  v,
  onChange,
  prefixo,
}: {
  v: ValoresDeRitmo;
  onChange: (campo: keyof ValoresDeRitmo, valor: string) => void;
  prefixo: string;
}) {
  const t = useT();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const principais = FUSOS_PRINCIPAIS.map((f) => f.fuso) as readonly string[];
  const ehOutro = v.fuso !== "" && !principais.includes(v.fuso);
  const [mostrarOutro, setMostrarOutro] = useState(ehOutro);
  const lista = useMemo(() => (mostrarOutro ? todosOsFusos() : []), [mostrarOutro]);

  const fusoDaPrevia = v.fuso && fusoValido(v.fuso) ? v.fuso : FUSO_PADRAO_DA_PREVIA;
  const hora = horaNoFuso(agora, fusoDaPrevia);
  const inicio = v.janelaInicio === "" ? null : Number(v.janelaInicio);
  const fim = v.janelaFim === "" ? null : Number(v.janelaFim);
  const dentro = inicio === null || fim === null || (hora >= inicio && hora < fim);
  const erros = errosDoRitmo(v);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-min`}>{t("Intervalo mínimo (segundos)")}</Label>
          <Input id={`${prefixo}-min`} type="number" min={10} value={v.minIntervalo} onChange={(e) => onChange("minIntervalo", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-max`}>{t("Intervalo máximo (segundos)")}</Label>
          <Input id={`${prefixo}-max`} type="number" min={10} value={v.maxIntervalo} onChange={(e) => onChange("maxIntervalo", e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("Cada envio aguarda um tempo aleatório entre esses valores. Evita o padrão robótico que o WhatsApp detecta.")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-dia`}>{t("Máximo por dia")}</Label>
          <Input id={`${prefixo}-dia`} type="number" min={1} value={v.tetoDiario} onChange={(e) => onChange("tetoDiario", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-hora`}>{t("Máximo por hora")}</Label>
          <Input id={`${prefixo}-hora`} type="number" min={1} value={v.tetoHorario} onChange={(e) => onChange("tetoHorario", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-inicio`}>{t("Enviar só a partir das (hora)")}</Label>
          <Input id={`${prefixo}-inicio`} type="number" min={0} max={23} value={v.janelaInicio} onChange={(e) => onChange("janelaInicio", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefixo}-fim`}>{t("Parar de enviar às (hora)")}</Label>
          <Input id={`${prefixo}-fim`} type="number" min={1} max={24} value={v.janelaFim} onChange={(e) => onChange("janelaFim", e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefixo}-fuso`}>{t("Fuso horário desta campanha")}</Label>
        <select
          id={`${prefixo}-fuso`}
          className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          value={mostrarOutro ? OUTRO : v.fuso}
          onChange={(e) => {
            if (e.target.value === OUTRO) {
              setMostrarOutro(true);
              return;
            }
            setMostrarOutro(false);
            onChange("fuso", e.target.value);
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
            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            value={v.fuso}
            onChange={(e) => onChange("fuso", e.target.value)}
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
        <p className="text-sm" data-testid={`${prefixo}-previa-do-fuso`}>
          {t("Agora no fuso selecionado são")} {horaAgoraNoFuso(agora, fusoDaPrevia)} —{" "}
          {dentro ? (
            <span className="text-success-fg">{t("a campanha pode enviar")}</span>
          ) : (
            <span className="text-warning-fg">{t("fora da janela de envio")}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("Quando o fuso do contato é conhecido (campo timezone da ficha ou o DDI de um país de fuso único), a janela vale no fuso dele.")}
        </p>
      </div>
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
