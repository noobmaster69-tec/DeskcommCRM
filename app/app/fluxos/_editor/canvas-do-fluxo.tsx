"use client";

import { createContext, useContext } from "react";

/**
 * O que um cartão de bloco do canvas de FLUXOS precisa e não mora no nó (fork
 * jhoow, item 5): as ações do cabeçalho (✏️ 📋 🗑️), a contagem do Distribuidor
 * e os nomes de funil/fluxo que as prévias mostram. O React Flow renderiza os
 * nós sem passar props do canvas — o contexto é a ponte.
 */
export interface CanvasDoFluxo {
  editar: (id: string) => void;
  duplicar: (id: string) => void;
  excluir: (id: string) => void;
  /** nó do distribuidor → saída → quantos contatos passaram por ela. */
  distribuicoes: Record<string, Record<string, number>>;
  nomeDoFunil: (id: string) => string | null;
  nomeDoFluxo: (id: string) => string | null;
}

const NADA: CanvasDoFluxo = {
  editar: () => {},
  duplicar: () => {},
  excluir: () => {},
  distribuicoes: {},
  nomeDoFunil: () => null,
  nomeDoFluxo: () => null,
};

export const CanvasDoFluxoContext = createContext<CanvasDoFluxo>(NADA);

export function useCanvasDoFluxo(): CanvasDoFluxo {
  return useContext(CanvasDoFluxoContext);
}
