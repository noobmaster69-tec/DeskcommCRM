/**
 * Por que o composer desta conversa está fechado — se estiver.
 *
 * Morava dentro de `components/inbox/InboxLayout.tsx`. Saiu para cá quando o
 * chat flutuante (`components/chat-flutuante/JanelaDeChat.tsx`) passou a usar o
 * MESMO composer fora do Inbox: duas cópias desta regra divergem, e a que fica
 * para trás libera texto livre numa janela de 24h fechada — o `131047` que o
 * operador descobria uma mensagem por vez.
 *
 * Dois motivos, separados de propósito (ver `Composer`): `blockedReason` barra
 * tudo (contato bloqueado/anonimizado); `motivoDaJanela` barra só a RESPOSTA —
 * a nota interna nunca chega ao cliente.
 */
import { estadoDaJanela, formatarDecorrido } from "@/lib/channels/janela";
import { fonteDeTemplates } from "@/lib/channels/templates-fonte";

export interface ConversaParaBloqueio {
  last_inbound_at?: string | null;
  channel_sessions?: { provider?: string | null } | null;
  contacts?: { is_blocked?: boolean | null; is_anonymized?: boolean | null } | null;
}

export interface BloqueioDoEnvio {
  motivoDaJanela: string | null;
  blockedReason: string | null;
}

export function bloqueioDoEnvio(
  conversa: ConversaParaBloqueio | null | undefined,
  agora: Date,
  t: (texto: string) => string,
): BloqueioDoEnvio {
  const provider = conversa?.channel_sessions?.provider ?? null;
  const janela = estadoDaJanela(provider, conversa?.last_inbound_at ?? null, agora);
  const motivoDaJanela =
    janela.tipo === "fechada"
      ? fonteDeTemplates(provider) === null
        ? t("Aguarde uma nova mensagem do cliente para reabrir o atendimento nesta rede.")
        : janela.fechadaHaMs === null
        ? t("O cliente ainda não escreveu — a janela de 24h nunca abriu. Só um modelo aprovado sai daqui.")
        : `${t("A janela de 24h fechou há")} ${formatarDecorrido(janela.fechadaHaMs)}. ${t("Só um modelo aprovado sai daqui — texto livre é recusado pela plataforma.")}`
      : null;

  const blockedReason = conversa?.contacts?.is_blocked
    ? t("Contato bloqueado — envio de mensagens desabilitado.")
    : conversa?.contacts?.is_anonymized
      ? t("Contato anonimizado — não é possível enviar mensagens.")
      : null;

  return { motivoDaJanela, blockedReason };
}
