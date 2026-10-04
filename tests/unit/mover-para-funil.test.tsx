// "MOVER PARA FUNIL" NA CONVERSA (Funis no modelo Kommo, Fase E).
//
// O que a tela decide sozinha: lista os funis do CRM do negócio, mostra as
// etapas com ✓ na atual, move pela rota do arrasto (que agora aceita outro
// funil do mesmo CRM), abre o pedido de motivo na perda do funil atual e não
// deixa perder por outro funil.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/kanban/LoseLeadDialog", () => ({
  LoseLeadDialog: () => <div data-testid="pedido-de-motivo" />,
}));
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));

import { MoverParaFunil } from "@/components/inbox/MoverParaFunil";

const etapa = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, color: null, is_entry: false, is_won: false, is_lost: false, ...over,
});
const funis = [
  {
    id: "social", name: "Social Seller", color: "#a4c8fa", is_primary: true,
    etapas: [etapa("entrada", "Etapa de entrada", { is_entry: true }), etapa("qualif", "Qualificando", { color: "#f9d9dc" }), etapa("perdido-s", "Perdido", { is_lost: true })],
  },
  {
    id: "sdr", name: "SDR", color: null, is_primary: false,
    etapas: [etapa("reuniao", "Reunião agendada"), etapa("perdido-d", "Perdido", { is_lost: true })],
  },
];
const negocio = {
  id: "lead-1", pipeline_id: "social", stage_id: "qualif", updated_at: "2026-10-04T10:00:00Z",
  funil_nome: "Social Seller", etapa_nome: "Qualificando",
};

function montar() {
  const onMovido = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MoverParaFunil negocio={negocio} funis={funis} onMovido={onMovido} />
    </QueryClientProvider>,
  );
  return onMovido;
}

async function abrirFunil(id: string) {
  await userEvent.click(screen.getByTestId("inbox-funil-trigger"));
  await userEvent.click(await screen.findByTestId(`inbox-funil-${id}`));
  return screen.findByTestId(`inbox-etapas-${id}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: {} });
});

describe("mover para funil", () => {
  it("o botão mostra funil e etapa do negócio", () => {
    montar();
    expect(screen.getByTestId("inbox-funil-trigger").textContent).toContain("Social Seller");
    expect(screen.getByTestId("inbox-funil-trigger").textContent).toContain("Qualificando");
  });

  it("as etapas do funil aparecem com ✓ na atual e com a cor da coluna", async () => {
    montar();
    await abrirFunil("social");
    expect(screen.getByTestId("inbox-etapa-qualif").getAttribute("aria-current")).toBe("true");
    expect((screen.getByTestId("inbox-etapa-qualif") as HTMLElement).style.backgroundColor).toBe("rgb(249, 217, 220)");
  });

  it("clicar numa etapa de OUTRO funil do CRM move o card pela rota de mover", async () => {
    const onMovido = montar();
    await abrirFunil("sdr");
    await userEvent.click(screen.getByTestId("inbox-etapa-reuniao"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/leads/lead-1/move", {
        stage_id: "reuniao",
        expected_updated_at: "2026-10-04T10:00:00Z",
      }),
    );
    await waitFor(() => expect(onMovido).toHaveBeenCalled());
  });

  it("a perda do funil ATUAL abre o pedido de motivo, sem mover direto", async () => {
    montar();
    await abrirFunil("social");
    await userEvent.click(screen.getByTestId("inbox-etapa-perdido-s"));
    expect(await screen.findByTestId("pedido-de-motivo")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("a perda de OUTRO funil fica desabilitada", async () => {
    montar();
    await abrirFunil("sdr");
    expect(screen.getByTestId("inbox-etapa-perdido-d").getAttribute("data-disabled")).not.toBeNull();
  });
});
