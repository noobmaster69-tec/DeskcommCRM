import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE_DO_TAMANHO, DockDeBlocos, normalizarBusca } from "./DockDeBlocos";
import { posicaoNoCentro } from "./posicao-no-centro";
import { SimularDialog } from "./SimularDialog";

beforeEach(() => window.localStorage.clear());

describe("dock de blocos do canvas de Fluxos", () => {
  it("mostra os blocos do fluxo em grupos, sem os de follow-up", () => {
    render(<DockDeBlocos onAdd={() => {}} />);
    expect(screen.getByRole("group", { name: "Gatilho" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "CRM" })).toBeInTheDocument();
    expect(screen.getByTestId("dock-mensagem")).toHaveTextContent("Mensagem");
    expect(screen.getByTestId("dock-distribuidor")).toHaveTextContent("Distribuir");
    expect(screen.queryByTestId("dock-wait")).toBeNull();
  });

  it("clicar chama onAdd com o tipo", async () => {
    const onAdd = vi.fn();
    render(<DockDeBlocos onAdd={onAdd} />);
    await userEvent.setup({ delay: null }).click(screen.getByTestId("dock-kanban"));
    expect(onAdd).toHaveBeenCalledWith("kanban");
  });

  it("o item é arrastável para o canvas", () => {
    render(<DockDeBlocos onAdd={() => {}} />);
    expect(screen.getByTestId("dock-mensagem")).toHaveAttribute("draggable", "true");
  });

  it("alterna grande/pequeno e lembra a escolha", async () => {
    render(<DockDeBlocos onAdd={() => {}} />);
    expect(screen.getByTestId("dock-de-blocos")).toHaveAttribute("data-tamanho", "grande");
    await userEvent.setup({ delay: null }).click(screen.getByTestId("dock-alternar"));
    expect(screen.getByTestId("dock-de-blocos")).toHaveAttribute("data-tamanho", "pequeno");
    expect(window.localStorage.getItem(CHAVE_DO_TAMANHO)).toBe("pequeno");
  });

  it("começa pequeno se foi o que a pessoa escolheu", () => {
    window.localStorage.setItem(CHAVE_DO_TAMANHO, "pequeno");
    render(<DockDeBlocos onAdd={() => {}} />);
    expect(screen.getByTestId("dock-de-blocos")).toHaveAttribute("data-tamanho", "pequeno");
  });

  it('"/" abre a busca; filtra sem acento e lê a descrição; Enter cria', async () => {
    const user = userEvent.setup({ delay: null });
    const onAdd = vi.fn();
    render(<DockDeBlocos onAdd={onAdd} />);
    expect(screen.queryByTestId("dock-busca")).toBeNull();
    await user.keyboard("/");
    await user.type(screen.getByTestId("dock-busca-campo"), "notificacao");
    expect(screen.getByTestId("dock-busca-notificacao")).toBeInTheDocument();
    expect(screen.queryByTestId("dock-busca-mensagem")).toBeNull();
    await user.clear(screen.getByTestId("dock-busca-campo"));
    await user.type(screen.getByTestId("dock-busca-campo"), "meta{Enter}");
    expect(onAdd).toHaveBeenCalledWith("pixel");
    expect(screen.queryByTestId("dock-busca")).toBeNull();
  });

  it('"/" não abre com um modal aberto', async () => {
    render(<DockDeBlocos onAdd={() => {}} desligado />);
    await userEvent.setup({ delay: null }).keyboard("/");
    expect(screen.queryByTestId("dock-busca")).toBeNull();
  });

  it("normalizarBusca tira acento e caixa", () => {
    expect(normalizarBusca("  Conexão de FLUXO ")).toBe("conexao de fluxo");
  });

  it("todo bloco do fluxo tem descrição (tooltip do dock)", async () => {
    const { NOS_DA_SUPERFICIE } = await import("@/lib/followup/validate-publish");
    const { DESCRICAO_DO_BLOCO } = await import("./descricoes-dos-blocos");
    for (const tipo of NOS_DA_SUPERFICIE.fluxo) expect(DESCRICAO_DO_BLOCO[tipo], tipo).toBeTruthy();
  });
});

describe("Simular", () => {
  it("abre o aviso Em breve", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SimularDialog />);
    await user.click(screen.getByTestId("simular-botao"));
    expect(screen.getByTestId("simular-dialog")).toHaveTextContent(/Em breve/);
  });
});

describe("posição do bloco novo", () => {
  it("nasce com o centro do cartão (264px) no centro da tela", () => {
    expect(posicaoNoCentro({ x: 500, y: 300 }, [])).toEqual({ x: 368, y: 250 });
  });

  it("não empilha em cima de um bloco que já está ali", () => {
    expect(posicaoNoCentro({ x: 500, y: 300 }, [{ x: 368, y: 250 }])).toEqual({ x: 368, y: 410 });
  });

  it("não nasce por cima de um cartão vizinho, mesmo deslocado", () => {
    expect(posicaoNoCentro({ x: 500, y: 300 }, [{ x: 410, y: 280 }, { x: 380, y: 410 }])).toEqual({ x: 368, y: 570 });
  });
});

describe("o canvas de Fluxos: sem paleta fixa, com dock, zoom e topbar própria", () => {
  const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");
  it("a paleta lateral fica só para o follow-up; o dock entra no canvas", () => {
    expect(canvas).toMatch(/\{!isFluxo && <NodePalette /);
    expect(canvas).toMatch(/<DockDeBlocos onAdd=\{onFerramentaAdd\}/);
    expect(canvas).toMatch(/\{isFluxo && <ControlesDoCanvas \/>\}/);
    expect(canvas).toMatch(/flow && isFluxo && \(\s*<BarraDoFluxo/);
  });

  it("duplo clique no canvas não dá zoom", () => {
    expect(canvas).toMatch(/zoomOnDoubleClick=\{!isFluxo\}/);
  });
});
