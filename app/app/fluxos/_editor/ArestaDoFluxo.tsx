"use client";

import { createContext, useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

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
 * A linha do canvas de FLUXOS — sem painel de condição. Bezier suave de 2px,
 * na cor do bloco de ORIGEM a 65% (o canvas a entrega em `style.stroke`).
 * Clicar seleciona (mais grossa, na cor cheia); Delete/Backspace apaga pelo
 * próprio React Flow; com o mouse em cima ou selecionada aparecem o rótulo da
 * saída ("Saída 1", só em bloco com várias saídas) e o X que apaga.
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
  style,
}: EdgeProps<RFEdge>) {
  const t = useT();
  const { emFoco, focar, excluir } = useContext(ArestaDoFluxoContext);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const mostrarX = Boolean(selected) || emFoco === id;
  const cor = typeof style?.stroke === "string" ? style.stroke : "var(--fx-muted-2)";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{
          stroke: selected ? cor : `color-mix(in oklch, ${cor} 65%, transparent)`,
          strokeWidth: selected ? 3 : 2,
          strokeLinecap: "round",
        }}
      />
      {mostrarX && (
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
              <span className="fx-aresta-rotulo">
                {label}
              </span>
            ) : null}
            {mostrarX && (
              <button
                type="button"
                aria-label={t("Excluir ligação")}
                title={t("Excluir ligação")}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-[#34343b] bg-[#1f1f24] text-[#f87171] shadow-sm hover:bg-[#f87171] hover:text-white"
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
