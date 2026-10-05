"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NodeType } from "@/lib/followup/graph-schema";
import { NOS_DA_SUPERFICIE } from "@/lib/followup/validate-publish";
import { MagnifyingGlass, SquaresFour } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";

import { corDoBloco } from "./cores-dos-blocos";

/** O mesmo MIME que o `onDrop` do canvas lê — arrastar do popover continua valendo. */
export const DND_MIME_DO_BLOCO = "application/x-followup-node-type";

/** Normaliza para a busca: sem acento, sem caixa ("notificacao" acha "Notificação"). */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

interface Props {
  /** Clique num bloco: o canvas o põe no centro da área visível. */
  onAdd: (tipo: NodeType) => void;
}

/**
 * O botão roxo "Ferramentas" do canto do canvas de FLUXOS (fork jhoow, item 4),
 * no lugar da paleta fixa de 224px — o canvas fica com a largura toda, como no
 * Leona (imagem 6). Abre um popover com busca e a lista dos blocos; clicar
 * adiciona no centro da tela, arrastar solta onde o mouse estiver. Clicar fora
 * fecha (Radix).
 */
export function FerramentasPopover({ onAdd }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const blocos = useMemo(() => {
    const q = normalizarBusca(busca);
    return NOS_DA_SUPERFICIE.fluxo
      .map((tipo) => NODE_VISUALS[tipo])
      .filter((v) => q === "" || normalizarBusca(t(v.paletteLabel)).includes(q));
  }, [busca, t]);

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-violet-600 px-3 text-sm font-medium text-white shadow-md transition-colors hover:bg-violet-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-violet-300"
          data-testid="ferramentas-botao"
        >
          <SquaresFour size={16} weight="fill" aria-hidden />
          {t("Ferramentas")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-72 p-2"
        data-testid="ferramentas-popover"
      >
        <div className="relative mb-2">
          <MagnifyingGlass
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar blocos...")}
            aria-label={t("Buscar blocos...")}
            className="h-8 pl-8 text-sm"
            data-testid="ferramentas-busca"
          />
        </div>
        <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto" role="list">
          {blocos.map((visual) => {
            const Icon = visual.icon;
            const cor = corDoBloco(visual.type);
            return (
              <li key={visual.type}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME_DO_BLOCO, visual.type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  // Fecha só no FIM do arrasto: desmontar o item no início
                  // cancelaria o arrasto em alguns navegadores.
                  onDragEnd={() => setAberto(false)}
                  onClick={() => {
                    onAdd(visual.type);
                    setAberto(false);
                    setBusca("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-hidden"
                  data-testid={`ferramenta-${visual.type}`}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${cor}26`, color: cor }}
                  >
                    <Icon size={15} aria-hidden />
                  </span>
                  <span className="truncate font-medium text-text">{t(visual.paletteLabel)}</span>
                </button>
              </li>
            );
          })}
          {blocos.length === 0 && (
            <li className="px-2 py-3 text-center text-xs text-text-muted">{t("Nenhum bloco encontrado.")}</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
