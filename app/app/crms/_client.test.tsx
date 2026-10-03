/**
 * A grade de CRMs e o modal "+ Novo CRM" (fork jhoow, Fase B).
 *
 * O que só a tela responde: o card mostra o que a função de métricas devolveu
 * (número, padrão, endereço, rodapé), leva ao CRM pelo SLUG, a nota de
 * "Clientes pela agenda" segue a regra da organização, e o modal manda o corpo
 * que a rota espera — com o endereço acompanhando o nome até a pessoa mexer nele.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrmsClient, type CrmDoCard } from "./_client";

let ligada = false;
const post = vi.fn();
const refresh = vi.fn();

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ orgId: "org-1", name: "Apex", role: "admin", cliente_pela_agenda: ligada }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));
vi.mock("./_components/ImportarLeads", () => ({
  ImportarLeads: ({ funis }: { funis: Array<{ name: string }> }) => (
    <button type="button" data-testid="abrir-importar-leads">
      {funis.map((f) => f.name).join(" | ")}
    </button>
  ),
}));

const PADRAO: CrmDoCard = {
  id: "c-1",
  name: "PADRÃO",
  slug: "pedidos",
  is_default: true,
  avatar_bg_color: null,
  initials: "PA",
  leads_count: 12480,
  funis_count: 3,
  last_updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
};
const GIRLY: CrmDoCard = {
  id: "c-2",
  name: "Clientes Girly",
  slug: "clientes-girly",
  is_default: false,
  avatar_bg_color: "#ec4899",
  initials: "CG",
  leads_count: 0,
  funis_count: 1,
  last_updated_at: null,
};

function tela(over: Partial<Parameters<typeof CrmsClient>[0]> = {}) {
  return render(
    <CrmsClient
      crms={[PADRAO, GIRLY]}
      funisParaImportar={[
        { id: "f-1", name: "PADRÃO › Ensaio", slug: "ensaio", description: null, position: 1, is_default: true },
      ]}
      podeGerenciar
      podeImportar
      {...over}
    />,
  );
}

beforeEach(() => {
  ligada = false;
  post.mockReset();
  refresh.mockReset();
});

describe("cards", () => {
  it("cada card mostra nome, endereço, iniciais, leads e funis — e só o padrão tem o selo", () => {
    tela();
    expect(screen.getByRole("heading", { level: 1, name: "CRMs" })).toBeInTheDocument();
    expect(screen.getByTestId("crm-card-pedidos")).toHaveTextContent("/pedidos");
    expect(screen.getByTestId("crm-avatar-pedidos")).toHaveTextContent("PA");
    // separador de milhar do idioma, não "12480"
    expect(screen.getByTestId("crm-leads-pedidos")).toHaveTextContent("12.480");
    expect(screen.getByTestId("crm-funis-pedidos")).toHaveTextContent("3");
    expect(screen.getByTestId("crm-padrao-pedidos")).toHaveTextContent("Padrão");
    expect(screen.queryByTestId("crm-padrao-clientes-girly")).toBeNull();
  });

  it("o rodapé diz há quanto tempo — e 'Sem negócios ainda' quando não há nenhum", () => {
    tela();
    expect(screen.getByTestId("crm-atualizado-pedidos")).toHaveTextContent("Atualizado há 5 min");
    expect(screen.getByTestId("crm-atualizado-clientes-girly")).toHaveTextContent("Sem negócios ainda");
  });

  it("'Abrir CRM' leva ao CRM pelo SLUG", () => {
    tela();
    expect(screen.getByTestId("abrir-crm-clientes-girly")).toHaveAttribute("href", "/app/crms/clientes-girly");
  });

  it("a cor personalizada pinta o avatar com frente legível", () => {
    tela();
    const avatar = screen.getByTestId("crm-avatar-clientes-girly");
    expect(avatar.style.backgroundColor).not.toBe("");
    expect(avatar.style.color).not.toBe("");
    expect(screen.getByTestId("crm-avatar-pedidos").style.backgroundColor).toBe("");
  });

  it("a importação recebe os funis nomeados pelo CRM", () => {
    tela();
    expect(screen.getByTestId("abrir-importar-leads")).toHaveTextContent("PADRÃO › Ensaio");
  });
});

describe("nota de 'Clientes pela agenda'", () => {
  it("desligada: diz onde ligar, com o link", () => {
    tela();
    expect(screen.getByTestId("crms-nota-clientes")).toHaveTextContent("Clientes pela agenda");
    expect(screen.getByTestId("crms-nota-ligar")).toHaveAttribute("href", "/app/settings/tenant/agenda");
  });

  it("ligada: diz o que acontece, sem o link", () => {
    ligada = true;
    tela();
    expect(screen.getByTestId("crms-nota-clientes")).toHaveTextContent("funil de clientes");
    expect(screen.queryByTestId("crms-nota-ligar")).toBeNull();
  });
});

describe("papéis e estado vazio", () => {
  it("quem não gerencia não vê '+ Novo CRM'", () => {
    tela({ podeGerenciar: false });
    expect(screen.queryByTestId("novo-crm")).toBeNull();
  });

  it("sem CRM nenhum: 'Crie seu primeiro CRM' com o botão no centro", () => {
    tela({ crms: [] });
    expect(screen.getByTestId("crms-vazio")).toHaveTextContent("Crie seu primeiro CRM");
    expect(screen.getByTestId("novo-crm-vazio")).toBeInTheDocument();
    expect(screen.queryByTestId("crms-grade")).toBeNull();
  });
});

describe("modal '+ Novo CRM'", () => {
  it("o endereço acompanha o nome, e as iniciais também", () => {
    tela();
    fireEvent.click(screen.getByTestId("novo-crm"));
    fireEvent.change(screen.getByTestId("novo-crm-nome"), { target: { value: "PA Advogados - EUROPA" } });
    expect(screen.getByTestId("novo-crm-slug")).toHaveValue("pa-advogados-europa");
    expect(screen.getByTestId("novo-crm-avatar")).toHaveTextContent("PA");
  });

  it("a sugestão desvia de endereço já ocupado", () => {
    tela();
    fireEvent.click(screen.getByTestId("novo-crm"));
    fireEvent.change(screen.getByTestId("novo-crm-nome"), { target: { value: "Pedidos" } });
    expect(screen.getByTestId("novo-crm-slug")).toHaveValue("pedidos-2");
  });

  it("depois de editado à mão, o endereço é da pessoa: renomear não o sobrescreve", () => {
    tela();
    fireEvent.click(screen.getByTestId("novo-crm"));
    fireEvent.change(screen.getByTestId("novo-crm-nome"), { target: { value: "Europa" } });
    fireEvent.change(screen.getByTestId("novo-crm-slug"), { target: { value: "/eu" } });
    fireEvent.change(screen.getByTestId("novo-crm-nome"), { target: { value: "Europa 2026" } });
    expect(screen.getByTestId("novo-crm-slug")).toHaveValue("eu");
  });

  it("'Definir como padrão' só aparece quando já existe CRM", () => {
    tela({ crms: [] });
    fireEvent.click(screen.getByTestId("novo-crm-vazio"));
    expect(screen.queryByTestId("novo-crm-padrao")).toBeNull();
  });

  it("criar manda o corpo da rota e relê a tela", async () => {
    post.mockResolvedValue({ data: {} });
    tela();
    fireEvent.click(screen.getByTestId("novo-crm"));
    fireEvent.change(screen.getByTestId("novo-crm-nome"), { target: { value: "Clientes VIP" } });
    fireEvent.click(screen.getByTestId("novo-crm-padrao"));
    fireEvent.click(screen.getByTestId("novo-crm-criar"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/crms", {
      name: "Clientes VIP",
      slug: "clientes-vip",
      description: null,
      avatar_bg_color: null,
      is_default: true,
    });
  });

  it("a recusa da rota aparece no modal, e ele continua aberto", async () => {
    const { ApiError } = await import("@/lib/api/types");
    post.mockRejectedValue(new ApiError(422, "unprocessable_entity", undefined, "req-1", "O endereço /pedidos já é do CRM «PADRÃO»."));
    tela();
    fireEvent.click(screen.getByTestId("novo-crm"));
    fireEvent.change(screen.getByTestId("novo-crm-nome"), { target: { value: "Outro" } });
    fireEvent.change(screen.getByTestId("novo-crm-slug"), { target: { value: "pedidos" } });
    fireEvent.click(screen.getByTestId("novo-crm-criar"));
    expect(await screen.findByTestId("novo-crm-erro")).toHaveTextContent("já é do CRM «PADRÃO»");
    expect(screen.getByTestId("modal-novo-crm")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
