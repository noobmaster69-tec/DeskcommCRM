"use client";
import Link from "next/link";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { CaretDown, Check, List, Plus } from "@/lib/ui/icons";

import { CorDoFunil, type FunilDoSeletor } from "./CorDoFunil";
import { GerenciarFunisDialog } from "./GerenciarFunisDialog";
import { NovoFunilDialog } from "./NovoFunilDialog";

/**
 * O topo do quadro no formato do Kommo: "FUNIL DE VENDAS ▼" lista os funis do
 * MESMO CRM e troca o quadro; "+ Adicionar funil" no fim da lista; o ícone ☰ ao
 * lado abre "Gerenciar funis". Os dois últimos só para manager+ — o mesmo corte
 * das rotas de funil (`requireRole("manager")`).
 *
 * O nome do funil continua sendo o <h1> da página: o seletor é o título, com a
 * troca dentro dele.
 */
export function SeletorDeFunil({
  pipelineId,
  nomeAtual,
  crmId,
  funis,
  podeGerenciar,
}: {
  pipelineId: string;
  nomeAtual: string;
  /** `null` só num banco sem a 9004 — aí não há irmãos para listar. */
  crmId: string | null;
  funis: FunilDoSeletor[];
  podeGerenciar: boolean;
}) {
  const t = useT();
  const [novo, setNovo] = useState(false);
  const [gerenciar, setGerenciar] = useState(false);
  const atual = funis.find((f) => f.id === pipelineId) ?? null;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu>
        <h1 className="min-w-0">
          <DropdownMenuTrigger
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left text-2xl font-semibold uppercase tracking-tight hover:bg-surface focus-visible:bg-surface"
            data-testid="seletor-de-funil"
            // Sem aria-label de propósito: ele viraria o nome do <h1> e quem
            // procura o título pelo nome do funil deixaria de achá-lo. O botão já
            // é anunciado como menu (aria-haspopup, do Radix).
            title={t("Trocar de funil")}
          >
            <CorDoFunil cor={atual?.color ?? null} className="h-3 w-3" />
            <span className="truncate">{nomeAtual}</span>
            <CaretDown size={18} className="shrink-0 text-text-muted" aria-hidden />
          </DropdownMenuTrigger>
        </h1>
        <DropdownMenuContent align="start" className="w-72" data-testid="lista-de-funis">
          {funis.map((f) => (
            <DropdownMenuItem key={f.id} asChild>
              <Link
                href={`/app/pipelines/${f.id}`}
                className="flex items-center gap-2"
                data-testid={`funil-${f.id}`}
                aria-current={f.id === pipelineId ? "page" : undefined}
              >
                <CorDoFunil cor={f.color} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.is_primary && (
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    {t("Principal")}
                  </span>
                )}
                {f.id === pipelineId && <Check size={14} aria-label={t("Funil atual")} />}
              </Link>
            </DropdownMenuItem>
          ))}
          {podeGerenciar && crmId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setNovo(true)} data-testid="adicionar-funil">
                <Plus size={14} className="mr-2" aria-hidden /> {t("Adicionar funil")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {podeGerenciar && crmId && (
        <button
          type="button"
          onClick={() => setGerenciar(true)}
          className="rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text"
          title={t("Gerenciar funis")}
          aria-label={t("Gerenciar funis")}
          data-testid="gerenciar-funis"
        >
          <List size={20} aria-hidden />
        </button>
      )}

      {novo && crmId && <NovoFunilDialog open onOpenChange={setNovo} crmId={crmId} />}
      {gerenciar && (
        <GerenciarFunisDialog open onOpenChange={setGerenciar} funis={funis} pipelineAtualId={pipelineId} />
      )}
    </div>
  );
}
