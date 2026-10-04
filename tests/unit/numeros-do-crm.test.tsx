// "NÚMEROS DE WHATSAPP" DENTRO DO CRM (Funis no modelo Kommo, Fase D).
//
// O que a tela decide sozinha: mostrar TODOS os números com o CRM de cada um,
// dizer "sem vínculo (CRM padrão)" quando não há, e mandar no PUT só o CRM
// escolhido — sugerindo o CRM da página para o número ainda solto.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const put = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { put: (...a: unknown[]) => put(...a) } }));

import { NumerosDoCrm } from "@/components/crms/NumerosDoCrm";

const APEX = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const PA = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const crms = [
  { id: APEX, name: "Apex", is_default: true },
  { id: PA, name: "PA Advogados", is_default: false },
];
const numeros = [
  { id: "n1", nome: "Vendas", telefone: "5511961170212", status: "WORKING", crm: null },
  { id: "n2", nome: null, telefone: "5511900000000", status: "FAILED", crm: { id: APEX, name: "Apex" } },
];

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NumerosDoCrm crmId={PA} numeros={numeros} crms={crms} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue({ data: {} });
});

describe("números de WhatsApp no CRM", () => {
  it("lista todos os números com o CRM de cada um, e diz para onde vai o número solto", () => {
    montar();
    expect(screen.getByTestId("vinculo-n1").textContent).toBe("Sem vínculo (CRM padrão)");
    expect(screen.getByTestId("vinculo-n2").textContent).toBe("Apex");
    expect(screen.getByTestId("numero-n1").textContent).toContain("+5511961170212");
    expect(screen.getByTestId("numero-n1").textContent).toContain("Conectado");
    expect(screen.getByTestId("numeros-do-crm").textContent).toContain("(Apex).");
  });

  it("número solto aberto na página da PA já vem com a PA escolhida e manda só o crm_id", async () => {
    montar();
    await userEvent.click(screen.getByTestId("vincular-n1"));
    await userEvent.click(await screen.findByTestId("vinculo-salvar"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/channel-sessions/n1/crm", { crm_id: PA }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("número já vinculado abre com o CRM dele, não com o da página", async () => {
    montar();
    await userEvent.click(screen.getByTestId("vincular-n2"));
    await userEvent.click(await screen.findByTestId("vinculo-salvar"));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/channel-sessions/n2/crm", { crm_id: APEX }));
  });
});
