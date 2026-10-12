import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/**
 * "Este número tem WhatsApp?" ANTES da primeira mensagem (fork jhoow, 9020).
 *
 * A suspensão de 06/10 veio logo depois de tentar falar com telefones FIXOS de
 * Portugal: mensagem para número sem WhatsApp não chega e conta contra quem
 * envia. Aqui o canal é consultado (no WAHA: `contacts/check-exists`, ~80 ms) e
 * a resposta fica em cache no contato (`wa_existe`, `wa_verificado_em`):
 * "tem" vale 30 dias, "não tem" vale 7 (o número pode ser ativado depois).
 *
 * Desfecho: `true` (pode enviar), `false` (NÃO envie), `null` (o canal não
 * soube dizer — o envio segue, como sempre seguiu; falha da consulta não pode
 * calar o atendimento).
 */
const VALIDADE_SIM_MS = 30 * 86_400_000;
const VALIDADE_NAO_MS = 7 * 86_400_000;

export interface CanalQueVerifica {
  checkRecipient?: (input: { organizationId: string; sessionRef: string; phone: string }) => Promise<boolean | null>;
}

export async function verificarWhatsapp(
  db: SupabaseClient,
  e: {
    organizationId: string;
    contactId: string;
    telefone: string | null | undefined;
    canal: CanalQueVerifica;
    sessionRef: string | null;
    agora?: Date;
  },
): Promise<boolean | null> {
  const agora = e.agora ?? new Date();
  const telefone = (e.telefone ?? "").replace(/\D/g, "");
  if (!telefone || !e.sessionRef || !e.canal.checkRecipient) return null;
  try {
    const { data } = await db
      .from("contacts")
      .select("wa_existe, wa_verificado_em")
      .eq("organization_id", e.organizationId)
      .eq("id", e.contactId)
      .maybeSingle();
    const c = data as { wa_existe: boolean | null; wa_verificado_em: string | null } | null;
    if (c?.wa_verificado_em && c.wa_existe !== null) {
      const idade = agora.getTime() - new Date(c.wa_verificado_em).getTime();
      if (idade < (c.wa_existe ? VALIDADE_SIM_MS : VALIDADE_NAO_MS)) return c.wa_existe;
    }
    const existe = await e.canal.checkRecipient({ organizationId: e.organizationId, sessionRef: e.sessionRef, phone: telefone });
    if (existe === null) return null;
    await db
      .from("contacts")
      .update({ wa_existe: existe, wa_verificado_em: agora.toISOString() })
      .eq("organization_id", e.organizationId)
      .eq("id", e.contactId);
    return existe;
  } catch (err) {
    logger.warn("[whatsapp] verificação do número falhou", { contactId: e.contactId, motivo: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** O contato já falou com a gente alguma vez? (então o número existe e a conversa é quente) */
export async function contatoJaFalou(db: SupabaseClient, organizationId: string, contactId: string): Promise<boolean> {
  const { data } = await db
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .limit(1);
  return (data ?? []).length > 0;
}
