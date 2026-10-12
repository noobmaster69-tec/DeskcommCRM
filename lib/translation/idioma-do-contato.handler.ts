/**
 * O idioma do contato nasce na primeira mensagem dele (fork jhoow, 9022).
 *
 * Consome `message.received` (emitido pelo trigger de `messages`, vale para
 * qualquer canal). Só age quando o contato ainda não tem origem de idioma:
 * daí em diante a cascata já está gravada e nada aqui roda de novo — nem o
 * modelo, que só é chamado quando nem a ficha nem o DDI respondem.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveContactLocale } from "./locale";

export const IDIOMA_DO_CONTATO_HANDLER_KEY = "idioma-do-contato.v1";

export const idiomaDoContatoHandler: EventHandler = {
  key: IDIOMA_DO_CONTATO_HANDLER_KEY,
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    const direcao = row.payload.direction;
    if (!contactId || (direcao != null && direcao !== "inbound")) {
      return { consumer_key: IDIOMA_DO_CONTATO_HANDLER_KEY, status: "skipped", detail: "sem contato ou não é entrada" };
    }
    try {
      const admin = createAdminClient();
      const { data } = await admin.from("contacts").select("locale_source").eq("id", contactId).maybeSingle();
      if ((data as { locale_source: string | null } | null)?.locale_source) {
        return { consumer_key: IDIOMA_DO_CONTATO_HANDLER_KEY, status: "skipped", detail: "idioma já resolvido" };
      }
      const texto = typeof row.payload.body_preview === "string" ? row.payload.body_preview : null;
      const r = await resolveContactLocale(admin, contactId, { texto });
      return {
        consumer_key: IDIOMA_DO_CONTATO_HANDLER_KEY,
        status: r.locale ? "ok" : "skipped",
        detail: `locale=${r.locale ?? "-"} origem=${r.source ?? "-"}`,
      };
    } catch (err) {
      return {
        consumer_key: IDIOMA_DO_CONTATO_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
