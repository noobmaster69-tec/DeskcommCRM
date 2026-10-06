import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./useCamposDaFicha", () => ({ useCamposDaFicha: () => ({ campos: [], variaveis: [] }) }));

import { MensagemForm } from "./MensagemForm";

/** "Delay do digitando" no modal do bloco Mensagem (fork jhoow). */
describe("MensagemForm — delay do digitando", () => {
  it("mostra o padrão (6 s), muda pelo slider e grava no item", () => {
    const onChange = vi.fn();
    render(<MensagemForm config={{ itens: [{ id: "a", tipo: "texto", texto: "Oi" }] }} onChange={onChange} />);
    expect(screen.getByTestId("digitando-valor-a").textContent).toMatch(/^6 segundos$/);
    expect(screen.getByText(/Tempo que o WhatsApp ficará “digitando”/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Delay do “digitando”" }), { target: { value: "12" } });
    expect(onChange).toHaveBeenLastCalledWith({ itens: [{ id: "a", tipo: "texto", texto: "Oi", typing_delay_seconds: 12 }] });
  });

  it("tempo aleatório grava o máximo", () => {
    const onChange = vi.fn();
    render(<MensagemForm config={{ itens: [{ id: "a", tipo: "texto", texto: "Oi", typing_delay_seconds: 4 }] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith({ itens: [{ id: "a", tipo: "texto", texto: "Oi", typing_delay_seconds: 4, typing_delay_random_max: 8 }] });
    expect(screen.getByTestId("digitando-valor-a").textContent).toMatch(/^4–8 segundos$/);
  });

  it("contato e intervalo não têm digitando", () => {
    render(
      <MensagemForm
        config={{ itens: [{ id: "c", tipo: "contato", nome: "A", telefone: "5511999999999" }, { id: "i", tipo: "intervalo", modo: "fixo", segundos: 3 }] }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
