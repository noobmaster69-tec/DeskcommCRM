/**
 * Os atalhos de "Cor de destaque" da tela Configurações › Marca.
 *
 * Pedido do dono do produto (fork jhoow, Onix + Azul): cinco cores prontas
 * acima do seletor livre. São só sementes — a rampa, o texto por contraste
 * (`melhorFrenteSobre`) e a aplicação antes do primeiro paint são os mesmos de
 * qualquer cor digitada; nenhum caminho novo.
 *
 * O Azul é a cor do PRÓPRIO produto (`--color-accent-600` do `globals.css`):
 * escolhê-lo grava a semente explícita, que pinta igual ao padrão.
 */
export const ATALHOS_DE_COR = [
  { nome: "Azul", hex: "#386bf8" },
  { nome: "Violeta", hex: "#8b7bff" },
  { nome: "Turquesa", hex: "#2ec4b0" },
  { nome: "Âmbar", hex: "#f2b544" },
  { nome: "Rosa", hex: "#ec4899" },
] as const;
