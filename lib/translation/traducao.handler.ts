/**
 * Tradução automática no event_log (fork jhoow, Fase B).
 *
 * - `message.received` (entrada): traduz para o idioma de quem atende.
 * - `contact.locale_changed`: re-traduz as mensagens recentes do contato.
 *
 * Roda DEPOIS do handler do idioma do contato (registro em ordem), então a
 * cascata já está gravada quando a tradução lê o idioma.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { retraduzirMensagensDoContato, traduzirMensagemRecebida } from "./traduzir-mensagem";

export const TRADUCAO_HANDLER_KEY = "traducao-automatica.v1";

export const traducaoHandler: EventHandler = {
  key: TRADUCAO_HANDLER_KEY,
  events: ["message.received", "contact.locale_changed"],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      if (row.event_type === "contact.locale_changed") {
        const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : row.entity_id;
        if (!contactId) return { consumer_key: TRADUCAO_HANDLER_KEY, status: "skipped", detail: "sem contato" };
        const n = await retraduzirMensagensDoContato(admin, contactId);
        return { consumer_key: TRADUCAO_HANDLER_KEY, status: "ok", detail: `retraduzidas=${n}` };
      }
      const messageId = typeof row.payload.message_id === "string" ? row.payload.message_id : null;
      if (!messageId || (row.payload.direction != null && row.payload.direction !== "inbound")) {
        return { consumer_key: TRADUCAO_HANDLER_KEY, status: "skipped", detail: "não é entrada" };
      }
      const r = await traduzirMensagemRecebida(admin, messageId);
      return { consumer_key: TRADUCAO_HANDLER_KEY, status: r === "traduzida" ? "ok" : "skipped", detail: r };
    } catch (err) {
      return { consumer_key: TRADUCAO_HANDLER_KEY, status: "error", detail: err instanceof Error ? err.message : String(err) };
    }
  },
};
