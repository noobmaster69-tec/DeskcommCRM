"use client";
/**
 * UMA conversa flutuando no canto da tela — o histórico e a resposta, sem sair
 * da página onde se está.
 *
 * ─── O mesmo chat do Inbox, não uma cópia ───────────────────────────────────
 *
 * O fio é o `ChatThread` e a resposta é o `Composer` do Inbox — anexos, áudio,
 * emoji, templates e nota interna vêm de graça, e a correção que entrar lá
 * entra aqui. O motivo que o `ConversaSlot` dava para NÃO pôr composer no card
 * ("duas cópias divergem") continua de pé: não há segunda cópia.
 *
 * A regra de quando o composer fecha (contato bloqueado, janela de 24h) também
 * é a mesma, em `lib/inbox/bloqueio-do-envio.ts`.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatThread } from "@/components/inbox/ChatThread";
import { Composer } from "@/components/inbox/Composer";
import { useUser } from "@/hooks/auth/AuthProvider";
import type { NegocioDoChat } from "@/hooks/chat-flutuante/ChatsFlutuantesProvider";
import { useT } from "@/hooks/i18n/useT";
import { isNotFound, useConversation } from "@/hooks/inbox/useConversation";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { initials } from "@/lib/contacts/apresentacao-na-lista";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { bloqueioDoEnvio } from "@/lib/inbox/bloqueio-do-envio";
import { ArrowSquareOut, CaretDown, CaretUp, Kanban, X } from "@/lib/ui/icons";
import type { Message } from "@/lib/types/messaging";
import { cn } from "@/lib/utils";

interface Props {
  conversationId: string;
  minimizado: boolean;
  negocio?: NegocioDoChat;
  onAlternarMinimizado: () => void;
  onFechar: () => void;
}

const BOTAO =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text focus-visible:outline-2 focus-visible:outline-accent";

export function JanelaDeChat({ conversationId, minimizado, negocio, onAlternarMinimizado, onFechar }: Props) {
  const t = useT();
  const user = useUser();
  const { data: conversa, error, isLoading } = useConversation(conversationId, true);
  const [respondendo, setRespondendo] = useState<Message | null>(null);

  // Mesmo relógio do Inbox: a janela de 24h vence com o chat aberto, e o
  // composer precisa fechar sem esperar recarregamento.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const contato = conversa?.contacts ?? null;
  const nome = conversa ? rotuloDoContato(contato, t) : t("Conversa");
  const telefone = contato?.phone_number ? phoneForDisplay(contato.phone_number) : null;
  const { motivoDaJanela, blockedReason } = bloqueioDoEnvio(conversa, agora, t);
  const somenteLeitura = user.support?.access_mode === "support_readonly";

  return (
    <section
      aria-label={`${t("Conversa")}: ${nome}`}
      className={cn(
        "pointer-events-auto flex w-[340px] shrink-0 flex-col overflow-hidden rounded-t-lg border border-b-0 border-border bg-surface shadow-lg",
        minimizado ? "h-12" : "h-[460px]",
      )}
    >
      {/* Cabeçalho: clicar no nome minimiza/expande, como no Messenger. */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <button
          type="button"
          onClick={onAlternarMinimizado}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={!minimizado}
        >
          <Avatar className="h-8 w-8 shrink-0">
            {contato?.avatar_storage_path && !contato?.is_anonymized ? (
              <AvatarImage src={`/api/v1/contacts/${contato.id}/avatar`} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-surface-elevated text-[11px] font-medium text-text-muted">
              {initials(nome, telefone ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text">{nome}</span>
            {telefone && telefone !== nome && (
              <span className="block truncate text-[11px] leading-3 text-text-muted">{telefone}</span>
            )}
          </span>
        </button>
        {negocio && (
          <Link
            href={`/app/pipelines/${negocio.pipelineId}?lead=${negocio.leadId}`}
            className={BOTAO}
            title={t("Ver negócio")}
            aria-label={t("Ver negócio")}
          >
            <Kanban size={16} aria-hidden />
          </Link>
        )}
        <Link
          href={`/app/inbox/${conversationId}`}
          className={BOTAO}
          title={t("Abrir no Inbox")}
          aria-label={t("Abrir no Inbox")}
        >
          <ArrowSquareOut size={16} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={onAlternarMinimizado}
          className={BOTAO}
          title={minimizado ? t("Expandir") : t("Minimizar")}
          aria-label={minimizado ? t("Expandir") : t("Minimizar")}
        >
          {minimizado ? <CaretUp size={16} aria-hidden /> : <CaretDown size={16} aria-hidden />}
        </button>
        <button type="button" onClick={onFechar} className={BOTAO} title={t("Fechar")} aria-label={t("Fechar")}>
          <X size={16} aria-hidden />
        </button>
      </header>

      {!minimizado && (
        <>
          <div className="min-h-0 flex-1 overflow-hidden">
            {error ? (
              // 404 = conversa de outra organização ou fora do escopo do atendente
              // (RLS). O chat persistido pode apontar para ela depois de uma troca
              // de papel: diz isso em vez de girar para sempre.
              <p className="p-4 text-sm text-text-muted">
                {isNotFound(error)
                  ? t("Conversa não encontrada.")
                  : t("Não foi possível carregar a conversa.")}
              </p>
            ) : (
              <ChatThread
                conversationId={conversationId}
                provider={conversa?.channel_sessions?.provider ?? null}
                onResponder={setRespondendo}
                dono={
                  conversa
                    ? {
                        userId: conversa.assigned_to_user_id ?? null,
                        nome: conversa.assigned_to_user_name ?? null,
                      }
                    : null
                }
                contatoId={contato?.id ?? null}
              />
            )}
          </div>
          {conversa && !isLoading && (
            <div className="shrink-0 border-t border-border">
              <Composer
                conversationId={conversationId}
                blockedReason={somenteLeitura ? t("Acompanhamento somente leitura") : blockedReason}
                janelaFechada={motivoDaJanela}
                disabled={conversa.status === "closed"}
                contactName={contato?.name ?? null}
                respondendo={respondendo}
                onCancelarResposta={() => setRespondendo(null)}
                currentContactId={conversa.contact_id}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
