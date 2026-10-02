/**
 * O EFEITO QUE TRANSFORMA UM ENVIO EM TRABALHO.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * `pos-entrada.ts` abre a demanda quando o CLIENTE escreve primeiro. Quando
 * quem fala primeiro é a loja — pelo celular ou pela tela do CRM —, a conversa
 * entrava no inbox e parava ali: nenhum card no funil, e portanto nada que o
 * Radar de Risco ou o follow-up cobrassem. A pessoa abordada só virava
 * oportunidade se respondesse.
 *
 * ─── A régua é mais estreita que a da entrada, de propósito ────────────────
 *
 * Só nasce card para contato que NUNCA teve lead (`apenasPrimeiroLead`). A loja
 * também escreve para quem já comprou — entregar o pedido, avisar de prazo — e
 * com a régua da entrada ("sem lead aberto") cada entrega pós-venda abriria uma
 * demanda que ninguém pediu. Grupo, contato bloqueado e o número interno de
 * avisos também ficam de fora.
 *
 * ─── Nada aqui pode derrubar o envio ────────────────────────────────────────
 *
 * A mensagem JÁ saiu (ou já está gravada) quando esta função roda. Falha vira
 * log, nunca exceção — mesma regra de `pos-entrada.ts`.
 */
import { ehContatoDoNumeroInterno } from "@/lib/escalacao/numero-interno-de-aviso";
import { garantirLeadDaConversa, type OrigemDoNascimento } from "@/lib/leads/nascimento-do-lead";
import { logger } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface SaidaDeMensagem {
  organizationId: string;
  contactId: string;
  conversationId: string;
  /** Rótulo da origem, só para log (`celular`, `crm`). Nenhum passo ramifica por ele. */
  origem: string;
}

/** O que a timeline do card diz sobre o nascimento — "quem falou primeiro foi a loja". */
export const ORIGEM_DO_ENVIO: OrigemDoNascimento = {
  rotulo: "WhatsApp",
  source: "whatsapp",
  motivo: "primeira mensagem enviada no WhatsApp",
};

/**
 * Abre a demanda no funil quando a loja fala primeiro com um contato que nunca
 * teve card. Idempotente: a régua de "nunca teve lead" e a RPC de nascimento
 * (advisory lock por contato) seguram envios em rajada.
 */
export async function aplicarEfeitosPosSaida(admin: Admin, saida: SaidaDeMensagem): Promise<void> {
  try {
    if (await ehContatoDoNumeroInterno(admin, saida.organizationId, saida.contactId)) return;

    const nascimento = await garantirLeadDaConversa(admin, {
      organizationId: saida.organizationId,
      contactId: saida.contactId,
      conversationId: saida.conversationId,
      // No envio o nome do payload é o da LOJA, não do cliente: o título vem
      // só do cadastro (ver o passo 4 de `garantirLeadDaConversa`).
      nomeDoContato: null,
      origem: ORIGEM_DO_ENVIO,
      apenasPrimeiroLead: true,
    });

    if (nascimento.criado) {
      logger.info("pos-saida: lead criado", {
        organization_id: saida.organizationId,
        conversation_id: saida.conversationId,
        origem: saida.origem,
        lead_id: nascimento.leadId,
      });
    } else if (nascimento.motivo !== "ja_existe" && nascimento.motivo !== "ja_teve_lead") {
      // Os dois motivos acima são o caso comum (toda mensagem depois da
      // primeira); logá-los encheria o log sem informar nada. O resto é
      // configuração faltando ou falha — esses alguém precisa ver.
      logger.info("pos-saida: lead nao criado", {
        organization_id: saida.organizationId,
        conversation_id: saida.conversationId,
        origem: saida.origem,
        motivo: nascimento.motivo,
        ...(nascimento.detalhe ? { detalhe: nascimento.detalhe } : {}),
      });
    }
  } catch (err) {
    logger.error("pos-saida: nascimento do lead falhou (o envio segue)", {
      organization_id: saida.organizationId,
      conversation_id: saida.conversationId,
      origem: saida.origem,
      error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }
}
