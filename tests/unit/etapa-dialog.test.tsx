// O MODAL "+ NOVA ETAPA" / "EDITAR ETAPA" DO QUADRO (Funis no modelo Kommo, Fase B).
//
// As regras são da API; o que se guarda aqui é o que o modal decide sozinho:
// o corpo que ele manda (só o que mudou), o aviso de que marcar o ganho tira de
// outra coluna, a caixa travada da coluna que JÁ é o ganho e a pergunta do
// destino quando a coluna tem cards.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));

import { EtapaDialog } from "@/components/kanban/EtapaDialog";
import { ApiError } from "@/lib/api/types";
import type { Stage } from "@/lib/kanban/types";

const PIPE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const st = (over: Partial<Stage> & { id: string; name: string }) =>
  ({ pipeline_id: PIPE, position: 1, color: null, is_won: false, is_lost: false, ...over }) as Stage;
const stages = [
  st({ id: "en", name: "Etapa de entrada", is_entry: true }),
  st({ id: "e1", name: "Apresentação" }),
  st({ id: "e2", name: "Fechado - ganho", is_won: true }),
  st({ id: "e3", name: "Fechado - perdido", is_lost: true }),
];

function montar(etapa: Stage | null) {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EtapaDialog open onOpenChange={onOpenChange} pipelineId={PIPE} stages={stages} etapa={etapa} />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: {} });
  patch.mockResolvedValue({ data: {} });
  del.mockResolvedValue({ data: {} });
});

describe("criar", () => {
  it("manda nome, cor e o ganho, e avisa que o ganho sai da outra coluna", async () => {
    const onOpenChange = montar(null);
    await userEvent.type(screen.getByTestId("etapa-nome"), "  Negociação ");
    await userEvent.click(screen.getByTestId("etapa-cor-a4c8fa"));
    await userEvent.click(screen.getByTestId("etapa-ganho"));
    expect(screen.getByText(/Marcar esta desmarca «Fechado - ganho»/)).toBeTruthy();
    await userEvent.click(screen.getByTestId("etapa-salvar"));

    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith(`/api/v1/pipelines/${PIPE}/stages`, {
      name: "Negociação",
      color: "#a4c8fa",
      is_won: true,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ganho e perda são exclusivos: marcar um desmarca o outro", async () => {
    montar(null);
    await userEvent.click(screen.getByTestId("etapa-ganho"));
    await userEvent.click(screen.getByTestId("etapa-perda"));
    expect((screen.getByTestId("etapa-ganho") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("etapa-perda") as HTMLInputElement).checked).toBe(true);
  });

  it("sem nome não chama a API", async () => {
    montar(null);
    await userEvent.click(screen.getByTestId("etapa-salvar"));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByTestId("etapa-erro")).toBeTruthy();
  });

  it("a recusa do servidor aparece dentro do modal, que continua aberto", async () => {
    post.mockRejectedValue(new ApiError(422, "unprocessable_entity", undefined, "r", "Já existe uma etapa chamada «Apresentação» neste funil. Escolha outro nome."));
    const onOpenChange = montar(null);
    await userEvent.type(screen.getByTestId("etapa-nome"), "apresentação");
    await userEvent.click(screen.getByTestId("etapa-salvar"));
    expect(await screen.findByText(/Já existe uma etapa chamada/)).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("editar", () => {
  it("só o que mudou viaja", async () => {
    montar(stages[1]!);
    await userEvent.click(screen.getByTestId("etapa-cor-f9d9dc"));
    await userEvent.click(screen.getByTestId("etapa-salvar"));
    await waitFor(() => expect(patch).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledWith(`/api/v1/pipelines/${PIPE}/stages/e1`, { color: "#f9d9dc" });
  });

  it("a coluna que JÁ é o ganho tem a caixa travada — desmarcar sem substituta é recusado", () => {
    montar(stages[2]!);
    const caixa = screen.getByTestId("etapa-ganho") as HTMLInputElement;
    expect(caixa.checked).toBe(true);
    expect(caixa.disabled).toBe(true);
  });

  it("excluir coluna com cards pergunta o destino, sem oferecer ganho nem perda", async () => {
    del.mockRejectedValueOnce(
      new ApiError(422, "unprocessable_entity", { negocios: 2, precisa_destino: true }, "r", "tem 2 negócios"),
    );
    montar(stages[1]!);
    await userEvent.click(screen.getByTestId("etapa-excluir"));
    expect(await screen.findByTestId("etapa-excluir-destino")).toBeTruthy();
    expect(screen.getByText(/tem 2 cards/)).toBeTruthy();
    expect(del).toHaveBeenCalledWith(`/api/v1/pipelines/${PIPE}/stages/e1`);
  });
});
