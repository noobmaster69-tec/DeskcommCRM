import type { NodeType } from "@/lib/followup/graph-schema";

import { BLOCK_THEME, corDoTema } from "./tema-dos-blocos";

/**
 * A cor (--c) de cada bloco do canvas de FLUXOS, derivada de `BLOCK_THEME` —
 * o mesmo valor pinta o cartão, a linha que sai dele, o dock e o retângulo do
 * mini-mapa (o MiniMap do XYFlow pinta SVG e não lê classe do Tailwind).
 */
export const NODE_COLORS: Partial<Record<NodeType, string>> = Object.fromEntries(
  Object.entries(BLOCK_THEME).map(([tipo, tema]) => [tipo, corDoTema(tema)]),
);

/** Cor do bloco, com o cinza de reserva para tipo sem cor (follow-up aberto aqui). */
export function corDoBloco(tipo: string | undefined): string {
  return (tipo && NODE_COLORS[tipo as NodeType]) || "#555555";
}
