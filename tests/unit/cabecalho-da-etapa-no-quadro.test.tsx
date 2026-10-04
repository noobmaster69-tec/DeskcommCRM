// O CABEÇALHO DA COLUNA NO QUADRO (Funis no modelo Kommo, Fase B).
//
// Substitui o renomear no lugar do #1738: clicar no título agora abre o modal
// de edição (nome, cor, ganho/perda, excluir), como no Kommo. O corte de papel
// é das ROTAS (`requireRole("manager")`); a tela só não oferece o botão a quem
// a rota recusaria. A Etapa de entrada (9007) nunca abre o modal: é fixa.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContext } from "@hello-pangea/dnd";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/kanban/KanbanCard", () => ({ KanbanCard: () => null }));

import { StageColumn } from "@/components/kanban/StageColumn";
import type { Stage } from "@/lib/kanban/types";

const etapa = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  pipeline_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Proposta",
  position: 1,
  color: null,
} as unknown as Stage;

function montar(stage: Stage, podeEditar: boolean) {
  const onEditar = vi.fn();
  render(
    <DragDropContext onDragEnd={() => {}}>
      <StageColumn stage={stage} leads={[]} pipelineId={stage.pipeline_id} podeEditar={podeEditar} onEditar={onEditar} />
    </DragDropContext>,
  );
  return onEditar;
}

describe("cabeçalho da coluna no quadro", () => {
  it("quem não pode editar vê só o título, sem botão", () => {
    montar(etapa, false);
    expect(screen.getByRole("heading", { name: "Proposta" })).toBeTruthy();
    expect(screen.queryByTestId("nome-etapa-quadro")).toBeNull();
  });

  it("manager clica no título e abre a edição", async () => {
    const onEditar = montar(etapa, true);
    await userEvent.click(screen.getByTestId("nome-etapa-quadro"));
    expect(onEditar).toHaveBeenCalledOnce();
  });

  it("a Etapa de entrada não abre a edição, nem para manager, e mostra o cadeado", () => {
    montar({ ...etapa, name: "Etapa de entrada", is_entry: true }, true);
    expect(screen.queryByTestId("nome-etapa-quadro")).toBeNull();
    expect(screen.getByTestId("cadeado-da-entrada")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Etapa de entrada/ })).toBeTruthy();
  });

  it("a cor vira a faixa de baixo do cabeçalho — sombra interna, sem mudar a altura", () => {
    montar({ ...etapa, color: "#a4c8fa" }, false);
    const cabecalho = screen.getByTestId("cabecalho-da-etapa");
    expect(cabecalho.style.boxShadow).toBe("inset 0 -3px 0 #a4c8fa");
    // A borda é a mesma das colunas sem cor: é o que mantém as alturas iguais.
    expect(cabecalho.className).toContain("border-border");
    expect(cabecalho.className).not.toContain("border-b-[3px]");
  });
});
