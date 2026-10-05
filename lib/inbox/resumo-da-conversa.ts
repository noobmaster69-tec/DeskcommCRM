import { generateText, type LanguageModel } from "ai";

/**
 * O "Resumir" do composer do Inbox (fork jhoow): o que aconteceu na conversa,
 * em poucas linhas, para quem pega o atendimento no meio. Só o TEXTO entra no
 * prompt (mídia vira "[mídia]" ou a transcrição já derivada), e só as últimas
 * mensagens — o resumo é para retomar, não para arquivar.
 */
export const MAX_MENSAGENS_NO_RESUMO = 60;
const MAX_CARACTERES_POR_MENSAGEM = 600;

export interface MensagemParaResumo {
  direction: "inbound" | "outbound" | string;
  body: string | null;
  media_derived_text?: string | null;
  type?: string | null;
  created_at: string;
}

/** A transcrição que vai ao modelo, da mais antiga para a mais nova. */
export function transcricaoParaResumo(mensagens: readonly MensagemParaResumo[]): string {
  return [...mensagens]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-MAX_MENSAGENS_NO_RESUMO)
    .map((m) => {
      const quem = m.direction === "inbound" ? "Cliente" : "Empresa";
      const texto = (m.body?.trim() || m.media_derived_text?.trim() || (m.type && m.type !== "text" ? `[${m.type}]` : "")).slice(
        0,
        MAX_CARACTERES_POR_MENSAGEM,
      );
      return texto ? `${quem}: ${texto}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function resumirConversa(model: LanguageModel, transcricao: string): Promise<string> {
  const r = await generateText({
    model,
    abortSignal: AbortSignal.timeout(60_000),
    system:
      "Você resume conversas de atendimento por WhatsApp para a equipe. Em português do Brasil, " +
      "no máximo 5 tópicos curtos: o que o cliente quer, o que já foi respondido ou combinado, " +
      "e o que está pendente. Sem inventar nada que não esteja na conversa. Sem saudação.",
    prompt: transcricao,
  });
  return r.text.trim();
}
