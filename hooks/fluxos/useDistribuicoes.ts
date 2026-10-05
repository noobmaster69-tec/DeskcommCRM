"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { Distribuicoes } from "@/lib/fluxos/distribuicoes";

/**
 * A contagem por saída dos Distribuidores do fluxo (item 5). Sem toast de
 * erro: é um número decorativo no cartão — falhar mostra 0, não interrompe a
 * edição. Atualiza a cada 30s com a aba aberta.
 */
export function useDistribuicoes(flowId: string, ligado: boolean) {
  return useQuery({
    queryKey: ["fluxos", "distribuicoes", flowId] as const,
    queryFn: async () => (await apiClient.get<{ data: Distribuicoes }>(`/api/v1/fluxos/${flowId}/distribuicoes`)).data,
    enabled: ligado,
    staleTime: 30_000,
    refetchInterval: ligado ? 30_000 : false,
  });
}
