/** Metade do cartão de bloco (240×~100): o CENTRO do cartão cai no centro da tela. */
const MEIO_DO_CARTAO = { x: 120, y: 50 };
/** A caixa que um cartão ocupa para efeito de "já tem alguém aqui" (240 de largura, ~140 de altura útil). */
const CAIXA = { largura: 240, altura: 140 };
/** Quanto desce o bloco novo quando o lugar está ocupado: a altura de um cartão + folga. */
const DEGRAU = 160;

/**
 * Onde nasce o bloco clicado no popover Ferramentas (fork jhoow, item 4): no
 * centro da área visível. Se outro cartão já ocupa aquela caixa, o novo DESCE
 * um degrau inteiro até achar lugar livre — antes ele andava 30px na diagonal
 * e nascia por cima do anterior, cobrindo a prévia dele (achado na prova pela
 * tela de 5 out).
 */
export function posicaoNoCentro(
  centro: { x: number; y: number },
  ocupadas: readonly { x: number; y: number }[],
): { x: number; y: number } {
  const p = { x: Math.round(centro.x - MEIO_DO_CARTAO.x), y: Math.round(centro.y - MEIO_DO_CARTAO.y) };
  const colide = () =>
    ocupadas.some((o) => Math.abs(o.x - p.x) < CAIXA.largura && Math.abs(o.y - p.y) < CAIXA.altura);
  for (let i = 0; i < 50 && colide(); i++) p.y += DEGRAU;
  return p;
}
