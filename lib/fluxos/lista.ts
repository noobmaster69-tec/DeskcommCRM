/**
 * Regras puras da lista de Fluxos (fork jhoow): contagem de blocos, filtro e
 * o nome do próximo fluxo novo. Sem React nem banco — testáveis direto.
 */

export type StatusDoFluxo = "draft" | "active" | "disabled";
export type FiltroDeStatus = "todos" | "ativos" | "pausados" | "arquivados";

/**
 * Quantos BLOCOS o fluxo tem — a coluna "BLOCOS" da lista. Início e Fim são o
 * esqueleto que todo fluxo nasce com, não blocos que a pessoa montou.
 */
export function contarBlocos(grafo: unknown): number {
  const nos = (grafo as { nodes?: Array<{ type?: string }> } | null)?.nodes;
  if (!Array.isArray(nos)) return 0;
  return nos.filter((n) => n?.type !== "trigger" && n?.type !== "end").length;
}

/**
 * Arquivado (item 2, migration 9010) só aparece em "Arquivados" — e some de
 * todos os outros filtros, inclusive "Todos": arquivar é tirar da frente.
 */
export function passaNoFiltro(status: StatusDoFluxo, filtro: FiltroDeStatus, arquivado = false): boolean {
  if (filtro === "arquivados") return arquivado;
  if (arquivado) return false;
  if (filtro === "ativos") return status === "active";
  if (filtro === "pausados") return status === "disabled";
  return true;
}

/** "Novo fluxo", e "Novo fluxo 2", "3"… se o nome já existir (o nome é único na organização). */
export function proximoNomeDeFluxo(existentes: readonly string[], base = "Novo fluxo"): string {
  const usados = new Set(existentes.map((n) => n.trim().toLocaleLowerCase("pt-BR")));
  if (!usados.has(base.toLocaleLowerCase("pt-BR"))) return base;
  for (let i = 2; i < 10_000; i++) {
    const nome = `${base} ${i}`;
    if (!usados.has(nome.toLocaleLowerCase("pt-BR"))) return nome;
  }
  return `${base} ${Date.now()}`;
}
