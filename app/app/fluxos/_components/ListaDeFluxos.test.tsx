import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ListaDeFluxos, type FluxoDaLista } from "./ListaDeFluxos";

const fluxo = (id: string, nome: string, pasta_id: string | null, extra: Partial<FluxoDaLista> = {}): FluxoDaLista => ({
  id,
  nome,
  status: "draft",
  pasta_id,
  blocos: 1,
  atualizado_em: "2026-10-04T10:00:00.000Z",
  publicado: false,
  arquivado: false,
  ...extra,
});

const pastas = [{ id: "p1", nome: "Vendas", parent_id: null, posicao: 0 }];
const fluxos = [fluxo("a", "Boas-vindas", "p1"), fluxo("b", "Pós-venda", null), fluxo("c", "Antigo", null, { arquivado: true })];

describe("lista de Fluxos — arrastar para pasta (item 1)", () => {
  it("cada linha é arrastável e cada pasta é alvo", () => {
    render(<ListaDeFluxos fluxos={fluxos} pastas={pastas} />);
    expect(screen.getByTestId("linha-fluxo-a")).toHaveAttribute("aria-roledescription", "draggable");
    const nav = screen.getByRole("navigation", { name: "Pastas" });
    expect(nav.querySelector('[data-alvo="todos"]')).not.toBeNull();
    expect(nav.querySelector('[data-alvo="pasta:p1"]')).not.toBeNull();
    expect(nav.querySelector('[data-alvo="sem-pasta"]')).not.toBeNull();
  });

  it("'Sem pasta' filtra os fluxos fora de pasta (arquivado não conta)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ListaDeFluxos fluxos={fluxos} pastas={pastas} />);
    const nav = screen.getByRole("navigation", { name: "Pastas" });
    const semPasta = nav.querySelector('[data-alvo="sem-pasta"]') as HTMLElement;
    expect(within(semPasta).getByText("1")).toBeInTheDocument();
    await user.click(semPasta);
    expect(screen.getByText("Pós-venda")).toBeInTheDocument();
    expect(screen.queryByText("Boas-vindas")).toBeNull();
  });
});
