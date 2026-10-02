import type { FlowGraph } from "./graph-schema";

/**
 * O grafo com que um FLUXO novo nasce (fork jhoow): Início ligado a Fim.
 *
 * Dois nós porque `flowGraphSchema` exige no mínimo dois para salvar o
 * rascunho; Início no centro do primeiro enquadramento, Fim logo abaixo. As
 * fases B–D acrescentam os blocos de verdade entre os dois.
 */
export function grafoInicialDoFluxo(): FlowGraph {
  return {
    nodes: [
      { id: "inicio", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
      { id: "fim", type: "end", label: "Fim", position: { x: 0, y: 200 }, config: { outcome: "custom" } },
    ],
    edges: [{ id: "inicio-fim", source: "inicio", target: "fim", priority: 0, condition: { type: "always" } }],
  };
}
