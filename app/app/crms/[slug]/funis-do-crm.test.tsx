/**
 * A lista de funis DENTRO de um CRM (`/app/crms/[slug]`).
 *
 * As rotas de funil respondem com os funis da organização INTEIRA (é o corpo
 * que a tela aplica, sem esperar o refresh). Dentro de um CRM, aplicar o corpo
 * cru mostraria os funis dos outros CRMs — o recorte por `crm_id` é o que este
 * arquivo prova. E o funil novo nasce DENTRO do CRM aberto.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FunisClient, type FunilDaLista } from "./_client";

const criarComCrm = vi.fn();
let respostaDoCriar: { data: { pipelines: FunilDaLista[]; arquivados: FunilDaLista[] } };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ orgId: "org-1", name: "Apex", role: "admin", cliente_pela_agenda: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../_components/ImportarLeads", () => ({ ImportarLeads: () => null }));
vi.mock("@/hooks/pipelines/usePipelines", () => ({
  useCriarFunil: (crmId?: string) => {
    criarComCrm(crmId);
    return {
      isPending: false,
      mutate: (_nome: string, o: { onSuccess: (r: typeof respostaDoCriar) => void }) => o.onSuccess(respostaDoCriar),
    };
  },
  useEditarFunil: () => ({ isPending: false, mutate: vi.fn() }),
  useArquivarFunil: () => ({ isPending: false, mutate: vi.fn() }),
}));

const funil = (id: string, name: string, crm_id: string, over: Partial<FunilDaLista> = {}): FunilDaLista => ({
  id,
  crm_id,
  name,
  slug: id,
  description: null,
  position: 1000,
  is_default: false,
  ...over,
});

beforeEach(() => {
  criarComCrm.mockReset();
});

describe("FunisClient com crmId", () => {
  it("o hook de criação recebe o CRM da tela", () => {
    respostaDoCriar = { data: { pipelines: [], arquivados: [] } };
    render(
      <FunisClient funis={[funil("f-1", "Ensaio", "crm-a")]} arquivados={[]} podeGerenciar podeImportar crmId="crm-a" />,
    );
    expect(criarComCrm).toHaveBeenCalledWith("crm-a");
  });

  it("depois de criar, a lista mostra só os funis DESTE CRM — não os da organização inteira", () => {
    respostaDoCriar = {
      data: {
        pipelines: [
          funil("f-1", "Ensaio", "crm-a"),
          funil("f-2", "Upsell", "crm-a"),
          funil("f-9", "Funil de outro CRM", "crm-b", { is_default: true }),
        ],
        arquivados: [funil("f-8", "Arquivado de outro CRM", "crm-b")],
      },
    };
    render(
      <FunisClient funis={[funil("f-1", "Ensaio", "crm-a")]} arquivados={[]} podeGerenciar podeImportar crmId="crm-a" />,
    );
    fireEvent.click(screen.getByTestId("novo-funil"));
    fireEvent.change(screen.getByTestId("nome-do-novo-funil"), { target: { value: "Upsell" } });
    fireEvent.click(screen.getByTestId("confirmar-novo-funil"));

    expect(screen.getByText("Upsell")).toBeInTheDocument();
    expect(screen.getByText("Ensaio")).toBeInTheDocument();
    expect(screen.queryByText("Funil de outro CRM")).toBeNull();
    expect(screen.queryByText("Arquivado de outro CRM")).toBeNull();
  });

  it("sem crmId, a lista segue mostrando tudo (comportamento anterior)", () => {
    respostaDoCriar = {
      data: { pipelines: [funil("f-1", "Ensaio", "crm-a"), funil("f-9", "Outro", "crm-b")], arquivados: [] },
    };
    render(<FunisClient funis={[funil("f-1", "Ensaio", "crm-a")]} arquivados={[]} podeGerenciar podeImportar />);
    fireEvent.click(screen.getByTestId("novo-funil"));
    fireEvent.change(screen.getByTestId("nome-do-novo-funil"), { target: { value: "Outro" } });
    fireEvent.click(screen.getByTestId("confirmar-novo-funil"));
    expect(screen.getByText("Outro")).toBeInTheDocument();
    expect(criarComCrm).toHaveBeenCalledWith(undefined);
  });
});
