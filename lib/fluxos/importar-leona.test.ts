import { describe, expect, it } from "vitest";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import { chaveDeCampo, converterFluxoDoLeona, converterVariaveis, type ContextoDaImportacao } from "./importar-leona";

/**
 * O importador do Leona contra um fluxo no formato de `get_flow` — os mesmos
 * tipos de bloco, ações e ligações dos fluxos reais de venda (Prévia, PRINCIPAL),
 * com dados inventados.
 */
const FUNIL = "11111111-1111-4111-8111-111111111111";
const ETAPA = "22222222-2222-4222-8222-222222222222";
const OUTRO_FLUXO = "33333333-3333-4333-8333-333333333333";
const ctx: ContextoDaImportacao = {
  funis: [{ id: FUNIL, nome: "Funil Retratista", etapas: [{ id: ETAPA, nome: "Negociação" }] }],
  fluxos: [{ id: OUTRO_FLUXO, nome: "RMK - Apresentação" }],
};

const no = (id: number, node_type: string, actions: unknown[] = [], name: string | null = null) => ({
  id,
  node_type,
  name,
  position: { x: id * 10, y: 0 },
  actions: actions.map((a, i) => ({ order: i, ...(a as object) })),
});
const liga = (from: number, to: number, condition_config: Record<string, unknown> = { type: "always" }, condition_type = "always") => ({
  id: from * 1000 + to,
  from_node_id: from,
  to_node_id: to,
  condition_type,
  condition_config,
});

const LEONA = {
  flow: { id: 1, name: "[ES-V9] Prévia" },
  nodes: [
    no(1, "start", [], "Início"),
    no(2, "message", [
      { action_type: "send_message", config: { message_text: "Oi {{customer.name}}! Vou mandar um exemplo👇", typing_delay_seconds: 3 } },
      {
        action_type: "send_multi_media",
        config: { caption: "", media_type: "image", media_source: "file", media_file_info: { url: "https://cdn.exemplo.net/a1", filename: "ex.png", content_type: "image/png" } },
      },
      { action_type: "delay_between_messages", config: { delay_seconds: 0, delay_min_seconds: 6, delay_max_seconds: 8 } },
      { action_type: "send_sticker", config: { sticker_url: "data:image/png;base64,iVBORw0KGgo=" } },
    ]),
    no(3, "wait_response", [
      { action_type: "send_message", config: { message_text: "Topa ver as prévias?" } },
      { action_type: "wait_for_response", config: { wait_indefinitely: true, timeout_value: 31, timeout_unit: "days", buffer_enabled: true, buffer_value: 12, reply_to_lead_enabled: true } },
      { action_type: "save_user_data", config: { field_name: "Resposta", save_empty: true } },
    ]),
    no(4, "ai", [
      {
        action_type: "ai_call",
        config: {
          provider: "gpt",
          api_key: "sk-proj-NAO-PODE-APARECER",
          model: "gpt-5.4-mini",
          user_message: "{{last_user_message}}\n",
          system_prompt: "Classifique a resposta. Responda SIM ou NAO.",
          response_variable: "ai.response",
          auto_send_response: false,
          maintain_context: false,
          context_interactions: 5,
        },
      },
    ]),
    no(5, "condition", [
      {
        action_type: "evaluate_condition",
        config: { ruleType: "all", conditions: [{ id: "x", category: "custom_field", fieldName: "ai.response", fieldValue: "SIM", fieldOperator: "equal" }] },
      },
    ]),
    no(6, "distributor", [
      {
        action_type: "distribute_contacts",
        config: { outputs: [{ id: "output_1", name: "Saída 1", quantity: 2 }, { id: "output_2", name: "Saída 2", quantity: 2 }], prevent_repeat: true },
      },
    ]),
    no(7, "kanban", [{ action_type: "create_kanban_card", config: { crm_name: "Funil Retratista ", crm_column_name: "Negociação" } }]),
    no(8, "notification", [{ action_type: "send_notification", config: { name: "Erro", phone: "11915793995", message: "Não entendi {{customer.name}}", country_code: "55" } }]),
    no(9, "connection_flow", [{ action_type: "execute_flow", config: { target_flow_id: 58890, target_flow_name: "RMK - Apresentação" } }]),
    no(10, "tags", [{ action_type: "add_tags", config: { tags: ["Lead - Retratista"], action: "add" } }]),
    no(11, "pixel", [{ action_type: "send_pixel_event", config: { event_type: "Compra", item_value: "320", currency: "BRL", page_id: "123" } }]),
    no(12, "integration", [{ action_type: "make_http_request", config: { request_url: "https://exemplo.com/x?secret=s" } }], "Integração"),
    no(13, "pix", [{ action_type: "send_pix_button", config: { pix_key: "11999990000", pix_type: "PHONE", merchant_name: "Fulano" } }]),
    no(14, "smart_interval", [{ action_type: "smart_interval", config: { schedule_type: "time", interval_value: 2, interval_unit: "hours" } }]),
  ],
  connections: [
    liga(1, 2),
    liga(2, 3),
    liga(3, 4, { type: "always", response_type: "client-response", source_handle: "client-response" }),
    liga(3, 8, { type: "timeout_or_unknown", response_type: "timeout", source_handle: "timeout" }, "timeout_or_unknown"),
    liga(4, 5, { type: "always", condition_result: "success" }),
    liga(4, 8, { type: "always", condition_result: "failure" }),
    liga(5, 6, { type: "always", condition_result: "success" }),
    liga(5, 9, { type: "always", condition_result: "failure" }),
    liga(6, 7, { type: "always", output_id: "output_1", output_name: "Saída 1" }),
    liga(6, 10, { type: "always", output_id: "output_2", output_name: "Saída 2" }),
    liga(7, 11),
    liga(10, 12),
    liga(12, 13, { type: "always", condition_result: "success" }),
    liga(11, 14),
  ],
};

describe("importar do Leona", () => {
  const r = converterFluxoDoLeona(LEONA, ctx);
  if ("erro" in r) throw new Error(r.erro);
  const doNo = (id: number) => r.grafo.nodes.find((n) => n.id === `l${id}`)!;
  const cfg = (id: number) => doNo(id).config as Record<string, unknown>;
  const arestasDe = (id: number) => r.grafo.edges.filter((e) => e.source === `l${id}`).map((e) => ({ alvo: e.target, cond: e.condition }));

  it("o grafo resultante é válido no formato dos Fluxos", () => {
    const parse = flowGraphSchema.safeParse(r.grafo);
    expect(parse.success, JSON.stringify(parse.error?.issues?.slice(0, 3))).toBe(true);
    expect(r.nome).toBe("[ES-V9] Prévia");
  });

  it("publica: toda saída solta ganhou um Fim (o bloco sem equivalente, não — ele corta o caminho)", () => {
    const comIntegracao = validateFlowForPublish(flowGraphSchema.parse(r.grafo), { surface: "fluxo" });
    expect(comIntegracao.ok).toBe(false);
    const sem = converterFluxoDoLeona(
      {
        ...LEONA,
        nodes: LEONA.nodes.filter((n) => n.id !== 12),
        connections: [...LEONA.connections.filter((c) => c.from_node_id !== 12 && c.to_node_id !== 12), liga(10, 13)],
      },
      ctx,
    );
    if ("erro" in sem) throw new Error(sem.erro);
    expect(validateFlowForPublish(flowGraphSchema.parse(sem.grafo), { surface: "fluxo" })).toEqual({ ok: true });
    expect(arestasDe(8)).toEqual([{ alvo: expect.stringMatching(/^fim\d+$/), cond: { type: "always" } }]);
  });

  it("bloco solto no Leona (sem ligação a partir do Início) não é importado", () => {
    const comSolto = converterFluxoDoLeona({ ...LEONA, nodes: [...LEONA.nodes, no(99, "message", [{ action_type: "send_message", config: { message_text: "velho" } }])] }, ctx);
    if ("erro" in comSolto) throw new Error(comSolto.erro);
    expect(comSolto.grafo.nodes.some((n) => n.id === "l99")).toBe(false);
    expect(comSolto.avisos.some((a) => a.startsWith("1 bloco(s) solto(s)"))).toBe(true);
  });

  it("a chave de API do Leona NUNCA atravessa", () => {
    expect(JSON.stringify(r)).not.toContain("sk-proj");
    expect(r.avisos.some((a) => a.includes("chave de API do Leona NÃO foi importada"))).toBe(true);
  });

  it("mensagem: digitando vira intervalo, mídia e figurinha vão para a cópia, variáveis traduzidas", () => {
    const itens = cfg(2).itens as Array<Record<string, unknown>>;
    expect(itens.map((i) => i.tipo)).toEqual(["intervalo", "texto", "imagem", "intervalo", "sticker"]);
    expect(itens[1]!.texto).toBe("Oi {nome}! Vou mandar um exemplo👇");
    expect(itens[3]).toMatchObject({ modo: "aleatorio", min_segundos: 6, max_segundos: 8 });
    expect(r.midias.map((m) => m.origem.slice(0, 10))).toEqual(["https://cd", "data:image"]);
  });

  it("aguardar indefinidamente: pergunta, buffer, citação, campo; a resposta segue pela saída comum", () => {
    expect(cfg(3)).toMatchObject({ sem_limite: true, mensagem_antes: "Topa ver as prévias?", buffer: { ativo: true, segundos: 12 }, responder_citando: true, salvar_em: "resposta" });
    expect(arestasDe(3)).toEqual([{ alvo: "l4", cond: { type: "always" } }]);
  });

  it("IA: sucesso pela saída comum, falha por 'falha'; provedor gpt → openai", () => {
    expect(cfg(4)).toMatchObject({ provedor: "openai", modelo: "gpt-5.4-mini", mensagem: "{ultima_mensagem}", enviar_resposta: false });
    expect(arestasDe(4)).toEqual([
      { alvo: "l5", cond: { type: "always" } },
      { alvo: "l8", cond: { type: "branch", branch_id: "falha" } },
    ]);
  });

  it("condição success/failure → Sim/Não; distribuidor pelas saídas", () => {
    expect(arestasDe(5).map((a) => a.cond)).toEqual([
      { type: "branch", branch_id: "sim" },
      { type: "branch", branch_id: "nao" },
    ]);
    expect(cfg(6).modo).toBe("fixo_por_contato");
    expect(arestasDe(6).map((a) => a.cond)).toEqual([
      { type: "branch", branch_id: "output_1" },
      { type: "branch", branch_id: "output_2" },
    ]);
  });

  it("kanban e conexão acham funil, etapa e fluxo pelo NOME", () => {
    expect(cfg(7)).toEqual({ acao: "adicionar", pipeline_id: FUNIL, stage_id: ETAPA });
    expect(cfg(9)).toEqual({ fluxo_id: OUTRO_FLUXO, retornar: false });
  });

  it("pixel Compra, PIX vira texto, intervalo em horas, bloco sem equivalente vira Fim ⚠ sem saída", () => {
    expect(cfg(11)).toEqual({ evento: "Purchase", moeda: "BRL", valor: "320", page_id: "123" });
    expect((cfg(13).itens as Array<Record<string, unknown>>)[0]!.texto).toContain("Chave PIX: 11999990000");
    expect(cfg(14)).toEqual({ modo: "duracao", valor: 2, unidade: "horas" });
    expect(doNo(12)).toMatchObject({ type: "end", label: "⚠ Integração" });
    expect(arestasDe(12)).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("secret=s");
  });

  it("recusa o que não é fluxo do Leona", () => {
    expect(converterFluxoDoLeona({ foo: 1 }, ctx)).toHaveProperty("erro");
    expect(converterFluxoDoLeona({ nodes: [no(1, "message", [])] }, ctx)).toHaveProperty("erro");
  });
});

describe("conversões auxiliares", () => {
  it("variáveis", () => {
    expect(converterVariaveis("{{last_user_message}} / {customer.cidade} / {ai.response}")).toBe("{ultima_mensagem} / {cidade} / {ai.response}");
  });
  it("chave de campo", () => {
    expect(chaveDeCampo("Resposta do Cliente")).toBe("resposta_do_cliente");
    expect(chaveDeCampo("ai.response")).toBe("ai.response");
    expect(chaveDeCampo("123")).toBeNull();
  });
});
