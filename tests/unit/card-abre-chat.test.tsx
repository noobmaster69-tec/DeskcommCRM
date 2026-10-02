/**
 * O CLIQUE NO CARD DO FUNIL ABRE O CHAT — e o dossiê ganha outra porta.
 *
 * Decisão do dono do produto: com conversa, o card abre o chat flutuante; o
 * dossiê do negócio vai para o "Ver negócio" do menu ⋮. Negócio sem conversa
 * (criado à mão) segue abrindo o dossiê, e os gestos de seleção (ctrl/shift)
 * não mudam.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ptBR } from "date-fns/locale";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@hello-pangea/dnd", () => ({
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => ptBR }));
vi.mock("@/components/kanban/ContatoNoCard", () => ({ ContatoNoCard: () => null }));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
// O menu de verdade puxa permissões e mutações; aqui só importa SE ele recebe
// a porta do dossiê e o que ela faz.
vi.mock("@/components/kanban/KanbanCardActions", () => ({
  KanbanCardActions: ({ onVerNegocio }: { onVerNegocio?: () => void }) =>
    onVerNegocio ? <button onClick={onVerNegocio}>Ver negócio</button> : null,
}));

import { KanbanCard } from "@/components/kanban/KanbanCard";
import { ChatsFlutuantesProvider, useChatsFlutuantes } from "@/hooks/chat-flutuante/ChatsFlutuantesProvider";
import { buildCardInput } from "@/lib/kanban/card-state";
import type { Lead } from "@/lib/types/leads";

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    organization_id: "org",
    pipeline_id: "p1",
    stage_id: "s1",
    contact_id: "c1",
    title: "Maria Silva",
    description: null,
    value_cents: null,
    currency: "BRL",
    status: "open",
    lost_reason: null,
    position_in_stage: 1,
    owner_kind: "user",
    owner_user_id: "u1",
    owner_agent_id: null,
    assigned_at: null,
    last_activity_at: "2026-07-25T10:00:00Z",
    created_at: "2026-07-20T10:00:00Z",
    updated_at: "2026-07-25T10:00:00Z",
    tags: [],
    custom_fields: {},
    conversa: { id: "conv-9", preview: "Oi!", last_message_at: null, unread: 0 },
    ...over,
  } as Lead;
}

function Estado() {
  return <output data-testid="chats">{JSON.stringify(useChatsFlutuantes()!.chats)}</output>;
}

function renderCard(l: Lead, onOpen = vi.fn(), onSelect = vi.fn()) {
  const card = buildCardInput(l, { stageName: "Novo", ownerNames: new Map<string, string | null>() });
  render(
    <ChatsFlutuantesProvider userId="u1" orgId="org">
      <KanbanCard card={card} lead={l} index={0} pipelineId="p1" onOpen={onOpen} onSelect={onSelect} />
      <Estado />
    </ChatsFlutuantesProvider>,
  );
  return { onOpen, onSelect };
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

describe("o clique no card", () => {
  it("com conversa abre o CHAT, levando o negócio de origem — e não o dossiê", () => {
    const { onOpen } = renderCard(lead());
    fireEvent.click(screen.getByRole("group"));

    expect(JSON.parse(screen.getByTestId("chats").textContent!)).toEqual([
      { conversationId: "conv-9", minimizado: false, negocio: { leadId: "l1", pipelineId: "p1" } },
    ]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("o clique no TEXTO do card (o botão) faz o mesmo que o corpo", () => {
    const { onOpen } = renderCard(lead());
    fireEvent.click(screen.getByText("Oi!"));

    expect(screen.getByTestId("chats").textContent).toContain("conv-9");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("sem conversa segue abrindo o dossiê", () => {
    const { onOpen } = renderCard(lead({ conversa: null }));
    fireEvent.click(screen.getByRole("group"));

    expect(onOpen).toHaveBeenCalledWith("l1");
    expect(screen.getByTestId("chats").textContent).toBe("[]");
  });

  it("ctrl+clique continua SELECIONANDO, sem abrir chat", () => {
    const { onSelect } = renderCard(lead());
    fireEvent.click(screen.getByRole("group"), { ctrlKey: true });

    expect(onSelect).toHaveBeenCalledWith("l1", "alterna");
    expect(screen.getByTestId("chats").textContent).toBe("[]");
  });

  it("'Ver negócio' do menu abre o dossiê", () => {
    const { onOpen } = renderCard(lead());
    fireEvent.click(screen.getByText("Ver negócio"));

    expect(onOpen).toHaveBeenCalledWith("l1");
  });
});
