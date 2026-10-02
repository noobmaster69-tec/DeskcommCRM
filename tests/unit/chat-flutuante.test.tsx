/**
 * O CHAT FLUTUANTE — a conversa aberta no canto, por cima de qualquer página.
 *
 * Pedido do dono do produto: clicar no card do funil abre a conversa num
 * pop-up estilo Messenger, dá para continuar navegando, vários chats ficam
 * empilhados, cada um minimiza e fecha, e o que está aberto volta depois de
 * recarregar a página (por usuário).
 *
 * O fio e o composer são os do Inbox (duplicados aqui): o que se prova é a
 * casca — estado, persistência, a janela e quem abre o quê.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ptBR } from "date-fns/locale";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => ptBR }));

const usuario = vi.hoisted(() => ({ atual: { id: "u1", support: null as null | { access_mode: string } } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useUser: () => usuario.atual }));

const conversaFalsa = vi.hoisted(() => {
  const base = {
    data: {
      id: "conv-1",
      contact_id: "c1",
      status: "open",
      last_inbound_at: new Date().toISOString(),
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      channel_sessions: { provider: "waha" },
      contacts: {
        id: "c1",
        name: "Maria Silva",
        display_name: null,
        phone_number: "5531999990000",
        is_blocked: false,
        is_anonymized: false,
        avatar_storage_path: null,
      },
    } as Record<string, unknown> | undefined,
    error: null as unknown,
    isLoading: false,
  };
  return { base, atual: base };
});
vi.mock("@/hooks/inbox/useConversation", () => ({
  useConversation: () => conversaFalsa.atual,
  isNotFound: () => false,
}));

const composerProps = vi.hoisted(() => ({ ultimo: null as Record<string, unknown> | null }));
vi.mock("@/components/inbox/ChatThread", () => ({
  ChatThread: ({ conversationId }: { conversationId: string }) => <div data-testid="fio">fio {conversationId}</div>,
}));
vi.mock("@/components/inbox/Composer", () => ({
  Composer: (props: Record<string, unknown>) => {
    composerProps.ultimo = props;
    return <div data-testid="composer" />;
  },
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { JanelaDeChat } from "@/components/chat-flutuante/JanelaDeChat";
import {
  ChatsFlutuantesProvider,
  chaveDoArmazenamento,
  comChatAberto,
  lerChatsGravados,
  useChatsFlutuantes,
} from "@/hooks/chat-flutuante/ChatsFlutuantesProvider";
import { bloqueioDoEnvio } from "@/lib/inbox/bloqueio-do-envio";

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  usuario.atual = { id: "u1", support: null };
  composerProps.ultimo = null;
  conversaFalsa.atual = conversaFalsa.base;
});

describe("o estado dos chats", () => {
  it("abrir um chat já aberto o traz para o canto e expande — não duplica", () => {
    const antes = [
      { conversationId: "a", minimizado: false },
      { conversationId: "b", minimizado: true },
    ];
    expect(comChatAberto(antes, "b")).toEqual([
      { conversationId: "b", minimizado: false },
      { conversationId: "a", minimizado: false },
    ]);
  });

  it("sem limite de janelas: o décimo chat entra como os outros", () => {
    let chats: ReturnType<typeof lerChatsGravados> = [];
    for (let i = 0; i < 10; i++) chats = comChatAberto(chats, `c${i}`);
    expect(chats).toHaveLength(10);
    expect(chats.every((c) => !c.minimizado)).toBe(true);
  });

  it("reabrir sem negócio preserva o negócio de antes (o botão 'Ver negócio' não some)", () => {
    const antes = [{ conversationId: "a", minimizado: true, negocio: { leadId: "l1", pipelineId: "p1" } }];
    expect(comChatAberto(antes, "a")[0]!.negocio).toEqual({ leadId: "l1", pipelineId: "p1" });
  });

  it("o que vem do storage é conferido: lixo, duplicata e negócio malformado saem", () => {
    expect(lerChatsGravados("não é json")).toEqual([]);
    expect(lerChatsGravados('{"a":1}')).toEqual([]);
    expect(
      lerChatsGravados(
        JSON.stringify([
          { conversationId: "a", minimizado: true, negocio: { leadId: "l1", pipelineId: "p1" } },
          { conversationId: "a", minimizado: false },
          { conversationId: "b", negocio: { leadId: 3 } },
          { conversationId: "" },
          null,
        ]),
      ),
    ).toEqual([
      { conversationId: "a", minimizado: true, negocio: { leadId: "l1", pipelineId: "p1" } },
      { conversationId: "b", minimizado: false },
    ]);
  });

  it("a chave separa usuário E organização", () => {
    expect(chaveDoArmazenamento("u1", "org-a")).not.toBe(chaveDoArmazenamento("u1", "org-b"));
    expect(chaveDoArmazenamento("u1", "org-a")).not.toBe(chaveDoArmazenamento("u2", "org-a"));
  });
});

/** Um botão de teste que usa o provedor como o card usaria. */
function Controle() {
  const ctx = useChatsFlutuantes()!;
  return (
    <div>
      <button onClick={() => ctx.abrirChat("conv-1", { leadId: "l1", pipelineId: "p1" })}>abrir</button>
      <button onClick={() => ctx.alternarMinimizado("conv-1")}>minimizar</button>
      <button onClick={() => ctx.fecharChat("conv-1")}>fechar</button>
      <output data-testid="estado">{JSON.stringify(ctx.chats)}</output>
    </div>
  );
}

function renderProvedor(userId = "u1", orgId = "org-a") {
  return render(
    <ChatsFlutuantesProvider userId={userId} orgId={orgId}>
      <Controle />
    </ChatsFlutuantesProvider>,
  );
}

describe("a persistência", () => {
  it("o que está aberto volta depois de recarregar — minimizado continua minimizado", () => {
    const primeira = renderProvedor();
    fireEvent.click(screen.getByText("abrir"));
    fireEvent.click(screen.getByText("minimizar"));
    primeira.unmount();

    renderProvedor();
    expect(JSON.parse(screen.getByTestId("estado").textContent!)).toEqual([
      { conversationId: "conv-1", minimizado: true, negocio: { leadId: "l1", pipelineId: "p1" } },
    ]);
  });

  it("o primeiro render NÃO apaga o que estava salvo", () => {
    const chave = chaveDoArmazenamento("u1", "org-a");
    window.localStorage.setItem(chave, JSON.stringify([{ conversationId: "salvo", minimizado: false }]));

    renderProvedor();

    expect(JSON.parse(window.localStorage.getItem(chave)!)).toEqual([
      { conversationId: "salvo", minimizado: false },
    ]);
  });

  it("outro usuário na mesma máquina não vê os chats do primeiro", () => {
    const primeira = renderProvedor("u1");
    fireEvent.click(screen.getByText("abrir"));
    primeira.unmount();

    renderProvedor("u2");
    expect(screen.getByTestId("estado").textContent).toBe("[]");
  });

  it("fechar tira o chat da lista e do storage", () => {
    renderProvedor();
    fireEvent.click(screen.getByText("abrir"));
    fireEvent.click(screen.getByText("fechar"));

    expect(screen.getByTestId("estado").textContent).toBe("[]");
    expect(window.localStorage.getItem(chaveDoArmazenamento("u1", "org-a"))).toBe("[]");
  });

  it("no celular o chat abre no Inbox, não flutua", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    renderProvedor();
    fireEvent.click(screen.getByText("abrir"));

    expect(push).toHaveBeenCalledWith("/app/inbox?id=conv-1");
    expect(screen.getByTestId("estado").textContent).toBe("[]");
  });
});

describe("a janela", () => {
  function janela(over: Partial<Parameters<typeof JanelaDeChat>[0]> = {}) {
    const props = {
      conversationId: "conv-1",
      minimizado: false,
      negocio: { leadId: "l1", pipelineId: "p1" },
      onAlternarMinimizado: vi.fn(),
      onFechar: vi.fn(),
      ...over,
    };
    render(<JanelaDeChat {...props} />);
    return props;
  }

  it("aberta: cabeçalho com o contato, o fio e o composer do Inbox", () => {
    janela();
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByTestId("fio")).toHaveTextContent("fio conv-1");
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("minimizada: só a barra — sem fio e sem composer", () => {
    janela({ minimizado: true });
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.queryByTestId("fio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
  });

  it("os botões minimizar e fechar chamam quem manda", () => {
    const p = janela();
    fireEvent.click(screen.getByLabelText("Minimizar"));
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(p.onAlternarMinimizado).toHaveBeenCalledTimes(1);
    expect(p.onFechar).toHaveBeenCalledTimes(1);
  });

  it("'Abrir no Inbox' leva à conversa em tela cheia; 'Ver negócio' ao dossiê", () => {
    janela();
    expect(screen.getByLabelText("Abrir no Inbox")).toHaveAttribute("href", "/app/inbox/conv-1");
    expect(screen.getByLabelText("Ver negócio")).toHaveAttribute("href", "/app/pipelines/p1?lead=l1");
  });

  it("sem negócio de origem não oferece 'Ver negócio'", () => {
    janela({ negocio: undefined });
    expect(screen.queryByLabelText("Ver negócio")).not.toBeInTheDocument();
  });

  it("contato bloqueado fecha o composer pela MESMA regra do Inbox", () => {
    conversaFalsa.atual = {
      ...conversaFalsa.atual,
      data: {
        ...conversaFalsa.atual.data!,
        contacts: { ...(conversaFalsa.atual.data!.contacts as object), is_blocked: true },
      },
    };
    janela();
    expect(composerProps.ultimo!.blockedReason).toBe("Contato bloqueado — envio de mensagens desabilitado.");
  });

  it("acompanhamento de suporte em modo leitura não envia", () => {
    usuario.atual = { id: "u1", support: { access_mode: "support_readonly" } };
    janela();
    expect(composerProps.ultimo!.blockedReason).toBe("Acompanhamento somente leitura");
  });
});

describe("a regra de bloqueio extraída do Inbox", () => {
  const t = (s: string) => s;

  it("conversa normal: nada bloqueia", () => {
    expect(
      bloqueioDoEnvio(
        { last_inbound_at: new Date().toISOString(), channel_sessions: { provider: "waha" }, contacts: {} },
        new Date(),
        t,
      ),
    ).toEqual({ motivoDaJanela: null, blockedReason: null });
  });

  it("anonimizado barra tudo", () => {
    expect(bloqueioDoEnvio({ contacts: { is_anonymized: true } }, new Date(), t).blockedReason).toBe(
      "Contato anonimizado — não é possível enviar mensagens.",
    );
  });
});
