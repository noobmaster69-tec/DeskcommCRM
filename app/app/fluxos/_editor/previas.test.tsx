import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import { CanvasDoFluxoContext, type CanvasDoFluxo } from "./canvas-do-fluxo";
import { FluxoNode } from "./FluxoNode";
import { PreviaDoBloco, faixaDoDigitando, itensDaPrevia, linhaDoItem, rodapeDoBloco } from "./previas";

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

describe("prévia da Mensagem", () => {
  it("cada tipo de item vira uma linha, sem emoji", () => {
    expect(linhaDoItem({ id: "a", tipo: "texto", texto: "Oi!" }, t)).toBe("Oi!");
    expect(linhaDoItem({ id: "b", tipo: "intervalo", modo: "aleatorio", min_segundos: 6, max_segundos: 15 }, t)).toBe(
      "Pausa 6–15 s",
    );
    expect(linhaDoItem({ id: "c", tipo: "intervalo", modo: "fixo", segundos: 3 }, t)).toBe("Pausa 3 s");
    expect(linhaDoItem({ id: "d", tipo: "imagem", midia: { url: "https://x.y/a.png" } }, t)).toBe("Imagem");
    expect(linhaDoItem({ id: "e", tipo: "video", midia: { url: "https://x.y/a.mp4" }, legenda: "Demo" }, t)).toBe("Demo");
    expect(linhaDoItem({ id: "f", tipo: "audio", midia: { url: "https://x.y/a.ogg" } }, t)).toBe("Áudio");
  });

  it("variáveis destacadas e nenhum emoji no cartão", () => {
    const config = { itens: [{ id: "t1", tipo: "texto", texto: "Oi {nome}, tudo bem?" }] } as FlowNode["config"];
    comCanvas(<PreviaDoBloco tipo="mensagem" config={config} />);
    const variavel = screen.getByText("{nome}");
    expect(variavel).toHaveClass("fx-var");
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("a faixa do digitando vai do menor ao maior", () => {
    expect(faixaDoDigitando([{ id: "a", tipo: "texto", texto: "x" }])).toBe("6 s");
    expect(
      faixaDoDigitando([
        { id: "a", tipo: "texto", texto: "x" },
        { id: "b", tipo: "audio", midia: { url: "https://x.y/a.ogg" } },
      ]),
    ).toBe("6–15 s");
    expect(faixaDoDigitando([{ id: "c", tipo: "contato", nome: "A", telefone: "5511999999999" }])).toBeNull();
  });

  it("mostra no máximo 4 itens e conta o resto", () => {
    expect(itensDaPrevia([1, 2, 3, 4, 5, 6])).toEqual({ visiveis: [1, 2, 3, 4], resto: 2 });
    expect(itensDaPrevia([1, 2])).toEqual({ visiveis: [1, 2], resto: 0 });
    const config = {
      itens: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, tipo: "texto" as const, texto: `linha ${i}` })),
    } as FlowNode["config"];
    comCanvas(<PreviaDoBloco tipo="mensagem" config={config} />);
    expect(screen.getByText("linha 3")).toBeInTheDocument();
    expect(screen.queryByText("linha 4")).toBeNull();
    expect(screen.getByText("+ 2 itens")).toBeInTheDocument();
  });
});

describe("prévias dos outros blocos", () => {
  it("Etiquetas: chips e a operação", () => {
    comCanvas(<PreviaDoBloco tipo="etiquetas" config={{ operacao: "adicionar", etiquetas: ["vip", "lead"] } as FlowNode["config"]} />);
    expect(screen.getByText("vip")).toHaveClass("fx-chip");
    expect(screen.getByText("Adicionar ao contato")).toBeInTheDocument();
    expect(rodapeDoBloco("etiquetas", { operacao: "adicionar", etiquetas: ["x"] } as FlowNode["config"], t)).toBe(
      "Adicionar etiquetas ao cliente",
    );
    expect(rodapeDoBloco("etiquetas", { operacao: "remover", etiquetas: ["x"] } as FlowNode["config"], t)).toBe(
      "Remover etiquetas",
    );
  });

  it("Kanban: campo com a ação e o funil", () => {
    comCanvas(
      <PreviaDoBloco
        tipo="kanban"
        config={{ acao: "adicionar", pipeline_id: "11111111-1111-4111-8111-111111111111" } as FlowNode["config"]}
      />,
    );
    expect(screen.getByText("Adicionar card")).toHaveClass("fx-field__label");
    expect(screen.getByText("Vendas")).toBeInTheDocument();
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
    expect(screen.getByText("Ir para o fluxo")).toBeInTheDocument();
    expect(screen.getByText("Boas-vindas")).toBeInTheDocument();
  });
});

describe("FluxoNode — o cartão genérico", () => {
  it("cabeçalho com título e categoria; ações na barra flutuante ligadas ao canvas", async () => {
    const user = userEvent.setup({ delay: null });
    const canvas = comCanvas(
      <FluxoNode id="n1" tipo="mensagem" title="Saudação A" showTarget={false} showSource={false}>
        <p>corpo</p>
      </FluxoNode>,
    );
    expect(screen.getByText("Saudação A")).toBeInTheDocument();
    expect(screen.getByText("Enviar")).toBeInTheDocument();
    expect(screen.getByTestId("node-card-n1").style.getPropertyValue("--c")).toBe("oklch(0.66 0.155 262)");
    expect(screen.getByTestId("acoes-n1")).toContainElement(screen.getByTestId("bloco-editar-n1"));
    await user.click(screen.getByTestId("bloco-editar-n1"));
    await user.click(screen.getByTestId("bloco-duplicar-n1"));
    await user.click(screen.getByTestId("bloco-excluir-n1"));
    expect(canvas.editar).toHaveBeenCalledWith("n1");
    expect(canvas.duplicar).toHaveBeenCalledWith("n1");
    expect(canvas.excluir).toHaveBeenCalledWith("n1");
  });

  it("Fim: só cabeçalho, sem corpo", () => {
    comCanvas(<FluxoNode id="f1" tipo="end" title="Fim" showTarget={false} showSource={false} />);
    expect(screen.queryByTestId("previa-f1")).toBeNull();
    expect(screen.getByTestId("node-card-f1")).toHaveAttribute("data-so-cabecalho", "true");
  });

  it("acoes restringe os botões (o Início só edita)", () => {
    comCanvas(
      <FluxoNode id="i1" tipo="trigger" title="Início" showTarget={false} showSource={false} acoes={["editar"]} />,
    );
    expect(screen.getByTestId("bloco-editar-i1")).toBeInTheDocument();
    expect(screen.queryByTestId("bloco-excluir-i1")).toBeNull();
  });
});

describe("FluxoNode — saídas múltiplas", () => {
  it("uma linha por saída com valor à direita e OU entre elas", () => {
    comCanvas(
      <FluxoNode
        id="a1"
        tipo="aguardar_resposta"
        title="Aguardar"
        ouEntreSaidas
        saidas={[
          { id: "respondeu", conteudo: "Respondeu" },
          { id: "sem_resposta", conteudo: "Não respondeu", valor: "2 h" },
        ]}
      />,
    );
    expect(screen.getByTestId("node-branch-a1-sem_resposta")).toHaveTextContent("Não respondeu2 h");
    expect(screen.getByText("OU")).toBeInTheDocument();
  });
});
