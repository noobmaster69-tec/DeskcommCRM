import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

/**
 * O composer COMPACTO do Inbox (fork jhoow): a caixa "Assistência do agente"
 * virou uma linha de pílulas (Sugerir resposta · Resumir · / Respostas
 * rápidas), as abas Responder/Nota interna viraram o menu "Responder ▼", e o
 * campo cresce como o do WhatsApp — 1 linha até 4, depois rola.
 */

vi.mock("@/hooks/inbox/useSendMessage", () => ({ useSendMessage: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useCreateNote", () => ({ useCreateNote: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({ useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({
    data: [{ id: "t1", shortcut: "ola", title: "Saudação", body: "Olá! Como posso ajudar?" }],
    isLoading: false,
  }),
}));

import { Composer } from "@/components/inbox/Composer";
import { alturaDoCampo, ALTURA_MAXIMA_PX, ALTURA_MINIMA_PX } from "@/lib/inbox/altura-do-campo";

function renderComposer() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

describe("composer compacto", () => {
  it("as ações rápidas ficam numa linha de chips — sem a caixa 'Assistência do agente'", () => {
    renderComposer();
    const linha = screen.getByTestId("acoes-rapidas");
    const rotulos = [...linha.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") ?? b.textContent?.replace(/\s+/g, " ").trim(),
    );
    // "Respostas rápidas" saiu dos chips e foi para dentro do campo (o "/").
    expect(rotulos).toEqual(["Sugerir resposta", "Resumir"]);
    expect(linha.className).toMatch(/flex-nowrap/);
    expect(linha.querySelector("button")?.textContent?.trim()).toBe("Sugerir resposta");
    expect(screen.queryByText("Assistência do agente")).toBeNull();
    expect(screen.queryByTestId("sugestao-do-agente")).toBeNull();
  });

  it("placeholder novo e o alternador Responder | Nota troca para nota", () => {
    renderComposer();
    expect(screen.getByPlaceholderText("Escreva uma mensagem ou digite / para atalhos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^nota interna$/i })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^nota$/i }));
    expect(
      screen.getByPlaceholderText("Nota interna — só a equipe vê. Use @ para mencionar."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^nota$/i })).toHaveAttribute("aria-checked", "true");
  });

  it("Cmd/Ctrl+Shift+N alterna Responder e Nota", () => {
    renderComposer();
    fireEvent.keyDown(window, { key: "N", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("radio", { name: /^nota$/i })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(window, { key: "n", metaKey: true, shiftKey: true });
    expect(screen.getByRole("radio", { name: /^responder$/i })).toHaveAttribute("aria-checked", "true");
  });

  it("em nota não há sugestão (só o que serve à equipe)", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("radio", { name: /^nota$/i }));
    // Em nota não há sugestão nem resposta rápida (só o que serve à equipe).
    expect(screen.queryByRole("button", { name: /sugerir resposta/i })).toBeNull();
    expect(screen.getByTestId("acao-resumir")).toBeInTheDocument();
  });

  it("'/ Respostas rápidas' abre a lista de respostas sem apagar o texto", () => {
    renderComposer();
    const campo = screen.getByLabelText("Mensagem");
    fireEvent.change(campo, { target: { value: "rascunho meu" } });
    fireEvent.click(screen.getByRole("button", { name: /respostas rápidas/i }));
    expect(screen.getByText("Saudação")).toBeInTheDocument();
    expect(campo).toHaveValue("rascunho meu");
  });

  it("o campo nasce com 1 linha e cresce até 6; da 7ª em diante rola", () => {
    expect(ALTURA_MINIMA_PX).toBe(40);
    expect(ALTURA_MAXIMA_PX).toBe(140);
    expect(alturaDoCampo(20)).toEqual({ altura: 40, rola: false });
    expect(alturaDoCampo(80)).toEqual({ altura: 80, rola: false });
    expect(alturaDoCampo(140)).toEqual({ altura: 140, rola: false });
    expect(alturaDoCampo(160)).toEqual({ altura: 140, rola: true });
  });
});
