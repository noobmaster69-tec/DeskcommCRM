/**
 * A paleta oferece só as caixas que o motor da superfície executa — na prova
 * prática do #1130, a paleta do roteiro oferecia seis caixas (Aguardar,
 * Condição, Classificar…) que o motor recusava em silêncio.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { traduzir } from "@/lib/i18n/dicionario";

import { NodePalette } from "./NodePalette";

const tipos = () =>
  screen.getAllByRole("button").map((b) => b.getAttribute("data-testid")?.replace("palette-add-", ""));

describe("NodePalette por superfície", () => {
  it("roteiro: Início, Pergunta, Skill e Fim", () => {
    render(<NodePalette onAdd={() => {}} surface="atendimento" />);
    expect(tipos()).toEqual(["trigger", "collect", "skill", "end"]);
  });

  it("follow-up: sem Pergunta nem Skill", () => {
    render(<NodePalette onAdd={() => {}} />);
    expect(tipos()).not.toContain("collect");
    expect(tipos()).not.toContain("skill");
    expect(tipos()).toContain("wait");
  });
});

describe("o título da paleta é Ferramentas (fluxos, item 11)", () => {
  it("diz Ferramentas, não mais Adicionar nó", () => {
    render(<NodePalette onAdd={() => {}} surface="fluxo" />);
    expect(screen.getByRole("heading", { name: "Ferramentas" })).toBeInTheDocument();
    expect(screen.queryByText(/Adicionar nó/i)).toBeNull();
  });

  it("em espanhol vira Herramientas", () => {
    expect(traduzir("Ferramentas", "es")).toBe("Herramientas");
  });
});
