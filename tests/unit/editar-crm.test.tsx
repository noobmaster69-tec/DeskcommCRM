// "EDITAR CRM" (a tela que faltava para PATCH/DELETE /api/v1/crms/[id]).
// O que a tela decide sozinha: só manda o que mudou, segue o endereço novo,
// não oferece "tornar padrão" ao padrão nem "arquivar" ao padrão.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const patch = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { patch: (...a: unknown[]) => patch(...a), delete: (...a: unknown[]) => del(...a) },
}));

import { EditarCrm } from "@/app/app/crms/_components/EditarCrm";

const PA = { id: "pa-id", name: "PA Advogados", slug: "pa-advogados", description: null, avatar_bg_color: null, is_default: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("editar CRM", () => {
  it("renomear manda só o nome e relê a página", async () => {
    patch.mockResolvedValue({ data: { slug: "pa-advogados" } });
    render(<EditarCrm crm={PA} />);
    await userEvent.click(screen.getByTestId("editar-crm"));
    await userEvent.clear(screen.getByTestId("editar-crm-nome"));
    await userEvent.type(screen.getByTestId("editar-crm-nome"), "PA Advogados Europa");
    await userEvent.click(screen.getByTestId("editar-crm-salvar"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/crms/pa-id", { name: "PA Advogados Europa" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("trocar o endereço leva para a página no endereço novo", async () => {
    patch.mockResolvedValue({ data: { slug: "pa-europa" } });
    render(<EditarCrm crm={PA} />);
    await userEvent.click(screen.getByTestId("editar-crm"));
    await userEvent.clear(screen.getByTestId("editar-crm-slug"));
    await userEvent.type(screen.getByTestId("editar-crm-slug"), "pa-europa");
    await userEvent.click(screen.getByTestId("editar-crm-salvar"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/crms/pa-europa"));
  });

  it("arquivar pede confirmação e volta para a grade", async () => {
    del.mockResolvedValue({ data: {} });
    render(<EditarCrm crm={PA} />);
    await userEvent.click(screen.getByTestId("editar-crm"));
    await userEvent.click(screen.getByTestId("editar-crm-arquivar"));
    expect(del).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("editar-crm-arquivar-sim"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/crms/pa-id"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/crms"));
  });

  it("o CRM padrão não oferece arquivar nem tornar padrão", async () => {
    render(<EditarCrm crm={{ ...PA, is_default: true }} />);
    await userEvent.click(screen.getByTestId("editar-crm"));
    expect(screen.queryByTestId("editar-crm-arquivar")).toBeNull();
    expect(screen.queryByTestId("editar-crm-padrao")).toBeNull();
  });
});
