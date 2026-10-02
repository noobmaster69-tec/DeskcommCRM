/**
 * A régua do design system, congelada em módulo — a fonte da derivação em RUNTIME.
 *
 * POR QUE ESTE ARQUIVO EXISTE, e não um `readFileSync("app/globals.css")`:
 *
 * A imagem de produção é `output: "standalone"` (next.config.ts) e o Dockerfile
 * copia para o runner apenas `.next/standalone`, `.next/static` e `public/`. O
 * `app/globals.css` NÃO existe no contêiner que o self-hoster roda. Um
 * `readFileSync` no caminho de render do `app/layout.tsx` daria ENOENT — 500 em
 * todas as telas, na VPS de quem a feature existe para servir, e verde em dev,
 * em teste e na Vercel. É o mesmo modo de falha que `lib/branding.ts` documenta
 * para o `NEXT_PUBLIC_*`.
 *
 * A separação também é a certa conceitualmente: a RÉGUA é do produto e nasce
 * congelada no build; a COR é da instalação e só existe em runtime. Só a segunda
 * precisa ser lida do ambiente.
 *
 * ESTE ARQUIVO É GERADO. Não edite à mão: ele é o `extrairRegua()` aplicado ao
 * `app/globals.css`. `tests/unit/branding-regua-do-produto.test.ts` compara os
 * dois a cada run e imprime o literal novo na mensagem de falha — mexeu na
 * paleta, o teste reprova e entrega o texto para colar aqui.
 */

import type { Regua } from "./contraste";

export const REGUA_DO_PRODUTO: Regua = {
  rampaDoProduto: [
    "#f0f5ff",
    "#e1ebff",
    "#c4d7ff",
    "#9dbcff",
    "#78a1ff",
    "#5788ff",
    "#386bf8",
    "#2e56bf",
    "#274696",
    "#223b79",
    "#0b193e",
  ],
  claro: {
    nome: "claro",
    base: [
      {
        chave: "--color-bg",
        hex: "#faf9f6",
      },
      {
        chave: "--color-surface",
        hex: "#ffffff",
      },
      {
        chave: "--color-surface-elevated",
        hex: "#f5f3ee",
      },
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "grau",
          indice: 1,
          alfa: 1,
        },
      },
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        },
        contra: [
          {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        ],
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 7,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-text",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 7,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-link",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 7,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "::selection/color",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 10,
          alfa: 1,
        },
        contra: [
          {
            tipo: "grau",
            indice: 2,
            alfa: 1,
          },
        ],
      },
      {
        token: ":focus-visible/outline",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#218358",
      },
      {
        nome: "warning",
        hex: "#b07a2b",
      },
      {
        nome: "error",
        hex: "#a94a3c",
      },
      {
        nome: "info",
        hex: "#4a7a93",
      },
    ],
    neutros: [
      "#faf9f6",
      "#f3f1ec",
      "#e7e3da",
      "#d2cdbf",
      "#a9a395",
      "#7d786c",
      "#5d594f",
      "#46433b",
      "#2e2c26",
      "#1c1a16",
      "#0e0d0a",
    ],
    indices: {
      accent: 6,
      hover: 7,
      soft: 1,
    },
    alfaDoSoft: 1,
  },
  escuro: {
    nome: "escuro",
    base: [
      {
        chave: "--color-bg",
        hex: "#0a0a0b",
      },
      {
        chave: "--color-surface",
        hex: "#131315",
      },
      {
        chave: "--color-surface-elevated",
        hex: "#1f1f23",
      },
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "literal",
          hex: "#386bf8",
          alfa: 0.16,
        },
      },
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        },
        contra: [
          {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        ],
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: '[data-theme="dark"] ::selection/color',
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 0,
          alfa: 1,
        },
        contra: [
          {
            tipo: "grau",
            indice: 8,
            alfa: 1,
          },
        ],
      },
      {
        token: '[data-theme="dark"] :focus-visible/outline-color',
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#30a46c",
      },
      {
        nome: "warning",
        hex: "#d09455",
      },
      {
        nome: "error",
        hex: "#e5484d",
      },
      {
        nome: "info",
        hex: "#7da9bf",
      },
    ],
    neutros: [
      "#ededef",
      "#d6d6da",
      "#b4b4bb",
      "#8e8e96",
      "#64646b",
      "#3a3a40",
      "#2a2a2f",
      "#1f1f23",
      "#131315",
      "#0a0a0b",
      "#050506",
    ],
    indices: {
      accent: 6,
      hover: 5,
      soft: null,
    },
    alfaDoSoft: 0.16,
  },
} as const;
