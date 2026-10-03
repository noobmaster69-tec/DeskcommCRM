import { describe, expect, it } from "vitest";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import {
  executarPasso,
  atrasoDoIntervalo,
  MAX_ESPERA_POR_JOB_MS,
  type DepsDoMotor,
  type EnrollmentDoFluxo,
  type MensagemDeSaida,
  type MotivoDoPasso,
  type RespostaDoLead,
} from "./motor";

/**
 * O motor dos Fluxos (fork jhoow, Fase B) contra um mundo falso: grafo, inscrição,
 * mensagens do lead e tudo o que sai fica em memória — cada caso prova um
 * comportamento do bloco pela SAÍDA (o que foi enviado, gravado, agendado).
 */
const ORG = "00000000-0000-4000-8000-000000000001";

function grafo(nodes: unknown[], edges: unknown[]): FlowGraph {
  return { nodes, edges } as unknown as FlowGraph;
}
const no = (id: string, type: string, config: unknown = {}) => ({ id, type, label: id, position: { x: 0, y: 0 }, config });
const sempre = (source: string, target: string, priority = 0) => ({
  id: `${source}-${target}`,
  source,
  target,
  priority,
  condition: { type: "always" },
});
const ramo = (source: string, target: string, branch_id: string) => ({
  id: `${source}-${branch_id}`,
  source,
  target,
  priority: 0,
  condition: { type: "branch", branch_id },
});

function mundo(g: FlowGraph, inicio = "t") {
  let relogio = new Date("2026-10-03T12:00:00Z").getTime();
  const enrollment: EnrollmentDoFluxo = {
    id: "e1",
    organization_id: ORG,
    version_id: "v1",
    contact_id: "c1",
    conversation_id: "conv1",
    current_node_id: inicio,
    status: "active",
    steps_taken: 0,
  };
  const enviadas: Array<MensagemDeSaida & { seq: number }> = [];
  const eventos: Array<{ no: string | null; tipo: string; payload: Record<string, unknown> }> = [];
  const agendados: Array<{ motivo: MotivoDoPasso; quando: Date }> = [];
  const campos: Record<string, unknown> = {};
  let tags: string[] = ["antiga"];
  const respostas: RespostaDoLead[] = [];
  const presencas: string[] = [];
  const reacoes: string[] = [];
  let bloquear = false;

  const deps: DepsDoMotor = {
    carregarEnrollment: async () => ({ ...enrollment }),
    carregarGrafo: async () => g,
    carregarContato: async () => ({ nome: "Maria Silva", telefone: "5511999999999", campos }),
    respostasDesde: async (_o, _c, desde) => respostas.filter((r) => r.criadaEm > desde),
    enviar: async (_o, _c, msg, seq) => {
      if (bloquear) return "bloqueada";
      enviadas.push({ ...msg, seq });
      return "enviada";
    },
    copiarMidia: async (_o, conv, path) => ({ storage_path: `${ORG}/${conv}/copia-${path.split("/").pop()}`, mime: "image/png" }),
    presenca: async (_o, _c, tipo) => {
      presencas.push(tipo);
    },
    reagir: async (_o, _c, m, emoji) => {
      reacoes.push(`${m.id}:${emoji}`);
    },
    dormir: async (ms) => {
      relogio += ms;
    },
    salvarCampo: async (_o, _c, k, v) => {
      campos[k] = v;
    },
    mudarEtiquetas: async (_o, _c, op, et) => {
      tags = op === "adicionar" ? [...new Set([...tags, ...et])] : tags.filter((t) => !et.includes(t));
    },
    atualizar: async (_o, _id, patch) => {
      Object.assign(enrollment, patch);
    },
    evento: async (_o, _e, noId, tipo, payload) => {
      eventos.push({ no: noId, tipo, payload });
    },
    eventos: async (_o, _e, noId, tipo) => eventos.filter((e) => e.no === noId && e.tipo === tipo).map((e) => e.payload),
    agendar: async (_o, _e, motivo, quando) => {
      agendados.push({ motivo, quando });
    },
    agora: () => new Date(relogio),
  };

  return {
    deps,
    enrollment,
    enviadas,
    eventos,
    agendados,
    campos,
    presencas,
    reacoes,
    get tags() {
      return tags;
    },
    passar(ms: number) {
      relogio += ms;
    },
    leadDiz(texto: string, id = `m${respostas.length + 1}`) {
      relogio += 1000;
      respostas.push({ id, texto, externalId: `ext-${id}`, criadaEm: new Date(relogio).toISOString() });
    },
    bloquear() {
      bloquear = true;
    },
    passo: (motivo: MotivoDoPasso = { tipo: "seguir" }) => executarPasso(deps, ORG, "e1", motivo),
  };
}

describe("motor dos fluxos — Mensagem", () => {
  it("envia os itens em ordem, com variáveis interpoladas, e conclui no Fim", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("m", "mensagem", {
            itens: [
              { id: "a", tipo: "texto", texto: "Oi, {primeiro_nome}!" },
              { id: "b", tipo: "intervalo", modo: "fixo", segundos: 2 },
              { id: "c", tipo: "texto", texto: "Seu código é {codigo}." },
            ],
          }),
          no("f", "end", { outcome: "exhausted" }),
        ],
        [sempre("t", "m"), sempre("m", "f")],
      ),
    );
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    // `{codigo}` não existe: vira vazio, nunca o token cru.
    expect(m.enviadas.map((e) => e.body)).toEqual(["Oi, Maria!", "Seu código é."]);
    expect(m.enviadas.map((e) => e.seq)).toEqual([1, 2]);
    expect(m.presencas).toContain("typing");
    expect(m.enrollment.status).toBe("completed");
  });

  it("mídia do Storage é copiada para a conversa antes de sair", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("m", "mensagem", {
            itens: [{ id: "a", tipo: "imagem", midia: { storage_path: `${ORG}/fluxos/f1/x.png` }, legenda: "Para {nome}" }],
          }),
          no("f", "end", { outcome: "exhausted" }),
        ],
        [sempre("t", "m"), sempre("m", "f")],
      ),
    );
    await m.passo();
    expect(m.enviadas[0]).toMatchObject({
      type: "image",
      media_storage_path: `${ORG}/conv1/copia-x.png`,
      body: "Para Maria Silva",
    });
  });

  it("intervalo que estoura o teto do job não dorme: agenda a continuação no item seguinte", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("m", "mensagem", {
            itens: [
              { id: "a", tipo: "texto", texto: "um" },
              { id: "b", tipo: "intervalo", modo: "fixo", segundos: 200 },
              { id: "c", tipo: "intervalo", modo: "fixo", segundos: 200 },
              { id: "d", tipo: "texto", texto: "dois" },
            ],
          }),
          no("f", "end", { outcome: "exhausted" }),
        ],
        [sempre("t", "m"), sempre("m", "f")],
      ),
    );
    expect(await m.passo()).toEqual({ tipo: "continua_depois" });
    expect(m.enviadas.map((e) => e.body)).toEqual(["um"]);
    expect(m.agendados.at(-1)?.motivo).toEqual({ tipo: "seguir", noId: "m", item: 3 });
    expect(m.enrollment.current_node_id).toBe("m");
    // O job seguinte retoma do item 3 — não repete "um".
    expect(await m.passo({ tipo: "seguir", noId: "m", item: 3 })).toEqual({ tipo: "concluido" });
    expect(m.enviadas.map((e) => e.body)).toEqual(["um", "dois"]);
  });

  it("contato bloqueado (opt-out) encerra o fluxo e não manda mais nada", async () => {
    const m = mundo(
      grafo(
        [no("t", "trigger"), no("m", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "oi" }] }), no("f", "end", {})],
        [sempre("t", "m"), sempre("m", "f")],
      ),
    );
    m.bloquear();
    expect(await m.passo()).toEqual({ tipo: "parado", motivo: "contato_bloqueado" });
    expect(m.enrollment.status).toBe("cancelled");
  });
});

describe("motor dos fluxos — Etiquetas", () => {
  it("adiciona e remove etiquetas do contato", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("a", "etiquetas", { operacao: "adicionar", etiquetas: ["lead_quente"] }),
          no("r", "etiquetas", { operacao: "remover", etiquetas: ["antiga"] }),
          no("f", "end", {}),
        ],
        [sempre("t", "a"), sempre("a", "r"), sempre("r", "f")],
      ),
    );
    await m.passo();
    expect(m.tags).toEqual(["lead_quente"]);
  });
});

describe("motor dos fluxos — Aguardar resposta", () => {
  const fluxoDePergunta = (config: Record<string, unknown>) =>
    grafo(
      [
        no("t", "trigger"),
        no("q", "aguardar_resposta", { sem_limite: false, tempo: { valor: 1, unidade: "horas" }, responder_citando: false, ...config }),
        no("sim", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "Prazer, {nome_completo}!" }] }),
        no("nao", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "Sumiu?" }] }),
        no("f", "end", {}),
      ],
      [sempre("t", "q"), ramo("q", "sim", "respondeu"), ramo("q", "nao", "sem_resposta"), sempre("sim", "f"), sempre("nao", "f")],
    );

  it("pergunta, estaciona, agenda o tempo máximo; a resposta segue por 'Respondeu' e é salva no campo", async () => {
    const m = mundo(fluxoDePergunta({ mensagem_antes: "Qual é o seu nome?", salvar_em: "nome_completo" }));
    expect(await m.passo()).toEqual({ tipo: "aguardando", noId: "q" });
    expect(m.enviadas.map((e) => e.body)).toEqual(["Qual é o seu nome?"]);
    expect(m.enrollment.status).toBe("waiting_reply");
    const tempo = m.agendados.at(-1)!;
    expect(tempo.motivo).toEqual({ tipo: "tempo_esgotado", noId: "q", visita: 1 });
    expect(tempo.quando.getTime() - new Date("2026-10-03T12:00:00Z").getTime()).toBe(3_600_000);

    m.leadDiz("Ana Souza");
    expect(await m.passo({ tipo: "resposta", mensagemId: "m1" })).toEqual({ tipo: "concluido" });
    expect(m.campos.nome_completo).toBe("Ana Souza");
    expect(m.enviadas.map((e) => e.body)).toEqual(["Qual é o seu nome?", "Prazer, Ana Souza!"]);

    // O tempo esgotado que acorda depois é de uma espera que já acabou: ignorado.
    expect(await m.passo(tempo.motivo)).toMatchObject({ tipo: "ignorado" });
  });

  it("tempo esgotado sem resposta segue por 'Não respondeu'", async () => {
    const m = mundo(fluxoDePergunta({}));
    await m.passo();
    m.passar(3_600_000);
    expect(await m.passo({ tipo: "tempo_esgotado", noId: "q", visita: 1 })).toEqual({ tipo: "concluido" });
    expect(m.enviadas.map((e) => e.body)).toEqual(["Sumiu?"]);
  });

  it("resposta que chegou ANTES da pergunta não conta", async () => {
    const m = mundo(fluxoDePergunta({}));
    m.leadDiz("mensagem velha");
    await m.passo();
    expect(await m.passo({ tipo: "resposta", mensagemId: null })).toEqual({ tipo: "ignorado", motivo: "sem_resposta_nova" });
    expect(m.enrollment.status).toBe("waiting_reply");
  });

  it("buffer: a primeira mensagem só agenda; o job do buffer junta todas", async () => {
    const m = mundo(fluxoDePergunta({ buffer: { ativo: true, segundos: 10 }, salvar_em: "nome_completo" }));
    await m.passo();
    m.leadDiz("Ana");
    expect(await m.passo({ tipo: "resposta", mensagemId: "m1" })).toEqual({ tipo: "aguardando", noId: "q" });
    m.leadDiz("Souza");
    // A segunda mensagem não agenda outro buffer.
    await m.passo({ tipo: "resposta", mensagemId: "m2" });
    const buffers = m.agendados.filter((a) => a.motivo.tipo === "buffer");
    expect(buffers).toHaveLength(1);
    expect(await m.passo(buffers[0]!.motivo)).toEqual({ tipo: "concluido" });
    expect(m.campos.nome_completo).toBe("Ana\nSouza");
  });

  it("reage e responde citando a mensagem do lead", async () => {
    const m = mundo(fluxoDePergunta({ reagir: { ativo: true, emoji: "❤️" }, responder_citando: true }));
    await m.passo();
    m.leadDiz("oi");
    await m.passo({ tipo: "resposta", mensagemId: "m1" });
    expect(m.reacoes).toEqual(["m1:❤️"]);
    expect(m.enviadas.at(-1)?.reply_to_message_id).toBe("m1");
  });

  it("mensagem no meio de um envio (fluxo andando) é ignorada pelo motor", async () => {
    const m = mundo(fluxoDePergunta({}));
    expect(await m.passo({ tipo: "resposta", mensagemId: "m1" })).toEqual({ tipo: "ignorado", motivo: "fluxo_em_andamento" });
  });
});

describe("motor dos fluxos — guardas", () => {
  it("bloco sem executor nesta fase para alto (dead), sem enviar", async () => {
    const m = mundo(grafo([no("t", "trigger"), no("p", "pixel", {})], [sempre("t", "p")]));
    expect(await m.passo()).toEqual({ tipo: "parado", motivo: "bloco_sem_executor:pixel" });
    expect(m.enrollment.status).toBe("dead");
  });

  it("bloco sem saída termina o fluxo em vez de prender o lead", async () => {
    const m = mundo(grafo([no("t", "trigger"), no("a", "etiquetas", { operacao: "adicionar", etiquetas: ["x"] })], [sempre("t", "a")]));
    expect(await m.passo()).toEqual({ tipo: "concluido" });
  });

  it("inscrição encerrada não anda", async () => {
    const m = mundo(grafo([no("t", "trigger"), no("f", "end", {})], [sempre("t", "f")]));
    m.enrollment.status = "cancelled";
    expect(await m.passo()).toEqual({ tipo: "ignorado", motivo: "status_cancelled" });
  });

  it("intervalo aleatório fica entre o mínimo e o máximo, com teto inline", () => {
    const item = { id: "i", tipo: "intervalo", modo: "aleatorio", min_segundos: 2, max_segundos: 6 } as const;
    expect(atrasoDoIntervalo(item, () => 0)).toBe(2000);
    expect(atrasoDoIntervalo(item, () => 1)).toBe(6000);
    expect(MAX_ESPERA_POR_JOB_MS).toBeLessThan(600_000);
  });
});
