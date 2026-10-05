import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GLOBAIS_VAZIOS } from "@/lib/fluxos/disparos";

import { DisparosClient } from "./DisparosClient";

const fluxos = [
  { id: "11111111-1111-4111-8111-111111111111", nome: "Boas-vindas", ativo: true },
  { id: "22222222-2222-4222-8222-222222222222", nome: "Rascunho", ativo: false },
];

function montar() {
  render(<DisparosClient inicial={{ palavras: [], globais: GLOBAIS_VAZIOS }} fluxos={fluxos} titulo="Disparos" subtitulo="sub" />);
  return userEvent.setup({ delay: null });
}

describe("tela Disparos (item 12)", () => {
  it("as duas seções e o Salvar alterações desligado até mudar algo", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Palavras-chave" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gatilhos globais" })).toBeInTheDocument();
    expect(screen.getByTestId("disparos-salvar")).toBeDisabled();
  });

  it("os quatro gatilhos globais, e o badge Sem fluxos quando nenhum está escolhido", () => {
    montar();
    for (const chave of ["welcome_fluxo_id", "conversation_closed_fluxo_id", "default_response_fluxo_id", "attendance_closed_fluxo_id"])
      expect(screen.getByTestId(`global-${chave}`)).toBeInTheDocument();
    expect(screen.getByTestId("disparos-sem-fluxos")).toHaveTextContent("Sem fluxos");
    expect(screen.getByTestId("disparos-horas")).toHaveValue(24);
  });

  it("+ Adicionar palavra-chave cria 'Palavra-chave 1' com uma condição, e liga o Salvar", async () => {
    const user = montar();
    await user.click(screen.getByTestId("disparos-nova-palavra"));
    expect(screen.getByDisplayValue("Palavra-chave 1")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Valor da condição")).toHaveLength(1);
    expect(screen.getByTestId("disparos-salvar")).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Adicionar condição/ }));
    expect(screen.getAllByLabelText("Valor da condição")).toHaveLength(2);
  });
});
