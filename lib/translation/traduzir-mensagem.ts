import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarModeloDeTraducao } from "./llm";
import { mesmaLingua, nomeDoIdioma, normalizarLocale } from "./idiomas";
import { resolveContactLocale } from "./locale";

/**
 * TRADUÇÃO DA MENSAGEM RECEBIDA (fork jhoow, Fase B).
 *
 * O cliente escreve no idioma dele; o atendente lê no seu (`user_preferences.
 * operating_locale` de quem atende, senão pt-BR). O original fica em `body`,
 * intocado; a tradução vai para `content_translated` com `translated_to`.
 *
 * ⚠️ CACHE OBRIGATÓRIO: mensagem já traduzida do MESMO idioma para o MESMO
 * idioma nunca volta ao modelo. Só passa de novo quando o idioma do contato ou
 * o do atendente mudou (re-tradução em lote) ou quando a anterior falhou e
 * alguém pediu "tentar novamente".
 */

export const IDIOMA_PADRAO_DO_ATENDENTE = "pt-BR";

export function promptDeTraducao(de: string, para: string): string {
  return (
    `Traduza esta mensagem de ${nomeDoIdioma(de)} para ${nomeDoIdioma(para)}. ` +
    "Preserve emojis, gírias, tom e nomes próprios. Devolva apenas o texto traduzido, " +
    "sem aspas, sem comentários e sem explicação."
  );
}

/** Corpo que é só marcador de mídia (`[image]`) não tem o que traduzir. */
function temTextoTraduzivel(body: string | null): body is string {
  const t = (body ?? "").trim();
  return t.length > 0 && !/^\[[a-z_]+\]$/i.test(t) && /\p{L}/u.test(t);
}

export type DesfechoDaTraducao = "traduzida" | "cache" | "mesmo_idioma" | "sem_idioma" | "sem_texto" | "desligada" | "falhou";

interface LinhaDaMensagem {
  id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  direction: string;
  body: string | null;
  content_translated: string | null;
  content_locale: string | null;
  translated_to: string | null;
  translation_status: string | null;
}

/** O idioma em que o atendente da conversa lê. Sem dono ou sem preferência: pt-BR. */
export async function idiomaDoAtendenteDaConversa(admin: SupabaseClient, conversationId: string): Promise<string> {
  const { data: conv } = await admin
    .from("conversations")
    .select("assigned_to_user_id")
    .eq("id", conversationId)
    .maybeSingle();
  const dono = (conv as { assigned_to_user_id: string | null } | null)?.assigned_to_user_id;
  if (!dono) return IDIOMA_PADRAO_DO_ATENDENTE;
  return idiomaDoUsuario(admin, dono);
}

export async function idiomaDoUsuario(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("user_preferences").select("operating_locale").eq("user_id", userId).maybeSingle();
  return normalizarLocale((data as { operating_locale: string } | null)?.operating_locale) ?? IDIOMA_PADRAO_DO_ATENDENTE;
}

/** A conversa desligou a tradução de entrada? (`conversations.metadata.traducao.entrada === false`) */
async function entradaDesligada(admin: SupabaseClient, conversationId: string): Promise<boolean> {
  const { data } = await admin.from("conversations").select("metadata").eq("id", conversationId).maybeSingle();
  const meta = ((data as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}) as Record<string, unknown>;
  const traducao = (meta.traducao ?? {}) as Record<string, unknown>;
  return traducao.entrada === false;
}

export interface OpcoesDeTraducao {
  /** Ignora o desfecho "falhou" anterior (botão "tentar novamente"). */
  repetirFalha?: boolean;
  /** Idioma de destino já conhecido (lote); senão, o do atendente da conversa. */
  para?: string;
  traduzir?: typeof chamarModeloDeTraducao;
}

export async function traduzirMensagemRecebida(
  admin: SupabaseClient,
  messageId: string,
  opcoes: OpcoesDeTraducao = {},
): Promise<DesfechoDaTraducao> {
  const { data } = await admin
    .from("messages")
    .select("id, organization_id, conversation_id, contact_id, direction, body, content_translated, content_locale, translated_to, translation_status")
    .eq("id", messageId)
    .maybeSingle();
  const m = data as LinhaDaMensagem | null;
  if (!m || m.direction !== "inbound" || !temTextoTraduzivel(m.body)) return "sem_texto";
  if (await entradaDesligada(admin, m.conversation_id)) return "desligada";

  const para = opcoes.para ?? (await idiomaDoAtendenteDaConversa(admin, m.conversation_id));
  const { locale: de } = await resolveContactLocale(admin, m.contact_id, { texto: m.body });
  if (!de) return "sem_idioma";

  const gravar = (campos: Record<string, unknown>) => admin.from("messages").update(campos).eq("id", m.id);

  if (mesmaLingua(de, para)) {
    if (m.translation_status !== "skipped" || m.content_locale !== de) {
      await gravar({ translation_status: "skipped", content_locale: de });
    }
    return "mesmo_idioma";
  }

  // O cache: mesma origem, mesmo destino, já traduzida — o modelo não é chamado.
  if (m.content_translated && m.translated_to === para && m.content_locale === de) return "cache";
  if (m.translation_status === "failed" && m.translated_to === para && m.content_locale === de && !opcoes.repetirFalha) {
    return "falhou";
  }

  const texto = await (opcoes.traduzir ?? chamarModeloDeTraducao)(admin, {
    organizationId: m.organization_id,
    kind: "message_translate",
    system: promptDeTraducao(de, para),
    prompt: m.body,
    conversationId: m.conversation_id,
    messageId: m.id,
  });
  if (!texto) {
    await gravar({ translation_status: "failed", content_locale: de, translated_to: para });
    return "falhou";
  }
  await gravar({
    content_translated: texto,
    content_locale: de,
    translated_to: para,
    translated_at: new Date().toISOString(),
    translation_status: "done",
  });
  return "traduzida";
}

/**
 * RE-TRADUÇÃO EM LOTE: o idioma do contato mudou (alguém corrigiu na ficha ou
 * no selo do cabeçalho). As mensagens recebidas recentes passam de novo — o
 * cache não segura porque a origem (`content_locale`) mudou.
 */
export async function retraduzirMensagensDoContato(
  admin: SupabaseClient,
  contactId: string,
  limite = 50,
  opcoes: Pick<OpcoesDeTraducao, "traduzir"> = {},
): Promise<number> {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .not("body", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limite);
  let traduzidas = 0;
  for (const { id } of (data ?? []) as Array<{ id: string }>) {
    const r = await traduzirMensagemRecebida(admin, id, { repetirFalha: true, traduzir: opcoes.traduzir });
    if (r === "traduzida") traduzidas++;
  }
  return traduzidas;
}
