/**
 * O CARD DO FUNIL NO ESTILO KOMMO — foto, quem (pequeno) e o que disse (grande).
 *
 * Pedido do dono do produto ao ver o funil com conversas reais: o card mostrava
 * só o título do negócio, e para saber o que o cliente tinha dito era preciso
 * abrir o Inbox. Agora o topo do card é a foto do WhatsApp (a mesma do Inbox),
 * o nome que a pessoa pôs no próprio perfil, a hora e a última mensagem em
 * destaque. O título do negócio só aparece quando difere do nome.
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
  AvatarFallback: ({ children }: { children: ReactNode }) => <span data-testid="iniciais">{children}</span>,
}));
vi.mock("@/components/kanban/KanbanCardActions", () => ({ KanbanCardActions: () => null }));
vi.mock("@/components/kanban/ContatoNoCard", () => ({ ContatoNoCard: () => null }));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));

import { KanbanCard } from "@/components/kanban/KanbanCard";
import { anexarDadosDoContato } from "@/lib/kanban/dados-do-contato";
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

describe("o card estilo Kommo", () => {
  it("a última mensagem é o texto grande; o nome e a hora ficam na linha pequena", () => {
    renderCard(lead());

    const mensagem = screen.getByText("Oi! Quanto custa o retrato em tela?");
    expect(mensagem.className, "a mensagem é o destaque do card").toContain("font-medium");
    expect(screen.getByText("Maria Silva").className).toContain("truncate");
    expect(screen.getByText("14:32")).toBeInTheDocument();
  });

  it("título igual ao nome NÃO se repete na linha pequena", () => {
    renderCard(lead());

    expect(screen.queryByText(/Maria Silva · /)).not.toBeInTheDocument();
  });

  it("negócio renomeado mostra 'nome · título'", () => {
    renderCard(lead({ title: "Retrato casal" }));

    expect(screen.getByText("Maria Silva · Retrato casal")).toBeInTheDocument();
  });

  it("com foto, a imagem sai da MESMA rota do Inbox", () => {
    renderCard(lead({ contact_has_avatar: true }));

    expect(screen.getByTestId("foto")).toHaveAttribute("src", "/api/v1/contacts/c1/avatar");
  });

  it("sem foto não pede a rota (seria 404) e mostra as iniciais", () => {
    renderCard(lead());

    expect(screen.queryByTestId("foto")).not.toBeInTheDocument();
    expect(screen.getByTestId("iniciais")).toHaveTextContent("MS");
  });

  it("a linha do atalho não repete a mensagem — vira 'Abrir no Inbox' com as não lidas", () => {
    renderCard(lead());

    expect(screen.getAllByText("Oi! Quanto custa o retrato em tela?")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveTextContent("Abrir no Inbox");
    expect(screen.getByLabelText("3 sem ler")).toHaveTextContent("3");
  });

  it("negócio sem conversa (criado à mão) segue com o título em destaque", () => {
    renderCard(lead({ conversa: null, contact_whatsapp_name: undefined, title: "Proposta ACME" }));

    expect(screen.getByText("Proposta ACME").className).toContain("font-medium");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("negócio sem contato não desenha foto", () => {
    renderCard(lead({ contact_id: null, conversa: null }));

    expect(screen.queryByTestId("avatar")).not.toBeInTheDocument();
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
