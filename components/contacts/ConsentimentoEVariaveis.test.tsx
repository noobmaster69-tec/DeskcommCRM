import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const patch = vi.fn(async () => ({}));
vi.mock("@/lib/api/client", () => ({ apiClient: { patch: (...a: unknown[]) => patch(...(a as [])) } }));

import { ConsentimentoDeCampanhas } from "./ConsentimentoEVariaveis";

function tela(consent: Record<string, unknown> | null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConsentimentoDeCampanhas contactId="c1" consent={consent} podeEditar />
    </QueryClientProvider>,
  );
}

describe("consentimento no perfil do contato (item 6)", () => {
  it("sem registro: avisa que campanha com consentimento não fala com ele, e registra", async () => {
    tela({});
    expect(screen.getByTestId("estado-do-consentimento")).toHaveTextContent("Sem consentimento registrado");
    fireEvent.click(screen.getByTestId("registrar-consentimento"));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [url, corpo] = patch.mock.calls[0] as unknown as [string, { consent: { marketing: { granted_at: string; source: string } } }];
    expect(url).toBe("/api/v1/contacts/c1");
    expect(corpo.consent.marketing.granted_at).toMatch(/^\d{4}-/);
    expect(corpo.consent.marketing.source).toBe("tela");
  });

  it("com consentimento: mostra a data e oferece retirar", () => {
    tela({ marketing: { granted_at: "2026-10-01T10:00:00Z" } });
    expect(screen.getByTestId("estado-do-consentimento")).toHaveTextContent("Consentiu em");
    expect(screen.getByTestId("retirar-consentimento")).toBeInTheDocument();
  });
});
