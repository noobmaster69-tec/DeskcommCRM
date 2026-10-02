"use client";
/**
 * A fileira de chats flutuantes, presa ao canto inferior direito.
 *
 * Montada UMA vez no layout do app (`app/app/layout.tsx`): é isso que deixa a
 * conversa aberta enquanto se navega entre funil, agenda e contatos.
 *
 * ─── Por cima, e não reservando rodapé ──────────────────────────────────────
 *
 * As janelas FLUTUAM sobre a página, como no Messenger — quem precisa ver o que
 * está atrás minimiza. Declarar 460px no contrato do rodapé
 * (`lib/ui/rodape-ocupado.tsx`) encolheria todas as telas enquanto houvesse um
 * chat aberto. O dock LÊ a reserva: com o painel de chamada de voz no mesmo
 * canto, a fileira sobe acima dele em vez de cobri-lo.
 *
 * ─── Sem limite de janelas ──────────────────────────────────────────────────
 *
 * Decisão do dono do produto. Passando da largura da tela, a fileira rola na
 * horizontal. `pointer-events-none` no contêiner: o espaço vazio entre as
 * janelas não pode engolir o clique na página atrás.
 */
import { JanelaDeChat } from "@/components/chat-flutuante/JanelaDeChat";
import { useChatsFlutuantes } from "@/hooks/chat-flutuante/ChatsFlutuantesProvider";
import { useT } from "@/hooks/i18n/useT";
import { useOcupacaoDoRodape } from "@/lib/ui/rodape-ocupado";

export function DockDeChats() {
  const t = useT();
  const ctx = useChatsFlutuantes();
  const reserva = useOcupacaoDoRodape();
  if (!ctx || ctx.chats.length === 0) return null;

  return (
    <div
      aria-label={t("Chats abertos")}
      role="region"
      // Acima do conteúdo e dos popovers da página, abaixo dos diálogos modais.
      className="pointer-events-none fixed right-4 z-40 hidden max-w-[calc(100vw-2rem)] flex-row-reverse items-end gap-2 overflow-x-auto md:flex"
      style={{ bottom: reserva }}
    >
      {ctx.chats.map((chat) => (
        <JanelaDeChat
          key={chat.conversationId}
          conversationId={chat.conversationId}
          minimizado={chat.minimizado}
          negocio={chat.negocio}
          onAlternarMinimizado={() => ctx.alternarMinimizado(chat.conversationId)}
          onFechar={() => ctx.fecharChat(chat.conversationId)}
        />
      ))}
    </div>
  );
}
