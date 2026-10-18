import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RFNode } from "@/lib/followup/graph-mappers";

import { BlocoDoFluxoModal } from "./BlocoDoFluxoModal";

const no: RFNode = {
  id: "mensagem-1",
  type: "mensagem",
  position: { x: 0, y: 0 },
  data: { label: "Mensagem", config: { itens: [{ id: "t1", tipo: "texto", texto: "Oi" }] } },
};

describe("modal de bloco do canvas de Fluxos (item 7)", () => {
  it("abre com \"Editar {bloco}\", categoria · etapa, o formulário e Cancelar/Salvar", () => {
    render(
      <BlocoDoFluxoModal node={no} etapa={4} onSalvar={() => {}} onCancelar={() => {}}>
        <p>formulário</p>
      </BlocoDoFluxoModal>,
    );
    const modal = screen.getByTestId("bloco-modal");
    expect(modal).toHaveTextContent("Editar Mensagem");
    expect(modal).toHaveTextContent("Enviar · etapa 4");
    expect(modal).toHaveTextContent("Esc para fechar · ⌘ Enter para salvar");
    expect(modal).toHaveTextContent("formulário");
    expect(screen.getByTestId("bloco-modal-cancelar")).toHaveTextContent("Cancelar");
    expect(screen.getByTestId("bloco-modal-salvar")).toHaveTextContent("Salvar");
  });

  it("Salvar só fecha (o formulário já gravou no nó)", async () => {
    const onSalvar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <BlocoDoFluxoModal node={no} onSalvar={onSalvar} onCancelar={onCancelar}>
        <p>x</p>
      </BlocoDoFluxoModal>,
    );
    await userEvent.setup({ delay: null }).click(screen.getByTestId("bloco-modal-salvar"));
    expect(onSalvar).toHaveBeenCalledOnce();
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("⌘/Ctrl+Enter salva", async () => {
    const onSalvar = vi.fn();
    render(
      <BlocoDoFluxoModal node={no} onSalvar={onSalvar} onCancelar={() => {}}>
        <input aria-label="campo" />
      </BlocoDoFluxoModal>,
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByLabelText("campo"));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSalvar).toHaveBeenCalledOnce();
  });

  it("com alteração, Cancelar pergunta antes e então devolve a foto da abertura", async () => {
    const onCancelar = vi.fn();
    const settings = { somente_interno: false } as never;
    const { rerender } = render(
      <BlocoDoFluxoModal node={no} settings={settings} onSalvar={() => {}} onCancelar={onCancelar}>
        <p>x</p>
      </BlocoDoFluxoModal>,
    );
    const editado: RFNode = { ...no, data: { ...no.data, label: "Editado" } };
    rerender(
      <BlocoDoFluxoModal node={editado} settings={settings} onSalvar={() => {}} onCancelar={onCancelar}>
        <p>x</p>
      </BlocoDoFluxoModal>,
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByTestId("bloco-modal-cancelar"));
    expect(onCancelar).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("bloco-modal-descartar-sim"));
    expect(onCancelar).toHaveBeenCalledWith(no.data, settings);
  });

  it("sem alteração, Esc fecha direto", async () => {
    const onCancelar = vi.fn();
    render(
      <BlocoDoFluxoModal node={no} onSalvar={() => {}} onCancelar={onCancelar}>
        <p>x</p>
      </BlocoDoFluxoModal>,
    );
    await userEvent.setup({ delay: null }).keyboard("{Escape}");
    expect(onCancelar).toHaveBeenCalledWith(no.data, undefined);
  });
});

describe("Fluxos não abre mais o painel lateral", () => {
  const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");
  it("o painel lateral fica só para o follow-up", () => {
    expect(canvas).toMatch(/selectedNode && isFluxo && \(\s*<BlocoDoFluxoModal/);
    expect(canvas).toMatch(/selectedNode && !isFluxo && \(\s*<aside/);
  });
});
