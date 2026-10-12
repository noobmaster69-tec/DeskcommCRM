import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * O idioma do contato mudou: o event_log re-traduz as mensagens recentes dele
 * (`contact.locale_changed` → `traducaoHandler`). Fora da requisição de quem
 * salvou — 50 traduções não cabem no tempo de um clique. Falha é log.
 */
export async function avisarTrocaDeIdioma(organizationId: string, contactId: string, locale: string | null): Promise<void> {
  const { error } = await createAdminClient().from("event_log").insert({
    organization_id: organizationId,
    event_type: "contact.locale_changed",
    entity_kind: "contact",
    entity_id: contactId,
    payload: { contact_id: contactId, locale },
  });
  if (error) logger.warn("[traducao] troca de idioma sem evento de re-tradução", { error: error.message, contactId });
}
