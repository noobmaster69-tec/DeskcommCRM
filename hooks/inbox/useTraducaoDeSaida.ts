"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useIdiomasDaConversa } from "./useIdiomasDaConversa";

/**
 * A tradução do que o atendente está escrevendo (fork jhoow, Fase C).
 *
 * Ativa quando o cliente fala outra língua e a chave de saída da conversa está
 * ligada. A prévia acompanha a digitação com 500ms de pausa; "Editar tradução"
 * fixa um texto à mão até o original mudar. No envio, `obter()` devolve a
 * tradução do texto ATUAL — a da prévia, se ela corresponde a ele, senão pede
 * na hora.
 */
export const PAUSA_DA_PREVIA_MS = 500;

interface Previa {
  texto: string;
  para: string;
  traducao: string;
}

export function useTraducaoDeSaida(conversationId: string, texto: string, habilitada: boolean) {
  const idiomas = useIdiomasDaConversa(conversationId);
  const d = idiomas.data;
  const ativa = habilitada && !!d && d.idiomas_diferentes && d.traducao.saida && !!d.contato.locale;
  const [paraEscolhido, setPara] = useState<string | null>(null);
  const para = paraEscolhido ?? d?.contato.locale ?? null;
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [editada, setEditada] = useState<{ texto: string; traducao: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const pedido = useRef(0);

  const pedir = useCallback(
    async (alvo: string, destino: string): Promise<string | null> => {
      const r = await apiClient.post<{ traducao: string }>(`/api/v1/conversations/${conversationId}/traducao-de-saida`, {
        texto: alvo,
        para: destino,
      });
      return r.traducao;
    },
    [conversationId],
  );

  const limpo = texto.trim();
  useEffect(() => {
    if (!ativa || !para || !limpo) return;
    if (previa && previa.texto === limpo && previa.para === para) return;
    const meu = ++pedido.current;
    const timer = setTimeout(async () => {
      setCarregando(true);
      setFalhou(false);
      try {
        const traducao = await pedir(limpo, para);
        if (meu === pedido.current && traducao) setPrevia({ texto: limpo, para, traducao });
      } catch {
        if (meu === pedido.current) setFalhou(true);
      } finally {
        if (meu === pedido.current) setCarregando(false);
      }
    }, PAUSA_DA_PREVIA_MS);
    return () => clearTimeout(timer);
  }, [ativa, para, limpo, previa, pedir]);

  const traducaoAtual =
    editada && editada.texto === limpo
      ? editada.traducao
      : previa && previa.texto === limpo && previa.para === para
        ? previa.traducao
        : null;

  /** A tradução do texto que vai sair. `null` = indisponível (o envio não acontece). */
  const obter = useCallback(async (): Promise<string | null> => {
    if (!ativa || !para) return null;
    if (traducaoAtual) return traducaoAtual;
    try {
      return await pedir(limpo, para);
    } catch {
      return null;
    }
  }, [ativa, para, traducaoAtual, pedir, limpo]);

  return {
    ativa,
    para,
    meuIdioma: d?.meu_idioma ?? "pt-BR",
    setPara,
    previa: limpo ? traducaoAtual : null,
    carregando,
    falhou,
    editarTraducao: (traducao: string) => setEditada({ texto: limpo, traducao }),
    obter,
    /** Depois do envio: começa do zero para a próxima mensagem. */
    reiniciar: () => {
      setPrevia(null);
      setEditada(null);
    },
  };
}
