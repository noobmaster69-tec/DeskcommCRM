import { branchIdForCondition, nodeBranches, type FlowEdge, type FlowNode } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import type { NomesDeValor } from "@/lib/followup/vocabulario";

/**
 * O rótulo de uma linha do canvas de FLUXOS (fork jhoow, item 6).
 *
 * No Leona a linha não tem condição própria: quem decide para onde o contato
 * vai é o BLOCO de origem (Condicional, Distribuidor, Aguardar resposta, IA com
 * saídas). Por isso a linha só ganha texto quando sai de um bloco com mais de
 * uma saída — e o texto é o nome dessa saída, lido da config do bloco
 * ("Verdadeiro", "Saída 2"). Linha de bloco com saída única não tem rótulo
 * nenhum: o "Sempre" de antes era ruído em toda ligação do fluxo.
 */
export function rotuloDaArestaDoFluxo(
  origem: FlowNode | undefined,
  condition: FlowEdge["condition"] | undefined,
  nomes: NomesDeValor = {},
): string | null {
  if (!origem) return null;
  const ramos = nodeBranches(origem);
  if (ramos.length <= 1) return null;
  const id = branchIdForCondition(origem, condition ?? { type: "always" });
  const ramo = ramos.find((r) => r.id === id);
  return ramo ? rotuloDoRamo(ramo, nomes) : null;
}
