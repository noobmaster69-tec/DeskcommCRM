import type { NodeType } from "@/lib/followup/graph-schema";

/**
 * A cor de cada bloco do canvas de FLUXOS (fork jhoow, itens 4, 5 e 9), em hex
 * — o mesmo valor pinta o ícone do popover Ferramentas, o cabeçalho do cartão
 * e o retângulo do mini-mapa (o MiniMap do XYFlow pinta SVG e não lê classe do
 * Tailwind). Tons do Leona (imagens 7–9 do pedido).
 */
export const NODE_COLORS: Partial<Record<NodeType, string>> = {
  trigger: "#6366f1",
  mensagem: "#3b82f6", // azul
  etiquetas: "#7c3aed", // roxo escuro
  aguardar_resposta: "#f59e0b", // laranja
  notificacao: "#10b981", // verde-azulado
  condicional: "#38bdf8", // azul claro
  distribuidor: "#f97316", // laranja
  conexao_fluxo: "#ef4444", // vermelho
  pixel: "#eab308", // dourado
  intervalo: "#14b8a6", // teal
  bloco_ia: "#22c55e", // verde
  kanban: "#a78bfa", // roxo claro
  end: "#991b1b", // vermelho escuro
};

/** Cor do bloco, com o cinza de reserva para tipo sem cor (follow-up aberto aqui). */
export function corDoBloco(tipo: string | undefined): string {
  return (tipo && NODE_COLORS[tipo as NodeType]) || "#555555";
}
