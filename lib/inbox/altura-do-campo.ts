/**
 * O campo de mensagem do Inbox cresce como o do WhatsApp (fork jhoow): nasce
 * com UMA linha, cresce a cada linha digitada até QUATRO, e da quinta em diante
 * para de crescer e rola por dentro.
 */
export const ALTURA_DA_LINHA_PX = 20;
export const PADDING_Y_PX = 10;
export const MAX_LINHAS = 4;
export const ALTURA_MINIMA_PX = ALTURA_DA_LINHA_PX + PADDING_Y_PX * 2;
export const ALTURA_MAXIMA_PX = MAX_LINHAS * ALTURA_DA_LINHA_PX + PADDING_Y_PX * 2;

export function alturaDoCampo(scrollHeight: number): { altura: number; rola: boolean } {
  return {
    altura: Math.max(ALTURA_MINIMA_PX, Math.min(scrollHeight, ALTURA_MAXIMA_PX)),
    rola: scrollHeight > ALTURA_MAXIMA_PX,
  };
}
