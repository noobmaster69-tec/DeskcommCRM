/**
 * A tradução na bolha (fork jhoow, Fase B): a mensagem recebida aparece no
 * idioma de quem atende, com "Traduzido do inglês · Ver original"; a que falhou
 * oferece "tentar novamente?", que chama a rota e não o modelo direto.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a), get: vi.fn() } }));

import { MessageBubble } from "@/components/inbox/MessageBubble";
import type { Message } from "@/lib/types/messaging";

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    organization_id: "org1",
    conversation_id: "c1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: "x1",
    type: "text",
    direction: "inbound",
    status: "received",
    ack: null,
    error_code: null,
    error_message: null,
    body: "Hi! Is the apartment still available?",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "crm",
    sent_by_user_id: null,
    sent_at: "2026-10-10T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    ...over,
  } as Message;
}

const pintar = (m: Message) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageBubble message={m} />
    </QueryClientProvider>,
  );

describe("tradução na bolha", () => {
  it("mostra a tradução e alterna com o original", () => {
    pintar(
      msg({
        content_translated: "Oi! O apartamento ainda está disponível?",
        content_locale: "en-US",
        translated_to: "pt-BR",
        translation_status: "done",
      }),
    );
    expect(screen.getByText("Oi! O apartamento ainda está disponível?")).toBeInTheDocument();
    expect(screen.getByTestId("linha-da-traducao")).toHaveTextContent("Traduzido do inglês");
    fireEvent.click(screen.getByRole("button", { name: "Ver original" }));
    expect(screen.getByText("Hi! Is the apartment still available?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver tradução" })).toBeInTheDocument();
  });

  it("sem tradução, a bolha é a de sempre — sem linha", () => {
    pintar(msg({ translation_status: "skipped", content_locale: "pt-BR", body: "Bom dia" }));
    expect(screen.getByText("Bom dia")).toBeInTheDocument();
    expect(screen.queryByTestId("linha-da-traducao")).toBeNull();
  });

  it("falhou: mostra o original e o 'tentar novamente?' chama a rota", async () => {
    post.mockResolvedValueOnce({ desfecho: "traduzida" });
    pintar(msg({ translation_status: "failed", content_locale: "en-US", translated_to: "pt-BR" }));
    expect(screen.getByText("Hi! Is the apartment still available?")).toBeInTheDocument();
    expect(screen.getByTestId("traducao-falhou")).toHaveTextContent("Tradução indisponível");
    fireEvent.click(screen.getByRole("button", { name: "tentar novamente?" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/messages/m1/traducao", {}));
  });
});
