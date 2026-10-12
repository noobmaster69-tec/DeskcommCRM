/**
 * Classes compartilhadas do Inbox (painéis flutuantes). Ficam aqui para o
 * cabeçalho, o drawer do funil e os botões que vivem dentro deles terem a MESMA
 * geometria — botão de ícone com cara diferente em cada lugar é o que faz a
 * barra parecer remendada.
 */
export const BOTAO_DO_GRUPO =
  "relative inline-flex h-[30px] w-8 shrink-0 items-center justify-center rounded-[8px] text-ibx-muted transition-colors hover:bg-ibx-field hover:text-ibx-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ibx-accent disabled:pointer-events-none disabled:opacity-50";

export const BOTAO_DE_ICONE =
  "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-ibx-muted transition-colors hover:bg-ibx-field hover:text-ibx-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ibx-accent disabled:pointer-events-none disabled:opacity-50";
