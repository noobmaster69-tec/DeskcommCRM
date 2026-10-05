import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { MenuDoFluxo, type FluxoDoMenu } from "./MenuDoFluxo";

const base: FluxoDoMenu = { id: "f1", nome: "Boas-vindas", status: "active", publicado: true, arquivado: false };

async function abrir(fluxo: FluxoDoMenu) {
  const user = userEvent.setup({ delay: null });
  render(<MenuDoFluxo fluxo={fluxo} />);
  await user.click(screen.getByTestId(`menu-fluxo-${fluxo.id}`));
  return user;
}

describe("menu ⋯ da linha do fluxo (item 2)", () => {
  it("lista as ações na ordem do Leona, com Excluir por último", async () => {
    await abrir(base);
    const itens = screen.getAllByRole("menuitem").map((i) => i.textContent?.trim());
    expect(itens).toEqual(["Editar nome", "Duplicar", "Compartilhar", "Traduzir", "Desativar", "Arquivar", "Excluir"]);
  });

  it("pausado com versão publicada oferece Reativar; rascunho não", async () => {
    await abrir({ ...base, status: "disabled" });
    expect(screen.getByRole("menuitem", { name: /Reativar/ })).toBeInTheDocument();
  });

  it("rascunho não oferece Reativar nem Desativar", async () => {
    await abrir({ ...base, status: "draft", publicado: false });
    expect(screen.queryByRole("menuitem", { name: /Reativar|Desativar/ })).toBeNull();
  });

  it("arquivado oferece Desarquivar", async () => {
    await abrir({ ...base, status: "disabled", arquivado: true });
    expect(screen.getByRole("menuitem", { name: /Desarquivar/ })).toBeInTheDocument();
  });

  it("Excluir pede confirmação antes", async () => {
    const user = await abrir(base);
    await user.click(screen.getByTestId("menu-fluxo-excluir-f1"));
    expect(screen.getByText("Tem certeza? Esta ação não pode ser desfeita.")).toBeInTheDocument();
  });

  it("Traduzir abre a escolha entre English, Español e Português", async () => {
    const user = await abrir(base);
    await user.click(screen.getByRole("menuitem", { name: /Traduzir/ }));
    expect(screen.getByTestId("traduzir-idioma-en")).toHaveTextContent("English");
    expect(screen.getByTestId("traduzir-idioma-es")).toHaveTextContent("Español");
    expect(screen.getByTestId("traduzir-idioma-pt")).toHaveTextContent("Português");
  });
});
