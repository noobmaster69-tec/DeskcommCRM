"use client";
/**
 * OS CHATS FLUTUANTES — conversas abertas no canto da tela, por cima de
 * qualquer página do CRM (estilo Messenger/Direct no desktop).
 *
 * Este arquivo guarda SÓ o estado: quais conversas estão abertas e quais
 * estão minimizadas. Quem desenha é `components/chat-flutuante/DockDeChats.tsx`,
 * montado uma vez no layout do app — por isso o chat sobrevive à navegação.
 *
 * ─── Persistência ───────────────────────────────────────────────────────────
 *
 * localStorage, chave por USUÁRIO e ORGANIZAÇÃO: quem troca de organização não
 * pode reabrir um chat da outra (a rota da conversa devolveria 404, e pior,
 * a lista revelaria ids de lá). Falha de storage (modo privado, cota) é
 * silenciosa — o chat funciona igual, só não volta depois do recarregamento.
 *
 * ─── Sem limite de janelas ──────────────────────────────────────────────────
 *
 * Decisão do dono do produto. A fileira rola na horizontal quando passa da
 * largura da tela (ver o dock).
 *
 * ─── Celular ────────────────────────────────────────────────────────────────
 *
 * Abaixo de 768px uma janela de 340px não cabe ao lado de nada: abrir um chat
 * leva para o Inbox, que já é a tela de conversa do celular.
 */
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** De qual negócio o chat foi aberto — é o destino do botão "Ver negócio". */
export interface NegocioDoChat {
  leadId: string;
  pipelineId: string;
}

export interface ChatAberto {
  conversationId: string;
  minimizado: boolean;
  negocio?: NegocioDoChat;
}

interface ChatsFlutuantesCtx {
  /** Da DIREITA para a esquerda: o primeiro é o que fica no canto. */
  chats: ChatAberto[];
  abrirChat: (conversationId: string, negocio?: NegocioDoChat) => void;
  fecharChat: (conversationId: string) => void;
  alternarMinimizado: (conversationId: string) => void;
}

const Ctx = createContext<ChatsFlutuantesCtx | null>(null);

/** Largura abaixo da qual o chat abre no Inbox em vez de flutuar. */
export const LARGURA_MINIMA_DO_CHAT_FLUTUANTE = 768;

export function chaveDoArmazenamento(userId: string, orgId: string | null): string {
  return `chats-flutuantes:${userId}:${orgId ?? "sem-org"}`;
}

/** Lê o que foi gravado, descartando qualquer forma que não seja a nossa. */
export function lerChatsGravados(bruto: string | null): ChatAberto[] {
  if (!bruto) return [];
  try {
    const lido: unknown = JSON.parse(bruto);
    if (!Array.isArray(lido)) return [];
    const vistos = new Set<string>();
    const chats: ChatAberto[] = [];
    for (const item of lido) {
      if (!item || typeof item !== "object") continue;
      const { conversationId, minimizado, negocio } = item as Record<string, unknown>;
      if (typeof conversationId !== "string" || conversationId === "" || vistos.has(conversationId)) continue;
      vistos.add(conversationId);
      const n = negocio as Record<string, unknown> | null | undefined;
      const negocioValido =
        n && typeof n.leadId === "string" && typeof n.pipelineId === "string"
          ? { leadId: n.leadId, pipelineId: n.pipelineId }
          : undefined;
      chats.push({ conversationId, minimizado: minimizado === true, ...(negocioValido ? { negocio: negocioValido } : {}) });
    }
    return chats;
  } catch {
    return [];
  }
}

/**
 * Abrir um chat que já está aberto o traz para o canto e o expande — clicar de
 * novo no card é "quero ver esta conversa", não "abra uma segunda janela".
 */
export function comChatAberto(
  chats: ChatAberto[],
  conversationId: string,
  negocio?: NegocioDoChat,
): ChatAberto[] {
  const anterior = chats.find((c) => c.conversationId === conversationId);
  const destino = negocio ?? anterior?.negocio;
  return [
    { conversationId, minimizado: false, ...(destino ? { negocio: destino } : {}) },
    ...chats.filter((c) => c.conversationId !== conversationId),
  ];
}

export function ChatsFlutuantesProvider({
  userId,
  orgId,
  children,
}: {
  userId: string;
  orgId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const chave = chaveDoArmazenamento(userId, orgId);
  const [chats, setChats] = useState<ChatAberto[]>([]);
  // A leitura do storage acontece DEPOIS da hidratação: lida no primeiro render,
  // o HTML do servidor (sem chats) e o do cliente (com chats) divergiriam.
  // Guarda DE QUAL chave o estado veio: a gravação só roda depois que a leitura
  // daquela chave entrou no estado — senão o primeiro passe gravaria `[]` por
  // cima do que estava salvo.
  const [carregadoDe, setCarregadoDe] = useState<string | null>(null);

  useEffect(() => {
    let gravados: ChatAberto[] = [];
    try {
      gravados = lerChatsGravados(window.localStorage.getItem(chave));
    } catch {
      /* storage indisponível: começa vazio */
    }
    setChats(gravados);
    setCarregadoDe(chave);
  }, [chave]);

  useEffect(() => {
    if (carregadoDe !== chave) return;
    try {
      window.localStorage.setItem(chave, JSON.stringify(chats));
    } catch {
      /* storage indisponível: o chat segue funcionando, só não persiste */
    }
  }, [chave, chats, carregadoDe]);

  const abrirChat = useCallback(
    (conversationId: string, negocio?: NegocioDoChat) => {
      if (typeof window !== "undefined" && window.innerWidth < LARGURA_MINIMA_DO_CHAT_FLUTUANTE) {
        router.push(`/app/inbox?id=${encodeURIComponent(conversationId)}`);
        return;
      }
      setChats((atual) => comChatAberto(atual, conversationId, negocio));
    },
    [router],
  );

  const fecharChat = useCallback((conversationId: string) => {
    setChats((atual) => atual.filter((c) => c.conversationId !== conversationId));
  }, []);

  const alternarMinimizado = useCallback((conversationId: string) => {
    setChats((atual) =>
      atual.map((c) => (c.conversationId === conversationId ? { ...c, minimizado: !c.minimizado } : c)),
    );
  }, []);

  const valor = useMemo(
    () => ({ chats, abrirChat, fecharChat, alternarMinimizado }),
    [chats, abrirChat, fecharChat, alternarMinimizado],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Fora do provedor devolve `null`: um componente montado num teste isolado (o
 * card do funil, por exemplo) segue funcionando com o comportamento antigo.
 */
export function useChatsFlutuantes(): ChatsFlutuantesCtx | null {
  return useContext(Ctx);
}
