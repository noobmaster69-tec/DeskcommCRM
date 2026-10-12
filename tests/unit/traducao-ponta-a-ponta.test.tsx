/**
 * TRADUÇÃO DE PONTA A PONTA na tela (fork jhoow): a mensagem do cliente em
 * inglês aparece em português; o atendente responde em português, vê a prévia
 * "Será enviado em inglês" e o envio sai em inglês com o original guardado.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: vi.fn(),
    put: vi.fn(),
  },
  ApiError: class extends Error {},
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({ useSendMessage: () => ({ mutate: enviar, isPending: false }) }));
vi.mock("@/hooks/inbox/useCreateNote", () => ({ useCreateNote: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({ useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({ useMessageTemplates: () => ({ data: [], isLoading: false }) }));

import { Composer } from "@/components/inbox/Composer";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import type { Message } from "@/lib/types/messaging";

get.mockImplementation(async (url: string) =>
  url.endsWith("/idiomas")
    ? {
        // O envelope REAL das rotas v1 — o teste anterior devolvia o miolo e
        // deixou passar exatamente o defeito que derrubou o Inbox.
        data: {
          contato: { locale: "en-US", source: "ddi" },
          meu_idioma: "pt-BR",
          traducao: { entrada: true, saida: true },
          idiomas_diferentes: true,
        },
      }
    : { data: { drafts: [] } },
);
post.mockImplementation(async (url: string, corpo: { texto: string }) =>
  url.endsWith("/traducao-de-saida")
    ? { data: { traducao: corpo.texto === "Sim, ainda está disponível." ? "Yes, it is still available." : "?" } }
    : {},
);

const recebida = {
  id: "m1",
  organization_id: "o1",
  conversation_id: "conv-1",
  channel_session_id: "s1",
  contact_id: "ct1",
  external_id: "x",
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
  sent_at: "2026-10-12T12:00:00.000Z",
  delivered_at: null,
  read_at: null,
  metadata: {},
  edited_at: null,
  content_translated: "Oi! O apartamento ainda está disponível?",
  content_locale: "en-US",
  translated_to: "pt-BR",
  translation_status: "done",
} as Message;

describe("tradução de ponta a ponta", () => {
  it("entrada em inglês aparece em português; resposta em português sai em inglês", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MessageBubble message={recebida} />
        <Composer conversationId="conv-1" />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Oi! O apartamento ainda está disponível?")).toBeInTheDocument();
    expect(screen.getByText(/Traduzido do inglês/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Sim, ainda está disponível." } });
    await waitFor(() => expect(screen.getByTestId("painel-de-traducao")).toHaveTextContent("Será enviado em inglês"));
    await waitFor(() => expect(screen.getByText("Yes, it is still available.")).toBeInTheDocument(), { timeout: 3000 });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar em inglês" }));
    });
    await waitFor(() => expect(enviar).toHaveBeenCalled());
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      conversation_id: "conv-1",
      body: "Yes, it is still available.",
      content_original: "Sim, ainda está disponível.",
      content_locale: "pt-BR",
      translated_to: "en-US",
    });
  });
});
