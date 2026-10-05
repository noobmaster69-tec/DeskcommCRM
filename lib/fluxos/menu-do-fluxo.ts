import { z } from "zod";

/**
 * O PATCH do menu "⋯" da lista de Fluxos (fork jhoow, itens 1 e 2): mover de
 * pasta, arquivar/desarquivar, desativar/reativar. Nome, duplicar e excluir já
 * têm rota (`/api/v1/ai/followup-flows/[id]`, `/duplicate`) e são reusadas.
 */
export const patchDoFluxoSchema = z
  .strictObject({
    pasta_id: z.string().uuid().nullable().optional(),
    arquivado: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "nada para mudar" });
export type PatchDoFluxo = z.infer<typeof patchDoFluxoSchema>;

export interface EstadoDoFluxo {
  status: "draft" | "active" | "disabled";
  active_version_id: string | null;
  archived_at: string | null;
}

export type PlanoDoPatch =
  | { ok: true; update: Record<string, unknown>; eventos: string[] }
  | { ok: false; codigo: "sem_versao" | "arquivado"; mensagem: string };

/**
 * O que gravar, decidido sem banco (testável direto):
 *  - Reativar exige versão publicada — o motor roda a versão, não o rascunho —
 *    e fluxo fora do arquivo.
 *  - Arquivar um fluxo ativo o desativa junto: arquivado não pode seguir
 *    disparando escondido de "Ativos".
 *  - Mover de pasta não mexe em `updated_at`: a lista ordena por ele, e
 *    arrastar não é editar.
 */
export function planoDoPatch(atual: EstadoDoFluxo, pedido: PatchDoFluxo, agora: string): PlanoDoPatch {
  const update: Record<string, unknown> = {};
  const eventos: string[] = [];
  if (pedido.pasta_id !== undefined) {
    update.pasta_id = pedido.pasta_id;
    eventos.push("fluxo.movido_de_pasta");
  }
  const arquivadoNoFim = pedido.arquivado ?? atual.archived_at !== null;
  if (pedido.ativo === true) {
    if (!atual.active_version_id)
      return { ok: false, codigo: "sem_versao", mensagem: "Publique o fluxo antes de reativar." };
    if (arquivadoNoFim)
      return { ok: false, codigo: "arquivado", mensagem: "Desarquive o fluxo antes de reativar." };
    if (atual.status !== "active") {
      update.status = "active";
      eventos.push("fluxo.reativado");
    }
  }
  if (pedido.ativo === false && atual.status === "active") {
    update.status = "disabled";
    eventos.push("followup_flow.disabled");
  }
  if (pedido.arquivado === true && atual.archived_at === null) {
    update.archived_at = agora;
    if (atual.status === "active" && update.status === undefined) {
      update.status = "disabled";
      eventos.push("followup_flow.disabled");
    }
    eventos.push("fluxo.arquivado");
  }
  if (pedido.arquivado === false && atual.archived_at !== null) {
    update.archived_at = null;
    eventos.push("fluxo.desarquivado");
  }
  if (update.status !== undefined || update.archived_at !== undefined) update.updated_at = agora;
  return { ok: true, update, eventos };
}
