import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  DEFAULT_CHANNEL_PROVIDER,
  getAdapter,
  resolveSessionRef,
  type ChannelSessionRef,
} from "@/lib/channels";

/**
 * Bloco NOTIFICAÇÃO dos fluxos (fork jhoow, Fase C): avisa a EQUIPE por
 * WhatsApp — "o lead X pediu orçamento" — pelo MESMO número da conversa em que
 * o fluxo roda.
 *
 * Vai direto pelo adapter, e não pela cadeia do Inbox, de propósito: o número
 * da equipe não é lead. Passar por `messages` criaria contato, conversa e card
 * no funil para o próprio atendente, e o modo de teste do canal (que segura a
 * automação para LEADS) recusaria o aviso interno. O que fica registrado é o
 * evento do fluxo (`fluxo.notificacao`), não uma mensagem na Inbox.
 */
const SESSAO_SAUDAVEL = "WORKING";

export async function notificarEquipePeloCanal(
  admin: SupabaseClient,
  input: { organizationId: string; conversationId: string; numeroE164: string; texto: string },
): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const { data } = await admin
      .from("conversations")
      .select(`channel_sessions:channel_session_id(${CHANNEL_SESSION_REF_COLUMNS}, status)`)
      .eq("organization_id", input.organizationId)
      .eq("id", input.conversationId)
      .maybeSingle();
    const sessao = (data as unknown as { channel_sessions: (ChannelSessionRef & { status: string | null }) | null } | null)
      ?.channel_sessions;
    if (!sessao) return { ok: false, detalhe: "conversa_sem_canal" };
    if (sessao.status !== SESSAO_SAUDAVEL) return { ok: false, detalhe: "canal_fora_do_ar" };
    const adapter = getAdapter(sessao.provider ?? DEFAULT_CHANNEL_PROVIDER);
    const to = adapter.resolveRecipient({
      isGroup: false,
      groupChatId: null,
      phoneNumber: input.numeroE164,
      waIdentity: null,
      waLid: null,
    });
    if (!to) return { ok: false, detalhe: "numero_invalido" };
    await adapter.send({
      organizationId: input.organizationId,
      sessionRef: resolveSessionRef(sessao),
      to,
      kind: "text",
      body: input.texto,
    });
    return { ok: true, detalhe: input.numeroE164 };
  } catch (e) {
    return { ok: false, detalhe: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}
