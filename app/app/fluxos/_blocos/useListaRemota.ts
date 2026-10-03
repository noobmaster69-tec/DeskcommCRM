"use client";

import { useEffect, useState } from "react";

/**
 * Lê uma lista `{ data: T[] }` de uma rota da API para um seletor de bloco de
 * fluxo (funis, etapas, fluxos). `url` nula não lê nada — é o "escolha o funil
 * primeiro" do seletor de etapa.
 */
export function useListaRemota<T>(url: string | null): { itens: T[]; carregando: boolean } {
  const [estado, setEstado] = useState<{ url: string | null; itens: T[] }>({ url: null, itens: [] });
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: T[] }>) : { data: [] }))
      .then((j) => {
        if (vivo) setEstado({ url, itens: Array.isArray(j.data) ? j.data : [] });
      })
      .catch(() => {
        if (vivo) setEstado({ url, itens: [] });
      });
    return () => {
      vivo = false;
    };
  }, [url]);
  return { itens: url && estado.url === url ? estado.itens : [], carregando: Boolean(url) && estado.url !== url };
}
