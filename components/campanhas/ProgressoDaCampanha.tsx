"use client";

import { Card } from "@/components/ui/card";
import { useEtapas, useFunis } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";

export interface NumerosDoProgresso {
  elegiveis: number;
  enviados: number;
  pendentes: number;
  responderam: number;
}

/** "67% enviadas · 123/180 respondidas" — puro, testável. */
export function resumoDoProgresso(n: NumerosDoProgresso): { pct: number; texto: string } {
  const pct = n.elegiveis > 0 ? Math.round((n.enviados / n.elegiveis) * 100) : 0;
  return { pct, texto: `${pct}% enviadas · ${n.responderam}/${n.enviados} respondidas` };
}

function NomeDaEtapa({ funil, etapa }: { funil: string | null | undefined; etapa: string | null | undefined }) {
  const t = useT();
  const funis = useFunis();
  const etapas = useEtapas(funil || null);
  if (!funil) return <span className="text-muted-foreground">{t("Sem etapa definida")}</span>;
  const nomeDoFunil = (funis.data ?? []).find((f) => f.id === funil)?.name ?? "…";
  const nomeDaEtapa = etapa ? ((etapas.data ?? []).find((e) => e.id === etapa)?.name ?? "…") : t("Etapa de entrada");
  return (
    <span>
      {nomeDoFunil} · <strong>{nomeDaEtapa}</strong>
    </span>
  );
}

/**
 * O PROGRESSO da campanha no funil (fork jhoow, Campanhas › item 3): dois cartões
 * — "Quem recebe" (a etapa em que o contato entra ao receber) e "Quem responde"
 * (a etapa para onde vai ao responder) — e a barra de envio/resposta.
 */
export function ProgressoDaCampanha({
  recebe,
  responde,
  numeros,
}: {
  recebe: { funil: string | null | undefined; etapa: string | null | undefined };
  responde: { funil: string | null | undefined; etapa: string | null | undefined };
  numeros: NumerosDoProgresso | null;
}) {
  const t = useT();
  const n = numeros ?? { elegiveis: 0, enviados: 0, pendentes: 0, responderam: 0 };
  const { pct } = resumoDoProgresso(n);
  return (
    <Card className="space-y-4 p-4" data-testid="progresso-da-campanha">
      <h2 className="font-medium">{t("Progresso")}</h2>
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2 rounded-lg border border-border p-4" data-testid="card-quem-recebe">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>↗</span> {t("Quem recebe")}
          </p>
          <p className="text-sm">
            <NomeDaEtapa funil={recebe.funil} etapa={recebe.etapa} />
          </p>
          <p className="text-2xl font-bold tabular-nums">{n.enviados}</p>
          <p className="text-xs text-muted-foreground">
            {t("contatos receberam")} · {n.pendentes} {t("pendentes")}
          </p>
        </div>
        <div className="flex items-center justify-center text-2xl text-muted-foreground" aria-hidden>
          →
        </div>
        <div className="space-y-2 rounded-lg border border-border p-4" data-testid="card-quem-responde">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>↗</span> {t("Quem responde")}
          </p>
          <p className="text-sm">
            <NomeDaEtapa funil={responde.funil} etapa={responde.etapa} />
          </p>
          <p className="text-2xl font-bold tabular-nums">{n.responderam}</p>
          <p className="text-xs text-muted-foreground">{t("responderam")}</p>
        </div>
      </div>
      <div className="space-y-1">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm tabular-nums" data-testid="resumo-do-progresso">
          {pct}% {t("enviadas")} · {n.responderam}/{n.enviados} {t("respondidas")}
        </p>
      </div>
    </Card>
  );
}
