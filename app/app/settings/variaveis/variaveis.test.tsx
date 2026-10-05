import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { VariaveisClient, chaveDoRotulo } from "./_client";

describe("Configurações › Variáveis (item 2)", () => {
  it("mostra as do sistema e as da empresa", () => {
    render(
      <VariaveisClient
        podeEditar
        inicial={[
          { id: "1", key: "interesse", label: "Interesse", type: "texto", options: [], default_value: null, position: 0, visible_in_profile: true },
        ]}
      />,
    );
    expect(screen.getByTestId("variaveis-do-sistema")).toHaveTextContent("{saudacao_horario}");
    expect(screen.getByTestId("variavel-interesse")).toHaveTextContent("Interesse");
    expect(screen.getByTestId("nova-variavel")).toBeInTheDocument();
  });

  it("quem não é gerente não vê o formulário", () => {
    render(<VariaveisClient podeEditar={false} inicial={[]} />);
    expect(screen.queryByTestId("nova-variavel")).toBeNull();
  });

  it("a chave nasce do nome", () => {
    expect(chaveDoRotulo("Interesse principal")).toBe("interesse_principal");
    expect(chaveDoRotulo("Nº de Avaliações!")).toBe("n_de_avaliacoes");
  });
});
