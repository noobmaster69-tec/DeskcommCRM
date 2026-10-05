/** Metade do cartão de bloco (240×~100): o CENTRO do cartão cai no centro da tela. */
const MEIO_DO_CARTAO = { x: 120, y: 50 };
const PASSO = 30;

/**
 * Onde nasce o bloco clicado no popover Ferramentas (fork jhoow, item 4): no
 * centro da área visível. Clicar duas vezes seguidas empilharia os dois blocos
 * no mesmo ponto — um escondido atrás do outro —, então cada bloco que já está
 * ali empurra o novo um degrau na diagonal.
 */
export function posicaoNoCentro(
  centro: { x: number; y: number },
  ocupadas: readonly { x: number; y: number }[],
): { x: number; y: number } {
  let p = { x: Math.round(centro.x - MEIO_DO_CARTAO.x), y: Math.round(centro.y - MEIO_DO_CARTAO.y) };
  for (let i = 0; i < 50 && ocupadas.some((o) => Math.abs(o.x - p.x) < 10 && Math.abs(o.y - p.y) < 10); i++) {
    p = { x: p.x + PASSO, y: p.y + PASSO };
  }
  return p;
}
