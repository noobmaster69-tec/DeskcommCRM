// O TOPO DO QUADRO NO FORMATO DO KOMMO (Funis no modelo Kommo, Fase C):
// o seletor de funis do CRM, "+ Adicionar funil" e "Gerenciar funis".
//
// As regras são da API (funil principal fixo, excluir só o funil limpo); o que
// se guarda aqui é o que a tela decide sozinha: quem vê os botões de gestão, o
// corpo que cada modal manda e o que ela NÃO oferece no funil principal.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
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

import { GerenciarFunisDialog } from "@/components/kanban/GerenciarFunisDialog";
import { NovoFunilDialog } from "@/components/kanban/NovoFunilDialog";
import { SeletorDeFunil } from "@/components/kanban/SeletorDeFunil";
import { ApiError } from "@/lib/api/types";

const CRM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const funis = [
  { id: "f1", name: "Social Seller", color: "#a4c8fa", is_primary: true },
  { id: "f2", name: "SDR", color: null, is_primary: false },
];

const comQuery = (ui: ReactNode) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { pipelines: [] } });
  patch.mockResolvedValue({ data: {} });
  del.mockResolvedValue({ data: {} });
});

describe("seletor de funil", () => {
  it("o nome do funil aberto é o título da página", () => {
    render(comQuery(<SeletorDeFunil pipelineId="f1" nomeAtual="Social Seller" crmId={CRM} funis={funis} podeGerenciar={false} />));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Social Seller");
  });

  it("quem não é manager não vê o botão de gerenciar", () => {
    render(comQuery(<SeletorDeFunil pipelineId="f1" nomeAtual="Social Seller" crmId={CRM} funis={funis} podeGerenciar={false} />));
    expect(screen.queryByTestId("gerenciar-funis")).toBeNull();
  });

  it("manager abre a lista: os funis do CRM, o atual marcado, o principal com selo e o «Adicionar funil»", async () => {
    render(comQuery(<SeletorDeFunil pipelineId="f2" nomeAtual="SDR" crmId={CRM} funis={funis} podeGerenciar />));
    await userEvent.click(screen.getByTestId("seletor-de-funil"));
    const lista = await screen.findByTestId("lista-de-funis");
    expect(screen.getByTestId("funil-f1").getAttribute("href")).toBe("/app/pipelines/f1");
    expect(screen.getByTestId("funil-f2").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("funil-f1").textContent).toContain("Principal");
    expect(lista.textContent).toContain("Adicionar funil");
  });
});

describe("novo funil", () => {
  it("cria no MESMO CRM, com a cor, e abre o quadro do funil criado", async () => {
    post.mockResolvedValue({ data: { pipelines: [{ id: "novo-id", name: "Vendedor", crm_id: CRM }] } });
    render(comQuery(<NovoFunilDialog open onOpenChange={() => {}} crmId={CRM} />));
    await userEvent.type(screen.getByTestId("funil-nome"), " Vendedor ");
    await userEvent.click(screen.getByTestId("funil-cor-a3efc5"));
    await userEvent.click(screen.getByTestId("funil-salvar"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/pipelines", { name: "Vendedor", crm_id: CRM, color: "#a3efc5" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/pipelines/novo-id"));
  });

  it("a recusa do servidor aparece no modal", async () => {
    post.mockRejectedValue(new ApiError(422, "unprocessable_entity", undefined, "r", "Já existe um funil chamado «SDR». Escolha outro nome."));
    render(comQuery(<NovoFunilDialog open onOpenChange={() => {}} crmId={CRM} />));
    await userEvent.type(screen.getByTestId("funil-nome"), "SDR");
    await userEvent.click(screen.getByTestId("funil-salvar"));
    expect(await screen.findByTestId("funil-erro")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("gerenciar funis", () => {
  const montar = () =>
    render(comQuery(<GerenciarFunisDialog open onOpenChange={() => {}} funis={funis} pipelineAtualId="f1" />));

  it("o principal não oferece arquivar nem excluir; o adicional oferece", () => {
    montar();
    expect(screen.queryByTestId("arquivar-funil-f1")).toBeNull();
    expect(screen.queryByTestId("excluir-funil-f1")).toBeNull();
    expect(screen.getByTestId("arquivar-funil-f2")).toBeTruthy();
    expect(screen.getByTestId("excluir-funil-f2")).toBeTruthy();
  });

  it("renomear manda só o nome, e a página relê os funis", async () => {
    montar();
    const campos = screen.getAllByTestId("nome-do-funil") as HTMLInputElement[];
    await userEvent.clear(campos[1]!);
    await userEvent.type(campos[1]!, "Pré-vendas{Enter}");
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/pipelines/f2", { name: "Pré-vendas" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("subir o segundo o põe no topo (depois_de null)", async () => {
    montar();
    await userEvent.click(screen.getByTestId("subir-funil-f2"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/pipelines/f2", { depois_de: null }));
  });

  it("excluir pede confirmação antes, e só então chama ?definitivo=1", async () => {
    montar();
    await userEvent.click(screen.getByTestId("excluir-funil-f2"));
    expect(del).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("confirmar-excluir-funil-f2"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/pipelines/f2?definitivo=1"));
  });

  it("a recusa da API aparece na linha do funil", async () => {
    del.mockRejectedValue(new ApiError(422, "unprocessable_entity", undefined, "r", "«SDR» tem 3 negócios. Arquive em vez de excluir."));
    montar();
    await userEvent.click(screen.getByTestId("excluir-funil-f2"));
    await userEvent.click(screen.getByTestId("confirmar-excluir-funil-f2"));
    expect((await screen.findByTestId("erro-funil-f2")).textContent).toContain("Arquive em vez de excluir");
  });
});
