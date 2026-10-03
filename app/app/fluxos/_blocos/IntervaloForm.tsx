"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { intervaloConfigSchema, UNIDADES_DO_INTERVALO } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import { Plus, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";

/**
 * Bloco Intervalo inteligente (fork jhoow, Fase C): espera um tempo, até uma
 * data (aceita variável), ou até estar dentro de um horário — no fuso da
 * organização. Enquanto espera, o contato segue no fluxo (o agente não responde).
 */
type Config = ConfigOf<"intervalo">;
type Janela = { dia: number; inicio: string; fim: string };

const ROTULO_DO_MODO: Record<Config["modo"], string> = {
  duracao: "Por tempo",
  data: "Até uma data",
  horarios: "Até um horário",
};
const ROTULO_DA_UNIDADE: Record<(typeof UNIDADES_DO_INTERVALO)[number], string> = {
  segundos: "Segundos",
  minutos: "Minutos",
  horas: "Horas",
  dias: "Dias",
};
const ROTULO_DO_DIA: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

export function IntervaloForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const [modo, setModo] = useState<Config["modo"]>(config.modo);
  const [duracao, setDuracao] = useState(
    config.modo === "duracao" ? { valor: config.valor, unidade: config.unidade } : { valor: 30, unidade: "minutos" as const },
  );
  const [quando, setQuando] = useState(config.modo === "data" ? config.quando : "");
  const [janelas, setJanelas] = useState<Janela[]>(
    config.modo === "horarios" ? config.janelas : [{ dia: 1, inicio: "08:00", fim: "18:00" }],
  );
  const [erro, setErro] = useState<string | null>(null);

  function gravar(next: { modo: Config["modo"]; duracao: typeof duracao; quando: string; janelas: Janela[] }) {
    setModo(next.modo);
    setDuracao(next.duracao);
    setQuando(next.quando);
    setJanelas(next.janelas);
    const candidato =
      next.modo === "duracao"
        ? { modo: "duracao", ...next.duracao }
        : next.modo === "data"
          ? { modo: "data", quando: next.quando }
          : { modo: "horarios", janelas: next.janelas };
    const r = intervaloConfigSchema.safeParse(candidato);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }
  const atual = { modo, duracao, quando, janelas };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 text-xs">
        {(Object.keys(ROTULO_DO_MODO) as Config["modo"][]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={modo === m}
            onClick={() => gravar({ ...atual, modo: m })}
            className={cn(
              "rounded-full border px-2.5 py-0.5",
              modo === m ? "border-accent bg-accent-soft text-accent-text" : "border-border text-text-muted",
            )}
          >
            {t(ROTULO_DO_MODO[m])}
          </button>
        ))}
      </div>

      {modo === "duracao" && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            className="w-24"
            aria-label={t("Quanto tempo")}
            value={duracao.valor}
            onChange={(e) => gravar({ ...atual, duracao: { ...duracao, valor: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
          />
          <Select
            value={duracao.unidade}
            onValueChange={(v) => gravar({ ...atual, duracao: { ...duracao, unidade: v as typeof duracao.unidade } })}
          >
            <SelectTrigger className="w-32" aria-label={t("Unidade")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIDADES_DO_INTERVALO.map((u) => (
                <SelectItem key={u} value={u}>
                  {t(ROTULO_DA_UNIDADE[u])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {modo === "data" && (
        <div className="space-y-2">
          <Label htmlFor="intervalo-quando">{t("Data e hora")}</Label>
          <Input
            id="intervalo-quando"
            placeholder="10/10/2026 14:30"
            value={quando}
            maxLength={200}
            onChange={(e) => gravar({ ...atual, quando: e.target.value })}
          />
          <p className="text-xs text-text-muted">
            {t("Aceita DD/MM/AAAA HH:MM ou um campo da ficha, como {data_sessao}. Data já passada ou ilegível: o fluxo segue na hora.")}
          </p>
        </div>
      )}

      {modo === "horarios" && (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {janelas.map((j, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Select
                  value={String(j.dia)}
                  onValueChange={(v) => gravar({ ...atual, janelas: janelas.map((x, k) => (k === i ? { ...x, dia: Number(v) } : x)) })}
                >
                  <SelectTrigger className="w-28" aria-label={t("Dia da semana")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {t(ROTULO_DO_DIA[d]!)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="time"
                  className="w-24"
                  aria-label={t("Início")}
                  value={j.inicio}
                  onChange={(e) => gravar({ ...atual, janelas: janelas.map((x, k) => (k === i ? { ...x, inicio: e.target.value } : x)) })}
                />
                <Input
                  type="time"
                  className="w-24"
                  aria-label={t("Fim")}
                  value={j.fim}
                  onChange={(e) => gravar({ ...atual, janelas: janelas.map((x, k) => (k === i ? { ...x, fim: e.target.value } : x)) })}
                />
                <button
                  type="button"
                  className="rounded p-1 text-error-fg hover:bg-surface-elevated disabled:opacity-30"
                  disabled={janelas.length === 1}
                  aria-label={t("Remover horário")}
                  onClick={() => gravar({ ...atual, janelas: janelas.filter((_, k) => k !== i) })}
                >
                  <Trash size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={janelas.length >= 21}
            onClick={() => gravar({ ...atual, janelas: [...janelas, { dia: 1, inicio: "08:00", fim: "18:00" }] })}
          >
            <Plus size={12} className="mr-1" aria-hidden />
            {t("Adicionar horário")}
          </Button>
          <p className="text-xs text-text-muted">
            {t("Dentro de um destes horários o fluxo segue na hora; fora, espera o próximo começar. Fuso da empresa.")}
          </p>
        </div>
      )}
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
