"use client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { CorDoFunil } from "@/components/kanban/CorDoFunil";
import { LoseLeadDialog } from "@/components/kanban/LoseLeadDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { CaretDown, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Uma etapa como o seletor a mostra (rota `crm-summary`). */
export interface EtapaDoSeletor {
  id: string;
  name: string;
  color: string | null;
  is_entry: boolean;
  is_won: boolean;
  is_lost: boolean;
}

/** Um funil do CRM do negócio, com as etapas na ordem do quadro. */
export interface FunilDoSeletorDoInbox {
  id: string;
  name: string;
  color: string | null;
  is_primary: boolean;
  etapas: EtapaDoSeletor[];
}

/** O negócio que o seletor move. */
export interface NegocioDoSeletor {
  id: string;
  pipeline_id: string;
  stage_id: string;
  updated_at: string;
  funil_nome: string | null;
  etapa_nome: string | null;
}

/**
 * "Mover para funil" na conversa, no formato do Kommo (Funis no modelo Kommo,
 * Fase E): o botão mostra o funil e a etapa do negócio; aberto, lista os funis
 * do CRM dele; passar o mouse num funil mostra as etapas com as cores das
 * colunas, com ✓ na atual; clicar numa etapa move o card — para outra etapa do
 * mesmo funil ou para outro funil do MESMO CRM (o card é o mesmo, com o mesmo
 * histórico; `POST /api/v1/leads/[id]/move` e `lib/leads/mover-entre-funis.ts`).
 *
 * As regras são do servidor (campos obrigatórios e motivo de ganho do funil de
 * destino, reabertura de negócio fechado): a recusa chega pronta e aparece no
 * aviso de erro de sempre. O que a tela decide sozinha:
 *  - a etapa de PERDA do funil atual abre o pedido de motivo (o mesmo diálogo do
 *    quadro) em vez de mover direto — o banco exige o motivo;
 *  - a etapa de perda de OUTRO funil fica desabilitada: perder é encerrar onde o
 *    negócio está, e duas maneiras de perder divergiriam no primeiro ajuste.
 */
export function MoverParaFunil({
  negocio,
  funis,
  onMovido,
}: {
  negocio: NegocioDoSeletor;
  funis: FunilDoSeletorDoInbox[];
  onMovido: () => void;
}) {
  const t = useT();
  const [perdendo, setPerdendo] = useState(false);

  const mover = useMutation({
    mutationFn: (stageId: string) =>
      apiClient.post<unknown>(`/api/v1/leads/${encodeURIComponent(negocio.id)}/move`, {
        stage_id: stageId,
        expected_updated_at: negocio.updated_at,
      }),
  });

  function escolher(funil: FunilDoSeletorDoInbox, etapa: EtapaDoSeletor) {
    if (etapa.id === negocio.stage_id) return;
    if (etapa.is_lost) {
      if (funil.id === negocio.pipeline_id) setPerdendo(true);
      return;
    }
    mover.mutate(etapa.id, {
      onSuccess: () => {
        toast.success(`${t("Card movido para")} «${funil.name} · ${etapa.name}».`);
        onMovido();
      },
      onError: (e) => showApiError(e),
    });
  }

  if (funis.length === 0) return null;
  const funilAtual = funis.find((f) => f.id === negocio.pipeline_id) ?? null;

  return (
    <div className="space-y-1" data-testid="inbox-mover-para-funil">
      <span className="block text-xs font-medium text-text">{t("Funil e etapa")}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={mover.isPending}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs hover:bg-surface-elevated disabled:opacity-60"
          data-testid="inbox-funil-trigger"
        >
          <CorDoFunil cor={funilAtual?.color ?? null} />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold uppercase">{negocio.funil_nome ?? funilAtual?.name ?? "—"}</span>
            {negocio.etapa_nome ? <span className="text-muted-foreground"> · {negocio.etapa_nome}</span> : null}
          </span>
          <CaretDown size={12} className="shrink-0 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64" data-testid="inbox-funis">
          {funis.map((funil) => (
            <DropdownMenuSub key={funil.id}>
              <DropdownMenuSubTrigger className="gap-2 text-xs" data-testid={`inbox-funil-${funil.id}`}>
                <CorDoFunil cor={funil.color} />
                <span className="min-w-0 flex-1 truncate font-medium uppercase">{funil.name}</span>
                {funil.id === negocio.pipeline_id && <Check size={12} aria-label={t("Funil atual")} />}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-60 p-0" data-testid={`inbox-etapas-${funil.id}`}>
                {funil.etapas.map((etapa) => {
                  const atual = etapa.id === negocio.stage_id;
                  const perdaDeOutroFunil = etapa.is_lost && funil.id !== negocio.pipeline_id;
                  return (
                    <DropdownMenuItem
                      key={etapa.id}
                      disabled={perdaDeOutroFunil}
                      title={perdaDeOutroFunil ? t("Para perder o negócio, use a etapa de perda do funil onde ele está.") : undefined}
                      onSelect={() => escolher(funil, etapa)}
                      className={cn("gap-2 rounded-none px-3 py-2 text-xs", etapa.color && "text-black/80 focus:text-black")}
                      style={etapa.color ? { backgroundColor: etapa.color } : undefined}
                      data-testid={`inbox-etapa-${etapa.id}`}
                      aria-current={atual ? "true" : undefined}
                    >
                      <span className="w-3 shrink-0">{atual && <Check size={12} aria-hidden />}</span>
                      <span className="min-w-0 flex-1 truncate">{etapa.name}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {perdendo && (
        <LoseLeadDialog
          open
          onOpenChange={(aberto) => {
            if (!aberto) {
              setPerdendo(false);
              onMovido();
            }
          }}
          leadId={negocio.id}
          pipelineId={negocio.pipeline_id}
        />
      )}
    </div>
  );
}
