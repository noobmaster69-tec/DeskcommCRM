"use client";

import { createContext, useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import type { RFEdge } from "@/lib/followup/graph-mappers";
import { X } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

interface ContextoDaAresta {
  /** A linha sob o mouse (o canvas acompanha por onEdgeMouseEnter/Leave). */
  emFoco: string | null;
  focar: (id: string | null) => void;
  excluir: (id: string) => void;
}

/**
 * O canvas entrega por contexto o que a linha precisa e não cabe no `data` da
 * aresta: o `data` é o que o mapper grava no grafo, e "está sob o mouse" não é
 * grafo.
 */
export const ArestaDoFluxoContext = createContext<ContextoDaAresta>({
  emFoco: null,
  focar: () => {},
  excluir: () => {},
});

/**
 * A linha do canvas de FLUXOS (fork jhoow, item 6) — sem painel de condição.
 * Clicar seleciona (linha mais grossa, na cor de destaque); Delete/Backspace
 * apaga pelo próprio React Flow; com o mouse em cima ou selecionada, um X no
 * meio da linha apaga com um clique. O rótulo só existe quando a linha sai de
 * um bloco com várias saídas (`rotuloDaArestaDoFluxo`).
 */
export function ArestaDoFluxo({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  label,
  markerEnd,
}: EdgeProps<RFEdge>) {
  const t = useT();
  const { emFoco, focar, excluir } = useContext(ArestaDoFluxoContext);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const mostrarX = Boolean(selected) || emFoco === id;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={selected ? { stroke: "var(--color-accent)", strokeWidth: 3 } : { strokeWidth: 1.5 }}
      />
      {(label || mostrarX) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            // Ir da linha ao X é sair da linha: sem isto o X sumiria antes do clique.
            onMouseEnter={() => focar(id)}
            onMouseLeave={() => focar(null)}
            data-testid={`aresta-rotulo-${id}`}
          >
            {label ? (
              <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-text">
                {label}
              </span>
            ) : null}
            {mostrarX && (
              <button
                type="button"
                aria-label={t("Excluir ligação")}
                title={t("Excluir ligação")}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-error shadow-sm hover:bg-error hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  excluir(id);
                }}
                data-testid={`excluir-aresta-${id}`}
              >
                <X size={11} aria-hidden />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
