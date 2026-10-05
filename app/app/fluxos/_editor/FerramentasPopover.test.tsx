import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FerramentasPopover, normalizarBusca } from "./FerramentasPopover";
import { posicaoNoCentro } from "./posicao-no-centro";
import { SimularDialog } from "./SimularDialog";

describe("botão Ferramentas do canvas de Fluxos (item 4)", () => {
  it("abre o popover com a busca e os blocos do fluxo", async () => {
    const user = userEvent.setup({ delay: null });
    render(<FerramentasPopover onAdd={() => {}} />);
    expect(screen.queryByTestId("ferramentas-popover")).toBeNull();
    await user.click(screen.getByTestId("ferramentas-botao"));
    expect(screen.getByTestId("ferramentas-busca")).toHaveAttribute("placeholder", "Buscar blocos...");
    expect(screen.getByTestId("ferramenta-mensagem")).toBeInTheDocument();
    expect(screen.getByTestId("ferramenta-distribuidor")).toBeInTheDocument();
    // Blocos de follow-up não entram.
    expect(screen.queryByTestId("ferramenta-wait")).toBeNull();
  });

  it("a busca filtra sem acento e sem caixa", async () => {
    const user = userEvent.setup({ delay: null });
    render(<FerramentasPopover onAdd={() => {}} />);
    await user.click(screen.getByTestId("ferramentas-botao"));
    await user.type(screen.getByTestId("ferramentas-busca"), "notificacao");
    expect(screen.getByTestId("ferramenta-notificacao")).toBeInTheDocument();
    expect(screen.queryByTestId("ferramenta-mensagem")).toBeNull();
  });

  it("clicar no bloco chama onAdd e fecha", async () => {
    const user = userEvent.setup({ delay: null });
    const onAdd = vi.fn();
    render(<FerramentasPopover onAdd={onAdd} />);
    await user.click(screen.getByTestId("ferramentas-botao"));
    await user.click(screen.getByTestId("ferramenta-kanban"));
    expect(onAdd).toHaveBeenCalledWith("kanban");
    expect(screen.queryByTestId("ferramentas-popover")).toBeNull();
  });

  it("o item continua arrastável para o canvas", async () => {
    const user = userEvent.setup({ delay: null });
    render(<FerramentasPopover onAdd={() => {}} />);
    await user.click(screen.getByTestId("ferramentas-botao"));
    expect(screen.getByTestId("ferramenta-mensagem")).toHaveAttribute("draggable", "true");
  });

  it("normalizarBusca tira acento e caixa", () => {
    expect(normalizarBusca("  Conexão de FLUXO ")).toBe("conexao de fluxo");
  });
});

describe("descrição de cada bloco no popover (item 10)", () => {
  it("cada bloco mostra uma linha curta do que faz", async () => {
    const user = userEvent.setup({ delay: null });
    render(<FerramentasPopover onAdd={() => {}} />);
    await user.click(screen.getByTestId("ferramentas-botao"));
    expect(screen.getByTestId("ferramenta-descricao-distribuidor")).toHaveTextContent("Reparte os contatos entre saídas");
    expect(screen.getByTestId("ferramenta-descricao-mensagem")).toHaveTextContent("Envia textos, mídias e pausas");
  });

  it("todo bloco do popover tem descrição", async () => {
    const { NOS_DA_SUPERFICIE } = await import("@/lib/followup/validate-publish");
    const { DESCRICAO_DO_BLOCO } = await import("./descricoes-dos-blocos");
    for (const tipo of NOS_DA_SUPERFICIE.fluxo) expect(DESCRICAO_DO_BLOCO[tipo], tipo).toBeTruthy();
  });

  it("a busca também lê a descrição", async () => {
    const user = userEvent.setup({ delay: null });
    render(<FerramentasPopover onAdd={() => {}} />);
    await user.click(screen.getByTestId("ferramentas-botao"));
    await user.type(screen.getByTestId("ferramentas-busca"), "meta");
    expect(screen.getByTestId("ferramenta-pixel")).toBeInTheDocument();
    expect(screen.queryByTestId("ferramenta-mensagem")).toBeNull();
  });
});

describe("Simular (item 4)", () => {
  it("abre o aviso Em breve", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SimularDialog />);
    await user.click(screen.getByTestId("simular-botao"));
    expect(screen.getByTestId("simular-dialog")).toHaveTextContent(/Em breve/);
  });
});

describe("posição do bloco novo", () => {
  it("nasce com o centro do cartão no centro da tela", () => {
    expect(posicaoNoCentro({ x: 500, y: 300 }, [])).toEqual({ x: 380, y: 250 });
  });

  it("não empilha em cima de um bloco que já está ali", () => {
    expect(posicaoNoCentro({ x: 500, y: 300 }, [{ x: 380, y: 250 }])).toEqual({ x: 380, y: 410 });
  });

  it("não nasce por cima de um cartão vizinho, mesmo deslocado (prova de 5 out)", () => {
    // Um cartão 30px ao lado ainda cobriria o novo: desce até sair da caixa dele.
    expect(posicaoNoCentro({ x: 500, y: 300 }, [{ x: 410, y: 280 }, { x: 380, y: 410 }])).toEqual({ x: 380, y: 570 });
  });
});

describe("o canvas de Fluxos não tem mais a paleta fixa", () => {
  const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");
  it("a paleta lateral fica só para o follow-up e Ferramentas entra no canvas", () => {
    expect(canvas).toMatch(/\{!isFluxo && <NodePalette /);
    expect(canvas).toMatch(/<FerramentasPopover onAdd=\{onFerramentaAdd\} \/>/);
  });
});
