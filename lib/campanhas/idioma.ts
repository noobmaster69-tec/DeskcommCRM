import { logger } from "@/lib/logger";

/**
 * O IDIOMA da campanha (fork jhoow): ele INICIA `idioma_prospeccao` e
 * `idioma_conversa` — na ficha do contato e no contexto da conversa
 * (`conversations.metadata`) — só onde ainda não há valor. Quem já conversa
 * num idioma continua nele: a segunda campanha não troca o idioma de uma
 * conversa estabelecida, e um "ok" do cliente também não.
 */

/** O idioma em que a mensagem sai: o da conversa já estabelecida, senão o da campanha, senão o do perfil. */
export function idiomaDoEnvio(
  campos: Record<string, unknown> | null | undefined,
  idiomaDaCampanha: string | null | undefined,
  locale?: string | null,
): string | undefined {
  const ler = (k: string) => {
    const v = campos && Object.prototype.hasOwnProperty.call(campos, k) ? campos[k] : null;
    return typeof v === "string" ? v.trim() : "";
  };
  return ler("idioma_conversa") || ler("idioma_prospeccao") || (idiomaDaCampanha ?? "").trim() || (locale ?? "").trim() || undefined;
}

interface Consulta {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Grava o idioma da campanha como ponto de partida — `jsonb_build_object(...) ||
 * atual`: a chave que já existe GANHA (o valor da direita prevalece), então
 * nada estabelecido é sobrescrito. Uma instrução só por tabela: sem corrida com
 * outro escritor de `custom_fields` (fluxo salvando campo no mesmo instante).
 * Falha é log, nunca derruba o envio.
 */
export async function iniciarIdiomaDaExecucao(
  db: Consulta,
  e: { organizationId: string; contactId: string; conversationId: string | null; idioma: string | null | undefined },
): Promise<void> {
  const idioma = (e.idioma ?? "").trim();
  if (!idioma) return;
  try {
    await db.query(
      `update public.contacts
          set custom_fields = jsonb_build_object('idioma_prospeccao', $3::text, 'idioma_conversa', $3::text) || coalesce(custom_fields, '{}'::jsonb)
        where organization_id = $1 and id = $2
          and not (coalesce(custom_fields, '{}'::jsonb) ?& array['idioma_prospeccao', 'idioma_conversa'])`,
      [e.organizationId, e.contactId, idioma],
    );
    if (e.conversationId) {
      await db.query(
        `update public.conversations
            set metadata = jsonb_build_object('idioma_prospeccao', $3::text, 'idioma_conversa', $3::text) || coalesce(metadata, '{}'::jsonb)
          where organization_id = $1 and id = $2
            and not (coalesce(metadata, '{}'::jsonb) ?& array['idioma_prospeccao', 'idioma_conversa'])`,
        [e.organizationId, e.conversationId, idioma],
      );
    }
  } catch (err) {
    logger.warn("[campanha] não gravou o idioma da execução", { motivo: err instanceof Error ? err.message : String(err) });
  }
}
