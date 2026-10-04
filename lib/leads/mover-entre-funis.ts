import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MOVER O CARD PARA OUTRO FUNIL DO MESMO CRM (Funis no modelo Kommo, Fase E).
 *
 * Até aqui o funil do negócio era imutável: trocar de funil era CLONAR (um
 * negócio novo no destino, o original fechado como perdido com o motivo
 * "levado para outro funil" — `lib/leads/clonar-para-funil.ts`). No modelo do
 * Kommo o lead ANDA entre os funis de um CRM (Social Seller → SDR → Vendedor)
 * e continua sendo o mesmo card, com o mesmo histórico. Decisão do dono: dentro
 * do mesmo CRM, MOVE; entre CRMs diferentes, continua sendo clonar — CRM é outro
 * público ou outra marca, e o card não "anda" de uma empresa para a outra.
 *
 * Regra pura, sem banco: quem chama lê os dois funis e pergunta aqui. As duas
 * portas que mudam a etapa de um negócio — a rota `POST /leads/[id]/move` (o
 * arrasto do quadro, o seletor do Inbox) e o `moveLeadHandler` (lote, IA, MCP)
 * — usam a MESMA regra, para não divergirem na primeira mudança.
 */

/** O que a regra precisa saber de cada funil. */
export interface FunilDoMovimento {
  id: string;
  /** `null` só num banco sem a 9004 — e aí não há "mesmo CRM" para afirmar. */
  crm_id: string | null;
  is_archived: boolean;
  name: string;
}

export type VereditoDoMovimento =
  | { ok: true; entreFunis: boolean }
  | { ok: false; codigo: string; mensagem: string };

/** A frase da recusa entre CRMs. Aponta a porta que resolve: clonar. */
export const RECUSA_ENTRE_CRMS =
  "Este funil é de outro CRM. Dentro do mesmo CRM o card se move; para levá-lo a outro CRM, use «Levar para outro funil» no quadro (POST /api/v1/leads/[id]/clone) — ele cria o negócio lá e encerra este.";

/**
 * Pode mover o negócio do funil `origem` para uma etapa do funil `destino`?
 *
 * - mesmo funil: sempre (é a troca de etapa de sempre);
 * - funil de destino arquivado: não — ele saiu da lista e do quadro;
 * - outro funil do MESMO CRM: sim, e o card leva o funil junto;
 * - outro CRM (ou CRM desconhecido): não — o código `pipeline_immutable_use_clone`
 *   é o de sempre, para quem já trata essa recusa continuar tratando.
 */
export function podeMoverEntreFunis(origem: FunilDoMovimento, destino: FunilDoMovimento): VereditoDoMovimento {
  if (origem.id === destino.id) return { ok: true, entreFunis: false };
  if (destino.is_archived) {
    return {
      ok: false,
      codigo: "pipeline_archived",
      mensagem: `O funil «${destino.name}» foi arquivado e não recebe mais negócios. Recarregue a página.`,
    };
  }
  if (!origem.crm_id || origem.crm_id !== destino.crm_id) {
    return { ok: false, codigo: "pipeline_immutable_use_clone", mensagem: RECUSA_ENTRE_CRMS };
  }
  return { ok: true, entreFunis: true };
}

/**
 * Os dois funis do movimento, lidos um a um pelo id — com a organização
 * conferida aqui, e não num filtro: o client do usuário já passa pela RLS, e a
 * conferência é a rede que sobra se a policy mudar (a convenção do repo).
 * Funil de outra organização volta `null`, igual a inexistente.
 */
export async function lerFunisDoMovimento(
  supabase: SupabaseClient,
  organizationId: string,
  origemId: string,
  destinoId: string,
): Promise<{ origem: FunilDoMovimento | null; destino: FunilDoMovimento | null; erro: string | null }> {
  const ler = async (id: string): Promise<{ funil: FunilDoMovimento | null; erro: string | null }> => {
    const { data, error } = await supabase
      .from("crm_pipelines")
      .select("id, organization_id, crm_id, is_archived, name")
      .eq("id", id)
      .maybeSingle();
    if (error) return { funil: null, erro: error.message };
    const linha = data as (FunilDoMovimento & { organization_id?: string }) | null;
    if (!linha || linha.organization_id !== organizationId) return { funil: null, erro: null };
    return {
      // O id é o PEDIDO, não o devolvido: é por ele que a regra compara origem e destino.
      funil: { id, crm_id: linha.crm_id ?? null, is_archived: linha.is_archived === true, name: linha.name ?? "" },
      erro: null,
    };
  };
  const [origem, destino] = await Promise.all([ler(origemId), ler(destinoId)]);
  return { origem: origem.funil, destino: destino.funil, erro: origem.erro ?? destino.erro };
}
