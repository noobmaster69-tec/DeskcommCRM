"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Plus, Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import {
  OPERADORES_DO_DISPARO,
  ROTULO_DO_OPERADOR_DO_DISPARO,
  salvarDisparosSchema,
  semGatilhoGlobal,
  type CondicaoDoDisparo,
  type Disparos,
  type GatilhosGlobais,
  type OperadorDoDisparo,
  type PalavraChave,
} from "@/lib/fluxos/disparos";

export interface FluxoDisparavel {
  id: string;
  nome: string;
  /** Publicado, ativo e fora do arquivo — só esses aparecem para escolher. */
  ativo: boolean;
}

const NENHUM = "__nenhum__";

type ChaveGlobal = "welcome_fluxo_id" | "conversation_closed_fluxo_id" | "default_response_fluxo_id" | "attendance_closed_fluxo_id";

const GLOBAIS: { chave: ChaveGlobal; titulo: string; dica: string }[] = [
  { chave: "welcome_fluxo_id", titulo: "Boas-vindas", dica: "Disparado para novos contatos na primeira mensagem" },
  { chave: "conversation_closed_fluxo_id", titulo: "Conversa finalizada", dica: "Disparado quando a conversa é finalizada sem um atendente humano" },
  { chave: "default_response_fluxo_id", titulo: "Resposta padrão", dica: "Disparado quando a mensagem não casa com nenhum outro gatilho — no máximo uma vez a cada X horas por contato" },
  { chave: "attendance_closed_fluxo_id", titulo: "Atendimento finalizado", dica: "Disparado quando um atendente humano finaliza o atendimento" },
];

function novaCondicao(): CondicaoDoDisparo {
  return { operador: "contem", valor: "" };
}

function novaPalavra(n: number): PalavraChave {
  return {
    id: crypto.randomUUID(),
    name: `Palavra-chave ${n}`,
    fluxo_id: null,
    logic_operator: "or",
    conditions: [novaCondicao()],
    active: true,
  };
}

/**
 * A tela Disparos (fork jhoow, item 12 — imagens 13 e 14 do Leona). Tudo é
 * editado em memória e gravado de uma vez pelo "Salvar alterações" do topo (o
 * "Salvar" de cada palavra-chave faz o mesmo).
 */
export function DisparosClient({
  inicial,
  fluxos,
  titulo,
  subtitulo,
}: {
  inicial: Disparos;
  fluxos: FluxoDisparavel[];
  titulo: string;
  subtitulo: string;
}) {
  const t = useT();
  const [salvo, setSalvo] = useState<Disparos>(inicial);
  const [palavras, setPalavras] = useState<PalavraChave[]>(inicial.palavras);
  const [globais, setGlobais] = useState<GatilhosGlobais>(inicial.globais);
  const [salvando, startTransition] = useTransition();

  const sujo = useMemo(
    () => JSON.stringify({ palavras, globais }) !== JSON.stringify({ palavras: salvo.palavras, globais: salvo.globais }),
    [palavras, globais, salvo],
  );

  // O que se escolhe: fluxos ativos. Um fluxo já escolhido que deixou de estar
  // ativo continua na lista (marcado), para a tela não esconder o que está gravado.
  const opcoes = (atual: string | null) =>
    fluxos.filter((f) => f.ativo || f.id === atual);
  const nomeDe = (f: FluxoDisparavel) => (f.ativo ? f.nome : `${f.nome} (${t("inativo")})`);

  const mudarPalavra = (id: string, patch: Partial<PalavraChave>) =>
    setPalavras((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const mudarCondicao = (id: string, i: number, patch: Partial<CondicaoDoDisparo>) =>
    setPalavras((l) =>
      l.map((p) => (p.id === id ? { ...p, conditions: p.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : p)),
    );

  function salvar() {
    const corpo = { palavras, globais };
    const valido = salvarDisparosSchema.safeParse(corpo);
    if (!valido.success) {
      toast.error(t("Confira os disparos: cada palavra-chave precisa de nome e de condições preenchidas."));
      return;
    }
    startTransition(async () => {
      const resp = await fetch("/api/v1/disparos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valido.data),
      }).catch(() => null);
      const json = (await resp?.json().catch(() => null)) as { data?: Disparos; error?: { message?: string } } | null;
      if (!resp?.ok || !json?.data) {
        toast.error(json?.error?.message ?? t("Não foi possível salvar os disparos."));
        return;
      }
      setSalvo(json.data);
      setPalavras(json.data.palavras);
      setGlobais(json.data.globais);
      toast.success(t("Disparos salvos."));
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        <Button type="button" onClick={salvar} disabled={!sujo || salvando} data-testid="disparos-salvar">
          {salvando ? t("Salvando...") : t("Salvar alterações")}
        </Button>
      </header>

      {/* ── A. Palavras-chave (imagem 13) ── */}
      <section className="space-y-3" aria-labelledby="disparos-palavras">
        <div>
          <h2 id="disparos-palavras" className="text-base font-semibold">
            {t("Palavras-chave")}
          </h2>
          <p className="text-sm text-text-muted">
            {t("Quando a mensagem do cliente casar com as condições, o fluxo escolhido começa.")}
          </p>
        </div>

        {palavras.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            {t("Nenhuma palavra-chave ainda.")}
          </p>
        )}

        {palavras.map((p) => (
          <div key={p.id} className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid={`palavra-${p.id}`}>
            <div className="flex items-center gap-2">
              <Input
                value={p.name}
                maxLength={80}
                onChange={(e) => mudarPalavra(p.id, { name: e.target.value })}
                aria-label={t("Nome da palavra-chave")}
                className="max-w-xs font-medium"
              />
              <label className="ml-auto flex items-center gap-2 text-xs text-text-muted">
                <Switch checked={p.active} onCheckedChange={(v) => mudarPalavra(p.id, { active: v })} aria-label={t("Ativa")} />
                {t("Ativa")}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Excluir palavra-chave")}
                onClick={() => setPalavras((l) => l.filter((x) => x.id !== p.id))}
                data-testid={`palavra-excluir-${p.id}`}
              >
                <Trash size={16} aria-hidden className="text-error" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="block text-xs font-medium text-text-muted">{t("Fluxo a disparar")}</span>
                <Select value={p.fluxo_id ?? NENHUM} onValueChange={(v) => mudarPalavra(p.id, { fluxo_id: v === NENHUM ? null : v })}>
                  <SelectTrigger aria-label={t("Fluxo a disparar")} data-testid={`palavra-fluxo-${p.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>{t("Escolha um fluxo")}</SelectItem>
                    {opcoes(p.fluxo_id).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {nomeDe(f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="block text-xs font-medium text-text-muted">{t("Condições")}</span>
                <Select value={p.logic_operator} onValueChange={(v) => mudarPalavra(p.id, { logic_operator: v as "and" | "or" })}>
                  <SelectTrigger aria-label={t("Lógica das condições")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="or">{t("Qualquer condição")}</SelectItem>
                    <SelectItem value="and">{t("Todas as condições")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ul className="space-y-2">
              {p.conditions.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Select value={c.operador} onValueChange={(v) => mudarCondicao(p.id, i, { operador: v as OperadorDoDisparo })}>
                    <SelectTrigger className="w-40 shrink-0" aria-label={t("Operador")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERADORES_DO_DISPARO.map((op) => (
                        <SelectItem key={op} value={op}>
                          {t(ROTULO_DO_OPERADOR_DO_DISPARO[op])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={c.valor}
                    maxLength={200}
                    placeholder={t("Valor")}
                    aria-label={t("Valor da condição")}
                    onChange={(e) => mudarCondicao(p.id, i, { valor: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("Excluir condição")}
                    disabled={p.conditions.length === 1}
                    onClick={() => mudarPalavra(p.id, { conditions: p.conditions.filter((_, j) => j !== i) })}
                  >
                    <Trash size={15} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={p.conditions.length >= 20}
                onClick={() => mudarPalavra(p.id, { conditions: [...p.conditions, novaCondicao()] })}
                data-testid={`palavra-condicao-${p.id}`}
              >
                <Plus size={14} aria-hidden className="mr-1" /> {t("Adicionar condição")}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={salvar} disabled={!sujo || salvando}>
                {t("Salvar")}
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          onClick={() => setPalavras((l) => [...l, novaPalavra(l.length + 1)])}
          disabled={palavras.length >= 100}
          data-testid="disparos-nova-palavra"
        >
          <Plus size={16} aria-hidden className="mr-1.5" /> {t("Adicionar palavra-chave")}
        </Button>
      </section>

      {/* ── B. Gatilhos globais (imagem 14) ── */}
      <section className="space-y-3" aria-labelledby="disparos-globais">
        <div className="flex items-center gap-2">
          <h2 id="disparos-globais" className="text-base font-semibold">
            {t("Gatilhos globais")}
          </h2>
          {semGatilhoGlobal(globais) && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400" data-testid="disparos-sem-fluxos">
              {t("Sem fluxos")}
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GLOBAIS.map((g) => (
            <div key={g.chave} className="space-y-2 rounded-lg border border-border bg-surface p-4" data-testid={`global-${g.chave}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{t(g.titulo)}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-text-muted hover:text-text" aria-label={t(g.dica)}>
                      <Info size={14} aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t(g.dica)}</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={globais[g.chave] ?? NENHUM}
                  onValueChange={(v) => setGlobais((x) => ({ ...x, [g.chave]: v === NENHUM ? null : v }))}
                >
                  <SelectTrigger aria-label={t(g.titulo)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>{t("Nenhum fluxo")}</SelectItem>
                    {opcoes(globais[g.chave]).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {nomeDe(f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {g.chave === "default_response_fluxo_id" && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={globais.default_response_hours}
                      onChange={(e) =>
                        setGlobais((x) => ({
                          ...x,
                          default_response_hours: Math.min(720, Math.max(1, Math.round(Number(e.target.value) || 1))),
                        }))
                      }
                      aria-label={t("Intervalo da resposta padrão, em horas")}
                      className="w-20"
                      data-testid="disparos-horas"
                    />
                    <span className="text-sm text-text-muted">h</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}
