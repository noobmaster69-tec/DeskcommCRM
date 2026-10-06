"use client";

import { useCallback, useEffect, useRef } from "react";

const INTERVALO_MS = 30_000;

/**
 * Inbox (fork jhoow): ao ABRIR a conversa e ao começar a DIGITAR a resposta, as
 * mensagens do contato ficam lidas no aparelho dele (tiques azuis). O servidor
 * decide se há o que marcar e se a empresa deixou ligado; aqui só se evita
 * chamar a cada tecla (no máximo uma vez a cada 30 s por conversa).
 */
export function useMarcarComoLidas(conversationId: string | null | undefined, ativo = true) {
  const ultima = useRef<{ id: string; em: number } | null>(null);
  const marcar = useCallback(() => {
    if (!conversationId || !ativo) return;
    const agora = Date.now();
    if (ultima.current?.id === conversationId && agora - ultima.current.em < INTERVALO_MS) return;
    ultima.current = { id: conversationId, em: agora };
    // `fetch` direto (e não o apiClient): é aviso decorativo, sem toast de erro,
    // e não entra na contagem de envios que os testes do composer observam.
    if (typeof fetch !== "function") return;
    void fetch(`/api/v1/conversations/${conversationId}/lidas`, { method: "POST" }).catch(() => {});
  }, [conversationId, ativo]);

  useEffect(() => {
    marcar();
  }, [marcar]);

  return marcar;
}
