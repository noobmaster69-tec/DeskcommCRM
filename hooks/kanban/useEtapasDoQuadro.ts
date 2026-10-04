"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { chaveDoQuadro } from "./useBoard";
import type { BoardData } from "@/lib/kanban/types";

/**
 * Criar, editar, arquivar e reordenar colunas DIRETO NO QUADRO — as mesmas
 * rotas (`/api/v1/pipelines/:id/stages[/:stageId]`) que Configurações › Funis
 * usa por `hooks/pipelines/useStages.ts`. A diferença é só o cache que se relê:
 * aqui é o do quadro (`chaveDoQuadro`), que tem as colunas e os cards juntos.
 *
 * As regras (nome duplicado, um ganho e uma perda por funil, a Etapa de entrada
 * fixa) são do servidor — `lib/leads/stage-operations.ts`. A recusa dele chega
 * como `ApiError` com a frase pronta para a tela.
 */

const rota = (pipelineId: string) => `/api/v1/pipelines/${encodeURIComponent(pipelineId)}/stages`;
const daEtapa = (pipelineId: string, stageId: string) =>
  `${rota(pipelineId)}/${encodeURIComponent(stageId)}`;

export interface NovaEtapa {
  name: string;
  color: string | null;
  is_won?: boolean;
  is_lost?: boolean;
}

export interface EdicaoDeEtapa {
  name?: string;
  color?: string | null;
  is_won?: boolean;
  is_lost?: boolean;
}

function useReler(pipelineId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: chaveDoQuadro(pipelineId) });
  };
}

/** Sem `onError` aqui: o modal mostra a recusa dentro dele, ao lado do campo. */
export function useCriarEtapaNoQuadro(pipelineId: string) {
  const reler = useReler(pipelineId);
  return useMutation({
    mutationFn: (nova: NovaEtapa) => apiClient.post<unknown>(rota(pipelineId), nova),
    onSettled: reler,
  });
}

export function useEditarEtapaNoQuadro(pipelineId: string) {
  const reler = useReler(pipelineId);
  return useMutation({
    mutationFn: ({ stageId, patch }: { stageId: string; patch: EdicaoDeEtapa }) =>
      apiClient.patch<unknown>(daEtapa(pipelineId, stageId), patch),
    onSettled: reler,
  });
}

/**
 * Sem destino é uma PERGUNTA legítima: a rota responde 422 com
 * `details.negocios` e `details.precisa_destino`, e o modal troca a recusa por
 * "para onde vão os N negócios?". Etapa vazia arquiva direto.
 */
export function useArquivarEtapaNoQuadro(pipelineId: string) {
  const reler = useReler(pipelineId);
  return useMutation({
    mutationFn: ({ stageId, destinoId }: { stageId: string; destinoId: string | null }) =>
      apiClient.delete<unknown>(
        destinoId
          ? `${daEtapa(pipelineId, stageId)}?destino=${encodeURIComponent(destinoId)}`
          : daEtapa(pipelineId, stageId),
      ),
    onSettled: reler,
  });
}

/**
 * Arrastar a coluna: otimista, como mover card. A coluna vai para o lugar novo
 * na hora; a releitura no fim traz a posição que o servidor gravou (que pode ser
 * "logo depois da Etapa de entrada" se ela foi solta à frente dela).
 *
 * `depoisDe` é o vizinho da ESQUERDA (`null` = primeira coluna) — o contrato do
 * PATCH, que faz a conta da posição.
 */
export function useReordenarEtapa(pipelineId: string) {
  const qc = useQueryClient();
  const queryKey = chaveDoQuadro(pipelineId);
  return useMutation({
    mutationFn: ({ stageId, depoisDe }: { stageId: string; depoisDe: string | null; novaOrdem: string[] }) =>
      apiClient.patch<unknown>(daEtapa(pipelineId, stageId), { depois_de: depoisDe }),
    onMutate: async ({ novaOrdem }) => {
      await qc.cancelQueries({ queryKey });
      const snapshot = qc.getQueryData<BoardData>(queryKey);
      if (snapshot) {
        const porId = new Map(snapshot.stages.map((s) => [s.id, s]));
        const stages = novaOrdem.map((id) => porId.get(id)).filter((s) => s !== undefined);
        if (stages.length === snapshot.stages.length) qc.setQueryData<BoardData>(queryKey, { ...snapshot, stages });
      }
      return { snapshot };
    },
    onError: (err, _args, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(queryKey, ctx.snapshot);
      showApiError(err);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });
}
