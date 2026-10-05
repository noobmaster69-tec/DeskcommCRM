"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { toFlowNode, toReactFlow } from "@/lib/followup/graph-mappers";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { TIPOS_DE_BLOCO_DO_FLUXO } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import { BlocoDoFluxoNode, FimDoFluxoNode, InicioDoFluxoNode } from "@/app/app/fluxos/_blocos/BlocoDoFluxoNode";

import { ArestaDoFluxo } from "./ArestaDoFluxo";
import { rotuloDaArestaDoFluxo } from "./aresta-do-fluxo";
import { CanvasDoFluxoContext, type CanvasDoFluxo } from "./canvas-do-fluxo";
import { corDoBloco } from "./cores-dos-blocos";

const nodeTypes: NodeTypes = {
  ...Object.fromEntries(TIPOS_DE_BLOCO_DO_FLUXO.map((tipo) => [tipo, BlocoDoFluxoNode])),
  trigger: InicioDoFluxoNode,
  end: FimDoFluxoNode,
};
const edgeTypes: EdgeTypes = { fluxo: ArestaDoFluxo };

const LEITURA: CanvasDoFluxo = {
  editar: () => {},
  duplicar: () => {},
  excluir: () => {},
  distribuicoes: {},
  nomeDoFunil: () => null,
  nomeDoFluxo: () => null,
  somenteLeitura: true,
};

/**
 * O fluxo aberto pelo link de Compartilhar (fork jhoow, item 2): o mesmo
 * desenho do editor — cartões com prévia, linhas com o nome da saída, mini-mapa
 * — sem nada que edite. Arrastar o canvas e dar zoom continuam valendo.
 */
export function FluxoSomenteLeitura({ grafo }: { grafo: FlowGraph }) {
  const t = useT();
  const { nodes, edges } = useMemo(() => {
    const rf = toReactFlow(grafo);
    const porId = new Map(rf.nodes.map((n) => [n.id, n]));
    return {
      nodes: rf.nodes,
      edges: rf.edges.map((e) => {
        const origem = porId.get(e.source);
        const rotulo = rotuloDaArestaDoFluxo(origem ? toFlowNode(origem) : undefined, e.data?.condition);
        return { ...e, type: "fluxo", label: rotulo ? t(rotulo) : undefined };
      }),
    };
  }, [grafo, t]);

  return (
    <ReactFlowProvider>
      <CanvasDoFluxoContext.Provider value={LEITURA}>
        <div className="h-full w-full" data-testid="fluxo-somente-leitura">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) => corDoBloco(node.type)}
              nodeStrokeWidth={2}
              maskColor="rgba(0,0,0,0.6)"
              style={{ backgroundColor: "rgba(20,20,25,0.9)", border: "1px solid #333", borderRadius: 8 }}
              position="bottom-right"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>
      </CanvasDoFluxoContext.Provider>
    </ReactFlowProvider>
  );
}
