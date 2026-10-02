/**
 * O CARD DO FUNIL COMPACTO, NO ESTILO LEONA (~80px).
 *
 * Pedido do dono do produto (fork jhoow): avatar à esquerda (foto do WhatsApp
 * ou iniciais num círculo colorido), nome em cima e telefone embaixo, hora no
 * canto, a última mensagem em 2 linhas e, com mensagem não lida, nome em
 * negrito + badge vermelho com o número. Saíram do card o atalho "Abrir no
 * Inbox" (o clique já abre o chat), o dono e o tempo na etapa.
 *
 * Os dados saem do que o quadro já lê (`anexarDadosDoContato`), sem consulta
 * nova — o lado dos dados é o segundo bloco deste arquivo.
 */
import { render, screen } from "@testing-library/react";
import { ptBR } from "date-fns/locale";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@hello-pangea/dnd", () => ({
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => ptBR }));
// O Radix só monta a <img> depois do `load`, que o jsdom nunca dispara: sem
// este duplo, "a foto está no card" seria impossível de observar aqui.
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <span data-testid="avatar">{children}</span>,
  // eslint-disable-next-line @next/next/no-img-element -- duplo de teste, não página
  AvatarImage: ({ src }: { src: string }) => <img data-testid="foto" src={src} alt="" />,
  AvatarFallback: ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
    <span data-testid="iniciais" style={style}>
      {children}
    </span>
  ),
}));
vi.mock("@/components/kanban/KanbanCardActions", () => ({ KanbanCardActions: () => null }));

import { KanbanCard } from "@/components/kanban/KanbanCard";
import { anexarDadosDoContato } from "@/lib/kanban/dados-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { buildCardInput } from "@/lib/kanban/card-state";
import type { Lead } from "@/lib/types/leads";

/** Hoje, às 14:32 locais — a hora que a lista do Inbox escreveria como `14:32`. */
function hojeAs1432(): string {
  const d = new Date();
  d.setHours(14, 32, 0, 0);
  return d.toISOString();
}

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
    contact_whatsapp_name: "Maria Silva",
    conversa: {
      id: "conv-1",
      preview: "Oi! Quanto custa o retrato em tela?",
      last_message_at: hojeAs1432(),
      unread: 3,
    },
    ...over,
  } as Lead;
}

function renderCard(l: Lead) {
  const card = buildCardInput(l, { stageName: "Novo", ownerNames: new Map<string, string | null>() });
  return render(<KanbanCard card={card} lead={l} index={0} pipelineId="p1" />);
}

describe("o card compacto estilo Leona", () => {
  it("nome em cima, telefone embaixo, hora no canto e a última mensagem", () => {
    renderCard(lead({ contact_phone: "+5511999998888" }));

    expect(screen.getByRole("button", { name: "Maria Silva" })).toBeInTheDocument();
    expect(screen.getByText(phoneForDisplay("+5511999998888"))).toBeInTheDocument();
    expect(screen.getByText("14:32")).toBeInTheDocument();
    const mensagem = screen.getByText("Oi! Quanto custa o retrato em tela?");
    expect(mensagem.className, "a prévia ocupa 2 linhas reservadas").toContain("line-clamp-2");
  });

  it("⭐ com não lidas: nome em negrito e o NÚMERO num badge vermelho", () => {
    renderCard(lead());

    expect(screen.getByRole("button", { name: "Maria Silva" }).className).toContain("font-semibold");
    const badge = screen.getByLabelText("3 sem ler");
    expect(badge).toHaveTextContent("3");
    expect(badge.className).toContain("bg-destructive");
  });

  it("sem não lidas: nome normal e nenhum badge", () => {
    renderCard(lead({ conversa: { id: "conv-1", preview: "ok", last_message_at: hojeAs1432(), unread: 0 } }));

    expect(screen.getByRole("button", { name: "Maria Silva" }).className).not.toContain("font-semibold");
    expect(screen.queryByLabelText(/sem ler/)).not.toBeInTheDocument();
  });

  it("muitas não lidas não estouram o badge", () => {
    renderCard(lead({ conversa: { id: "conv-1", preview: "ok", last_message_at: hojeAs1432(), unread: 250 } }));

    expect(screen.getByLabelText("250 sem ler")).toHaveTextContent("99+");
  });

  it("⭐ saíram do card: 'Abrir no Inbox', o dono e o tempo na etapa", () => {
    renderCard(lead());

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Abrir no Inbox/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem responsável/)).not.toBeInTheDocument();
    expect(screen.queryByText(/em Novo/)).not.toBeInTheDocument();
  });

  it("o valor aparece pequeno quando existe, e nenhum '—' quando não", () => {
    const { unmount } = renderCard(lead({ value_cents: 150000 }));
    expect(screen.getByText(/1\.500/)).toBeInTheDocument();
    unmount();

    renderCard(lead());
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("com foto, a imagem sai da MESMA rota do Inbox", () => {
    renderCard(lead({ contact_has_avatar: true }));

    expect(screen.getByTestId("foto")).toHaveAttribute("src", "/api/v1/contacts/c1/avatar");
  });

  it("⭐ sem foto: iniciais num círculo colorido, a MESMA cor para o mesmo contato", () => {
    const { unmount } = renderCard(lead());
    const primeira = screen.getByTestId("iniciais");
    expect(primeira).toHaveTextContent("MS");
    const cor = primeira.style.backgroundColor;
    expect(cor, "o círculo tem cor").not.toBe("");
    unmount();

    renderCard(lead({ title: "Outro título" }));
    expect(screen.getByTestId("iniciais").style.backgroundColor).toBe(cor);
  });

  it("negócio renomeado sem conversa mostra o título na linha de baixo", () => {
    renderCard(lead({ conversa: null, title: "Retrato casal" }));

    expect(screen.getByRole("button", { name: "Maria Silva" })).toBeInTheDocument();
    expect(screen.getByText("Retrato casal")).toBeInTheDocument();
  });

  it("negócio sem contato nem conversa (criado à mão) usa o título como nome", () => {
    renderCard(lead({ contact_id: null, conversa: null, contact_whatsapp_name: undefined, title: "Proposta ACME" }));

    expect(screen.getByRole("button", { name: "Proposta ACME" })).toBeInTheDocument();
    expect(screen.queryByTestId("foto")).not.toBeInTheDocument();
    expect(screen.getByTestId("iniciais")).toHaveTextContent("PA");
  });
});

describe("os dados do topo do card vêm do contato", () => {
  const linha = {
    id: "c1",
    phone_number: "5531999990000",
    email: null,
    custom_fields: null,
    is_anonymized: false,
  };

  it("o pushName vira o nome do WhatsApp e a foto vira um sinal — nunca o caminho", () => {
    const [l] = anexarDadosDoContato([lead({ contact_whatsapp_name: undefined })], [
      { ...linha, display_name: "Maria Silva", avatar_storage_path: "org/c1/foto.jpg" },
    ]);

    expect(l!.contact_whatsapp_name).toBe("Maria Silva");
    expect(l!.contact_has_avatar).toBe(true);
    expect(JSON.stringify(l), "o caminho do storage não vai ao navegador").not.toContain("foto.jpg");
  });

  it("identificador técnico não vira nome", () => {
    const [l] = anexarDadosDoContato([lead({ contact_whatsapp_name: undefined })], [
      { ...linha, display_name: "543134@lid", avatar_storage_path: null },
    ]);

    expect(l!.contact_whatsapp_name).toBeUndefined();
    expect(l!.contact_has_avatar).toBeUndefined();
  });

  it("contato anonimizado (LGPD) não leva nome nem foto ao card", () => {
    const [l] = anexarDadosDoContato([lead({ contact_whatsapp_name: undefined })], [
      { ...linha, is_anonymized: true, display_name: "Maria Silva", avatar_storage_path: "org/c1/foto.jpg" },
    ]);

    expect(l!.contact_whatsapp_name).toBeUndefined();
    expect(l!.contact_has_avatar).toBeUndefined();
  });
});
