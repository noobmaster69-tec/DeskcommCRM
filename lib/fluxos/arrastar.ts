/**
 * Arrastar um fluxo para uma pasta (fork jhoow, item 1) — a decisão do
 * "soltar", sem React. Os alvos da barra de PASTAS têm id próprio:
 *  - `todos`      → "Todos os fluxos": não é pasta, soltar ali não muda nada;
 *  - `sem-pasta`  → "Sem pasta": tira o fluxo de qualquer pasta (null);
 *  - `pasta:<id>` → a pasta nomeada.
 */
export const ALVO_TODOS = "todos";
export const ALVO_SEM_PASTA = "sem-pasta";
export const alvoDaPasta = (id: string) => `pasta:${id}`;

export type Soltar = { mudar: false } | { mudar: true; pasta_id: string | null };

export function destinoDoSoltar(alvo: string | null | undefined, pastaAtual: string | null): Soltar {
  if (!alvo || alvo === ALVO_TODOS) return { mudar: false };
  const destino = alvo === ALVO_SEM_PASTA ? null : alvo.startsWith("pasta:") ? alvo.slice("pasta:".length) : undefined;
  if (destino === undefined || destino === pastaAtual) return { mudar: false };
  return { mudar: true, pasta_id: destino };
}
