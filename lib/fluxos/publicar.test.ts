import { describe, expect, it } from "vitest";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import type { FlowGraph } from "@/lib/followup/graph-schema";

/**
 * O publish visto por um FLUXO (fork jhoow): as regras feitas para o relógio do
 * follow-up não podem recusar o desenho comum de um fluxo de atendimento.
 */
const no = (id: string, type: string, config: unknown = {}) => ({ id, type, label: id, position: { x: 0, y: 0 }, config });
const sempre = (s: string, t: string) => ({ id: `${s}-${t}`, source: s, target: t, priority: 0, condition: { type: "always" } });
const ramo = (s: string, t: string, b: string) => ({ id: `${s}-${b}`, source: s, target: t, priority: 0, condition: { type: "branch", branch_id: b } });
const msg = (id: string) => no(id, "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "oi" }] });
const pub = (nodes: unknown[], edges: unknown[]) =>
  validateFlowForPublish({ nodes, edges } as unknown as FlowGraph, { surface: "fluxo" });
const aguardar = { sem_limite: false, tempo: { valor: 1, unidade: "horas" }, responder_citando: false };

describe("publicar um fluxo", () => {
  it("menu que volta pelo Aguardar resposta publica (o lead é quem gira o ciclo)", () => {
    const r = pub(
      [
        no("t", "trigger"),
        msg("menu"),
        no("q", "aguardar_resposta", aguardar),
        no("c", "condicional", { regra: "todas", condicoes: [{ id: "c1", campo: { tipo: "etiqueta" }, operador: "vazio" }] }),
        no("f", "end", {}),
      ],
      [sempre("t", "menu"), sempre("menu", "q"), ramo("q", "c", "respondeu"), ramo("q", "f", "sem_resposta"), ramo("c", "menu", "sim"), ramo("c", "f", "nao")],
    );
    expect(r).toEqual({ ok: true });
  });

  it("caminho com mais de 30 blocos publica num fluxo", () => {
    const nodes = [no("t", "trigger"), ...Array.from({ length: 40 }, (_, i) => msg(`m${i}`)), no("f", "end", {})];
    const ids = nodes.map((n) => (n as { id: string }).id);
    const edges = ids.slice(0, -1).map((id, i) => sempre(id, ids[i + 1]!));
    expect(pub(nodes, edges)).toEqual({ ok: true });
  });

  it("saída nomeada solta é recusada, com o nome da saída", () => {
    const r = pub(
      [no("t", "trigger"), no("q", "aguardar_resposta", aguardar), no("f", "end", {})],
      [sempre("t", "q"), ramo("q", "f", "respondeu")],
    );
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("Não respondeu");
  });

  it("Conexão sem volta é fim; com volta precisa de saída", () => {
    const sem = pub([no("t", "trigger"), no("x", "conexao_fluxo", { fluxo_id: "00000000-0000-4000-8000-000000000001", retornar: false })], [sempre("t", "x")]);
    expect(sem).toEqual({ ok: true });
    const com = pub([no("t", "trigger"), no("x", "conexao_fluxo", { fluxo_id: "00000000-0000-4000-8000-000000000001", retornar: true }), no("f", "end", {})], [sempre("t", "x")]);
    expect(com.ok).toBe(false);
  });

  it("ciclo sem espera nenhuma continua recusado", () => {
    const r = pub([no("t", "trigger"), msg("a"), msg("b"), no("f", "end", {})], [sempre("t", "a"), sempre("a", "b"), sempre("b", "a"), sempre("b", "f")]);
    expect(JSON.stringify(r)).toContain("cycle_without_wait");
  });

  it("Bloco de IA publica com as saídas da IA, a de escape e 'Falhou' ligadas; sem 'Falhou', recusa", () => {
    const ia = no("ia", "bloco_ia", {
      provedor: "anthropic",
      modelo: "claude-sonnet-5-5",
      condicionais: [{ id: "r1", nome: "Quer comprar", descricao: "pede o preço" }],
    });
    const nos = [no("t", "trigger"), ia, no("f1", "end", {}), no("f2", "end", {}), no("f3", "end", {})];
    const certo = pub(nos, [sempre("t", "ia"), ramo("ia", "f1", "r1"), sempre("ia", "f2"), ramo("ia", "f3", "falha")]);
    expect(certo).toEqual({ ok: true });
    const semFalha = pub(nos, [sempre("t", "ia"), ramo("ia", "f1", "r1"), sempre("ia", "f2")]);
    expect(semFalha.ok).toBe(false);
    expect(JSON.stringify(semFalha)).toContain("Falhou");
  });

  it("Pixel publica no fluxo", () => {
    const r = pub(
      [no("t", "trigger"), no("p", "pixel", { evento: "Lead", moeda: "BRL" }), no("f", "end", {})],
      [sempre("t", "p"), sempre("p", "f")],
    );
    expect(r).toEqual({ ok: true });
  });
});
