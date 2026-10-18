"use client";

import { useReactFlow, useStore, useStoreApi, type ReactFlowState } from "@xyflow/react";
import { Lock, LockOpen, Minus, Plus, Scan } from "lucide-react";

import { useT } from "@/hooks/i18n/useT";

const travado = (s: ReactFlowState) => !s.nodesDraggable && !s.nodesConnectable && !s.elementsSelectable;
const zoomAtual = (s: ReactFlowState) => s.transform[2];

/**
 * Zoom do canvas de FLUXOS (canto inferior esquerdo): +, −, ajustar à tela e
 * travar, com o zoom atual embaixo. Fica DENTRO do <ReactFlow> (lê o store),
 * mas fora do viewport: nenhuma alça passa por cima dele.
 */
export function ControlesDoCanvas() {
  const t = useT();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore(zoomAtual);
  const estaTravado = useStore(travado);
  const store = useStoreApi();

  // O mesmo que o cadeado dos Controls do XYFlow faz.
  const alternarTrava = () => {
    const livre = estaTravado;
    store.setState({ nodesDraggable: livre, nodesConnectable: livre, elementsSelectable: livre });
  };

  return (
    <div className="fx-overlay fx-panel fx-zoom" data-testid="fluxo-zoom">
      <button type="button" onClick={() => void zoomIn({ duration: 150 })} aria-label={t("Aumentar zoom")} title={t("Aumentar zoom")}>
        <Plus size={15} aria-hidden />
      </button>
      <button type="button" onClick={() => void zoomOut({ duration: 150 })} aria-label={t("Diminuir zoom")} title={t("Diminuir zoom")}>
        <Minus size={15} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => void fitView({ padding: 0.2, maxZoom: 1, duration: 200 })}
        aria-label={t("Ajustar à tela")}
        title={t("Ajustar à tela")}
      >
        <Scan size={15} aria-hidden />
      </button>
      <button
        type="button"
        onClick={alternarTrava}
        aria-pressed={estaTravado}
        aria-label={estaTravado ? t("Destravar canvas") : t("Travar canvas")}
        title={estaTravado ? t("Destravar canvas") : t("Travar canvas")}
      >
        {estaTravado ? <Lock size={15} aria-hidden /> : <LockOpen size={15} aria-hidden />}
      </button>
      <span className="fx-zoom__valor" data-testid="fluxo-zoom-valor">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}
