"use client";

import { useEffect, useState } from "react";
import { variaveisSugeridas } from "@/lib/fluxos/variaveis";

/**
 * As chaves de campo da ficha que a organização já usa (`GET /api/v1/fluxos/campos`)
 * e, a partir delas, as variáveis que o editor sugere. Uma leitura por página:
 * o resultado fica em memória do módulo, porque cada bloco aberto pediria de novo.
 */
let cache: Promise<string[]> | null = null;

function lerCampos(): Promise<string[]> {
  if (!cache) {
    cache = fetch("/api/v1/fluxos/campos")
      .then((r) => (r.ok ? (r.json() as Promise<{ data: string[] }>) : { data: [] }))
      .then((j) => (Array.isArray(j.data) ? j.data : []))
      .catch(() => {
        cache = null;
        return [];
      });
  }
  return cache;
}

export function useCamposDaFicha(): { campos: string[]; variaveis: string[] } {
  const [campos, setCampos] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    void lerCampos().then((c) => {
      if (vivo) setCampos(c);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return { campos, variaveis: variaveisSugeridas(campos) };
}
