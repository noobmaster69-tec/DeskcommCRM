"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/** O par de idiomas da conversa (fork jhoow, tradução automática). */
export interface IdiomasDaConversa {
  contato: { locale: string | null; source: "manual" | "ddi" | "detected" | null };
  meu_idioma: string;
  traducao: { entrada: boolean; saida: boolean };
  idiomas_diferentes: boolean;
}

export interface MudancaDeIdiomas {
  contato_locale?: string;
  meu_idioma?: string;
  entrada?: boolean;
  saida?: boolean;
}

export const chaveDosIdiomas = (conversationId: string | null) => ["conversa-idiomas", conversationId] as const;

export function useIdiomasDaConversa(conversationId: string | null) {
  return useQuery({
    queryKey: chaveDosIdiomas(conversationId),
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: () => apiClient.get<IdiomasDaConversa>(`/api/v1/conversations/${conversationId}/idiomas`),
  });
}

export function useMudarIdiomasDaConversa(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: MudancaDeIdiomas) =>
      apiClient.patch<IdiomasDaConversa>(`/api/v1/conversations/${conversationId}/idiomas`, m),
    onSuccess: async (dados) => {
      qc.setQueryData(chaveDosIdiomas(conversationId), dados);
      await qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });
}
