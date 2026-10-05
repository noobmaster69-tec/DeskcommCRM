import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LanguageModel } from "ai";

import type { FlowGraph } from "@/lib/followup/graph-schema";

const gerado = vi.hoisted(() => ({ traducoes: [] as string[] }));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateObject: vi.fn(async () => ({ object: { traducoes: gerado.traducoes } })),
}));

import { aplicarTraducoes, textosDoFluxo, traduzirTextos, variaveisDe } from "./traduzir";

const grafo = {
  nodes: [
    { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    {
      id: "m",
      type: "mensagem",
      label: "Mensagem",
      position: { x: 0, y: 0 },
      config: {
        itens: [
          { id: "a", tipo: "texto", texto: "Olá, {nome}!" },
          { id: "b", tipo: "intervalo", modo: "fixo", segundos: 3 },
          { id: "c", tipo: "imagem", midia: { url: "https://x.y/a.png" }, legenda: "Nosso cardápio" },
        ],
      },
    },
    {
      id: "w",
      type: "aguardar_resposta",
      label: "Aguardar",
      position: { x: 0, y: 0 },
      config: { sem_limite: true, responder_citando: false, mensagem_antes: "Me conta?" },
    },
    { id: "e", type: "etiquetas", label: "Etiquetas", position: { x: 0, y: 0 }, config: { operacao: "adicionar", etiquetas: ["cliente vip"] } },
  ],
  edges: [{ id: "x", source: "t", target: "m", priority: 0, condition: { type: "always" } }],
} as unknown as FlowGraph;

describe("traduzir um fluxo (item 2)", () => {
  beforeEach(() => {
    gerado.traducoes = [];
  });

  it("junta só os textos que o cliente lê, na ordem", () => {
    expect(textosDoFluxo(grafo).textos).toEqual(["Olá, {nome}!", "Nosso cardápio", "Me conta?"]);
  });

  it("aplica cada tradução no lugar dela e não toca no resto", () => {
    const { locais } = textosDoFluxo(grafo);
    const novo = aplicarTraducoes(grafo, locais, ["Hello, {nome}!", "Our menu", "Tell me?"]);
    const m = novo.nodes[1] as Extract<FlowGraph["nodes"][number], { type: "mensagem" }>;
    expect(m.config.itens[0]).toMatchObject({ texto: "Hello, {nome}!" });
    expect(m.config.itens[2]).toMatchObject({ legenda: "Our menu" });
    expect((novo.nodes[2] as { config: { mensagem_antes: string } }).config.mensagem_antes).toBe("Tell me?");
    // Etiquetas, ids e arestas intactos; o original não mudou.
    expect(novo.nodes[3]).toEqual(grafo.nodes[3]);
    expect(novo.edges).toEqual(grafo.edges);
    expect((grafo.nodes[1] as { config: { itens: { texto?: string }[] } }).config.itens[0]!.texto).toBe("Olá, {nome}!");
  });

  it("tradução que perde a variável fica no original", async () => {
    gerado.traducoes = ["Hello!", "Our menu"];
    const out = await traduzirTextos({} as LanguageModel, ["Olá, {nome}!", "Nosso cardápio"], "en");
    expect(out).toEqual(["Olá, {nome}!", "Our menu"]);
  });

  it("lista curta do modelo: o que faltou fica no original", async () => {
    gerado.traducoes = ["Hi {nome}"];
    const out = await traduzirTextos({} as LanguageModel, ["Oi {nome}", "Tchau"], "en");
    expect(out).toEqual(["Hi {nome}", "Tchau"]);
  });

  it("variaveisDe acha as chaves", () => {
    expect(variaveisDe("Oi {nome}, seu pedido {pedido.id}")).toEqual(["{nome}", "{pedido.id}"]);
  });
});
