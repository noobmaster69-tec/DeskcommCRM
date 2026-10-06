import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/**
 * MARCAR COMO LIDAS (fork jhoow, "igual Leona"): quando o CRM responde — fluxo,
 * follow-up, IA ou atendente — as mensagens que o contato mandou ficam LIDAS no
 * aparelho dele (os dois tiques azuis), antes da resposta chegar. Também ao abrir
 * a conversa ou começar a digitar no Inbox.
 *
 * Preferência da EMPRESA: `organizations.settings.marcar_lidas_ao_responder`
 * (padrão LIGADO), em Configurações › Preferências.
 *
 * Só chama o canal quando há o que marcar: a última mensagem da conversa (antes
 * da que está saindo) é do CONTATO. Decorativo: falha é log, nunca derruba envio.
 */
export const PREFERENCIAS_PADRAO = { marcar_lidas_ao_responder: true } as const;
export type Preferencias = { marcar_lidas_ao_responder: boolean };

export function lerPreferencias(settings: Record<string, unknown> | null | undefined): Preferencias {
  const v = settings?.marcar_lidas_ao_responder;
  return { marcar_lidas_ao_responder: typeof v === "boolean" ? v : PREFERENCIAS_PADRAO.marcar_lidas_ao_responder };
}

const CACHE_MS = 60_000;
const cache = new Map<string, { em: number; ligado: boolean }>();

async function preferenciaLigada(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const c = cache.get(organizationId);
  if (c && Date.now() - c.em < CACHE_MS) return c.ligado;
  const { data } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const ligado = lerPreferencias((data as { settings?: Record<string, unknown> } | null)?.settings).marcar_lidas_ao_responder;
  cache.set(organizationId, { em: Date.now(), ligado });
  return ligado;
}

/** Esquece a preferência em cache (quem grava a tela chama). */
export function esquecerPreferencia(organizationId: string): void {
  cache.delete(organizationId);
}

export interface CanalQueMarca {
  markSeen?: (input: { organizationId: string; sessionRef: string; recipient: string }) => Promise<void>;
}

/** Há mensagem do contato ainda não respondida? (a mais recente, fora a que está saindo, é de entrada) */
async function temRecebidaPendente(
  db: SupabaseClient,
  organizationId: string,
  conversationId: string,
  ignorarMensagemId?: string,
): Promise<boolean> {
  let q = db
    .from("messages")
    .select("direction")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (ignorarMensagemId) q = q.neq("id", ignorarMensagemId);
  const { data } = await q;
  return ((data ?? []) as Array<{ direction: string }>)[0]?.direction === "inbound";
}

/**
 * Marca o chat como lido se a preferência estiver ligada e houver o que marcar.
 * Devolve se chamou o canal (para teste e log).
 */
export async function marcarComoLidas(
  db: SupabaseClient,
  e: {
    organizationId: string;
    conversationId: string;
    canal: CanalQueMarca;
    sessionRef: string | null;
    recipient: string | null;
    ignorarMensagemId?: string;
  },
): Promise<boolean> {
  try {
    if (!e.canal.markSeen || !e.sessionRef || !e.recipient) return false;
    if (!(await preferenciaLigada(db, e.organizationId))) return false;
    if (!(await temRecebidaPendente(db, e.organizationId, e.conversationId, e.ignorarMensagemId))) return false;
    await e.canal.markSeen({ organizationId: e.organizationId, sessionRef: e.sessionRef, recipient: e.recipient });
    return true;
  } catch (err) {
    logger.warn("[lidas] não marcou como lidas", { conversationId: e.conversationId, motivo: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
