"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { ListaSalva } from "@/app/api/v1/listas/route";

/** As listas da organização (Operações › Listas, 9021). */
export function useListas(ativo = true) {
  return useQuery({
    queryKey: ["listas"],
    queryFn: async () => (await apiClient.get<{ data: ListaSalva[] }>("/api/v1/listas")).data,
    staleTime: 15_000,
    enabled: ativo,
  });
}
