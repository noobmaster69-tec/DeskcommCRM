import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import { ChatText } from "@/lib/ui/icons";

import { CanvasDoFluxoContext, type CanvasDoFluxo } from "./canvas-do-fluxo";
import { FluxoNode } from "./FluxoNode";
import { PreviaDoBloco, itensDaPrevia, linhaDoItem, rodapeDoBloco } from "./previas";

const t = (s: string) => s;

function comCanvas(ui: ReactNode, extra: Partial<CanvasDoFluxo> = {}) {
  const valor: CanvasDoFluxo = {
    editar: vi.fn(),
    duplicar: vi.fn(),
    excluir: vi.fn(),
    distribuicoes: {},
    nomeDoFunil: () => "Vendas",
    nomeDoFluxo: () => "Boas-vindas",
    ...extra,
  };
  render(
    <ReactFlowProvider>
      <CanvasDoFluxoContext.Provider value={valor}>{ui}</CanvasDoFluxoContext.Provider>
    </ReactFlowProvider>,
  );
  return valor;
}

describe("prévia da Mensagem (item 5, imagem 7)", () => {
  it("cada tipo de item vira uma linha com ícone", () => {
    expect(linhaDoItem({ id: "a", tipo: "texto", texto: "Oi!" }, t)).toBe("📝 Oi!");
    expect(linhaDoItem({ id: "b", tipo: "intervalo", modo: "aleatorio", min_segundos: 6, max_segundos: 15 }, t)).toBe(
      "⏱️ Delay: 6-15s",
    );
    expect(linhaDoItem({ id: "c", tipo: "intervalo", modo: "fixo", segundos: 3 }, t)).toBe("⏱️ Delay: 3s");
    expect(linhaDoItem({ id: "d", tipo: "imagem", midia: { url: "https://x.y/a.png" } }, t)).toBe("🖼️ Imagem");
    expect(linhaDoItem({ id: "e", tipo: "video", midia: { url: "https://x.y/a.mp4" }, legenda: "Demo" }, t)).toBe("🎥 Demo");
    expect(linhaDoItem({ id: "f", tipo: "audio", midia: { url: "https://x.y/a.ogg" } }, t)).toBe("🎤 Áudio");
  });

  it("mostra no máximo 4 itens e conta o resto", () => {
    expect(itensDaPrevia([1, 2, 3, 4, 5, 6])).toEqual({ visiveis: [1, 2, 3, 4], resto: 2 });
    expect(itensDaPrevia([1, 2])).toEqual({ visiveis: [1, 2], resto: 0 });
    const config = {
      itens: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, tipo: "texto" as const, texto: `linha ${i}` })),
    } as FlowNode["config"];
    comCanvas(<PreviaDoBloco tipo="mensagem" config={config} />);
    expect(screen.getByText("📝 linha 3")).toBeInTheDocument();
    expect(screen.queryByText("📝 linha 4")).toBeNull();
    expect(screen.getByText("+ 2 itens")).toBeInTheDocument();
  });
});

describe("prévias dos outros blocos", () => {
  it("Etiquetas: pílulas e rodapé com a operação", () => {
    comCanvas(<PreviaDoBloco tipo="etiquetas" config={{ operacao: "adicionar", etiquetas: ["vip", "lead"] } as FlowNode["config"]} />);
    expect(screen.getByText("vip")).toBeInTheDocument();
    expect(rodapeDoBloco("etiquetas", { operacao: "adicionar", etiquetas: ["x"] } as FlowNode["config"], t)).toBe(
      "Adicionar etiquetas ao cliente",
    );
    expect(rodapeDoBloco("etiquetas", { operacao: "remover", etiquetas: ["x"] } as FlowNode["config"], t)).toBe(
      "Remover etiquetas",
    );
  });

  it("Kanban: a ação e a pílula do funil", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="kanban"
        config={{ acao: "adicionar", pipeline_id: "11111111-1111-4111-8111-111111111111" } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Adicionar card:")).toBeInTheDocument();
    expect(screen.getByText("+ Vendas")).toBeInTheDocument();
  });

  it("Condicional: a regra e cada condição", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="condicional"
        config={
          {
            regra: "qualquer",
            condicoes: [{ id: "c1", campo: { tipo: "etiqueta" }, operador: "contem", valor: "vip" }],
          } as FlowNode["config"]
        }
      />,
    );
    expect(screen.getByText("SE qualquer")).toBeInTheDocument();
    expect(screen.getByText("Etiqueta contém vip")).toBeInTheDocument();
  });

  it("Aguardar resposta: o texto e o prazo", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="aguardar_resposta"
        config={{ sem_limite: false, tempo: { valor: 2, unidade: "horas" }, responder_citando: false } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Aguardar pela resposta do cliente")).toBeInTheDocument();
    expect(screen.getByText("Após 2 h")).toBeInTheDocument();
  });

  it("Conexão de fluxo: o nome do fluxo de destino", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="conexao_fluxo"
        config={{ fluxo_id: "11111111-1111-4111-8111-111111111111", retornar: false } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Ir para o fluxo:")).toBeInTheDocument();
    expect(screen.getByText("Boas-vindas")).toBeInTheDocument();
  });
});

describe("FluxoNode — o cartão genérico", () => {
  it("cabeçalho com título e as ações ✏️ 📋 🗑️ ligadas ao canvas", async () => {
    const user = userEvent.setup({ delay: null });
    const canvas = comCanvas(
      <FluxoNode id="n1" icon={ChatText} title="Mensagem" color="#3b82f6" showTarget={false} showSource={false}>
        <p>corpo</p>
      </FluxoNode>,
    );
    expect(screen.getByText("Mensagem")).toBeInTheDocument();
    await user.click(screen.getByTestId("bloco-editar-n1"));
    await user.click(screen.getByTestId("bloco-duplicar-n1"));
    await user.click(screen.getByTestId("bloco-excluir-n1"));
    expect(canvas.editar).toHaveBeenCalledWith("n1");
    expect(canvas.duplicar).toHaveBeenCalledWith("n1");
    expect(canvas.excluir).toHaveBeenCalledWith("n1");
  });

  it("Fim: só cabeçalho, sem corpo", () => {
    comCanvas(<FluxoNode id="f1" icon={ChatText} title="Fim" color="#991b1b" showTarget={false} showSource={false} />);
    expect(screen.queryByTestId("previa-f1")).toBeNull();
  });

  it("acoes restringe os botões (o Início só edita)", () => {
    comCanvas(
      <FluxoNode id="i1" icon={ChatText} title="Início" color="#6366f1" showTarget={false} showSource={false} acoes={["editar"]} />,
    );
    expect(screen.getByTestId("bloco-editar-i1")).toBeInTheDocument();
    expect(screen.queryByTestId("bloco-excluir-i1")).toBeNull();
  });
});
