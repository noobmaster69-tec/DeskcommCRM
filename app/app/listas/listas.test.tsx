import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/campanhas/useListas", () => ({
  useListas: () => ({
    isLoading: false,
    data: [
      { id: "l1", nome: "Advogados Lisboa", contatos: 9, criada_em: "2026-10-06T12:00:00Z", campanha: { id: "c1", nome: "Primeiro Teste" }, arquivo: "lisboa.xlsx", contagens: null },
      { id: "l2", nome: "Dentistas Porto", contatos: 30, criada_em: "2026-10-07T12:00:00Z", campanha: null, arquivo: null, contagens: null },
    ],
  }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

import { ListasClient } from "./_client";

/** Operações › Listas (fork jhoow, 9021). */
describe("aba Listas", () => {
  it("mostra as listas — inclusive a que nasceu dentro de uma campanha", () => {
    render(<ListasClient />);
    expect(screen.getByText("Advogados Lisboa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Primeiro Teste" })).toHaveAttribute("href", "/app/campaigns/c1");
    expect(screen.getByText("Dentistas Porto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova lista" })).toBeInTheDocument();
  });
});
