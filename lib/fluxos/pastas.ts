import { z } from "zod";

/**
 * Pastas da lista de Fluxos (fork jhoow, migration 9002). Formato dos corpos e
 * a árvore que a tela desenha — sem banco aqui, para a regra ser testável.
 */
export const criarPastaSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  parent_id: z.string().uuid().nullable().optional(),
});

export const editarPastaSchema = z
  .strictObject({
    nome: z.string().trim().min(1).max(80).optional(),
    parent_id: z.string().uuid().nullable().optional(),
  })
  .refine((c) => c.nome !== undefined || c.parent_id !== undefined, { message: "nada para mudar" });

export interface PastaDoFluxo {
  id: string;
  nome: string;
  parent_id: string | null;
  posicao: number;
}

export interface NoDaArvore extends PastaDoFluxo {
  filhas: NoDaArvore[];
  /** Fluxos nesta pasta E nas subpastas dela. */
  total: number;
}

/**
 * Monta a árvore de pastas com a contagem de fluxos (direta + subpastas).
 * Pasta cujo pai não veio (apagado, ou de outra leitura) sobe para a raiz em
 * vez de sumir; um ciclo impossível pelo banco também não trava a montagem.
 */
export function arvoreDePastas(pastas: PastaDoFluxo[], fluxosPorPasta: Map<string, number>): NoDaArvore[] {
  const nos = new Map<string, NoDaArvore>(pastas.map((p) => [p.id, { ...p, filhas: [], total: 0 }]));
  const raiz: NoDaArvore[] = [];
  for (const no of nos.values()) {
    const pai = no.parent_id ? nos.get(no.parent_id) : undefined;
    if (pai && pai !== no) pai.filhas.push(no);
    else raiz.push(no);
  }
  const ordenar = (lista: NoDaArvore[]) =>
    lista.sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR"));
  const visitados = new Set<string>();
  const contar = (no: NoDaArvore): number => {
    if (visitados.has(no.id)) return 0;
    visitados.add(no.id);
    ordenar(no.filhas);
    no.total = (fluxosPorPasta.get(no.id) ?? 0) + no.filhas.reduce((s, f) => s + contar(f), 0);
    return no.total;
  };
  ordenar(raiz).forEach(contar);
  return raiz;
}

/** A pasta e todas as descendentes — o que o filtro "nesta pasta" alcança. */
export function idsDaPastaEDescendentes(arvore: NoDaArvore[], id: string): Set<string> {
  const achar = (lista: NoDaArvore[]): NoDaArvore | null => {
    for (const no of lista) {
      if (no.id === id) return no;
      const f = achar(no.filhas);
      if (f) return f;
    }
    return null;
  };
  const alvo = achar(arvore);
  const ids = new Set<string>();
  const juntar = (no: NoDaArvore) => {
    ids.add(no.id);
    no.filhas.forEach(juntar);
  };
  if (alvo) juntar(alvo);
  return ids;
}

/** Reordenar pastas irmãs (fork jhoow, item 3): a nova ordem inteira, por id. */
export const ordemDasPastasSchema = z.strictObject({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * A ordem das irmãs depois de soltar `arrastada` sobre `alvo` (item 3): a
 * arrastada ocupa o lugar do alvo e as outras escorregam. Só entre IRMÃS (mesmo
 * pai) — soltar numa pasta de outro nível devolve `null` (mudar de pai é o
 * "mover" do menu, não o arrasto). As posições viram 0..n-1 na ordem nova.
 */
export function reordenarIrmas(pastas: PastaDoFluxo[], arrastada: string, alvo: string): string[] | null {
  if (arrastada === alvo) return null;
  const a = pastas.find((p) => p.id === arrastada);
  const b = pastas.find((p) => p.id === alvo);
  if (!a || !b || (a.parent_id ?? null) !== (b.parent_id ?? null)) return null;
  const irmas = pastas
    .filter((p) => (p.parent_id ?? null) === (a.parent_id ?? null))
    .sort((x, y) => x.posicao - y.posicao || x.nome.localeCompare(y.nome, "pt-BR"))
    .map((p) => p.id);
  const de = irmas.indexOf(arrastada);
  const para = irmas.indexOf(alvo);
  irmas.splice(de, 1);
  irmas.splice(para, 0, arrastada);
  return irmas;
}
