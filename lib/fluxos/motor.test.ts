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
  type OrigemDoFluxo,
  type RespostaDoLead,
} from "./motor";
import type { RespostaDaIa } from "./bloco-ia";

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
    pointer_id: "p1",
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
  let nome: string | null = "Maria Silva";
  const respostas: RespostaDoLead[] = [];
  const presencas: string[] = [];
  const reacoes: string[] = [];
  let bloquear = false;
  let recusar: string | null = null;
  const conversaAtual = { status: "open", atendente: null as string | null, ultimaEntradaEm: null as string | null };
  let totalDistribuido = 0;
  let distribuidoAoContato: string | null = null;
  const publicados = new Set<string>();
  const iniciados: Array<{ fluxoId: string; origem: OrigemDoFluxo }> = [];
  let origemDesta: OrigemDoFluxo | null = null;
  const retomados: string[] = [];
  const chamadoresCancelados: string[] = [];
  const kanbans: unknown[] = [];
  const notificacoes: Array<{ numero: string; texto: string }> = [];
  const pixels: Array<{ evento: string; eventoId: string; valor: string | null; pageId: string | null }> = [];
  let pixelFalha: string | null = null;
  const pedidosDeIa: unknown[] = [];
  let respostaDaIa: RespostaDaIa = { ok: true, resposta: "Olá!", rota: null, modelo: "m", origem: "credencial" };

  const deps: DepsDoMotor = {
    carregarEnrollment: async () => ({ ...enrollment }),
    carregarGrafo: async () => g,
    carregarContato: async () => ({ nome, telefone: "5511999999999", email: "maria@ex.com", etiquetas: [...tags], campos }),
    carregarConversa: async () => ({ ...conversaAtual }),
    fusoDaOrganizacao: async () => "America/Sao_Paulo",
    distribuicoes: async () => ({ total: totalDistribuido, doContato: distribuidoAoContato }),
    fluxoPublicado: async (_o, id) => publicados.has(id),
    iniciarFluxo: async (_o, input) => {
      iniciados.push({ fluxoId: input.fluxoId, origem: input.origem });
      return { ok: true, enrollmentId: `novo-${iniciados.length}` };
    },
    origem: async () => origemDesta,
    retomar: async (_o, id, noId) => {
      retomados.push(`${id}@${noId}`);
      return true;
    },
    cancelarChamador: async (_o, id) => {
      chamadoresCancelados.push(id);
    },
    kanban: async (_o, _e, config) => {
      kanbans.push(config);
      return { ok: true, detalhe: "ok" };
    },
    notificarEquipe: async (_o, _c, numero, texto) => {
      notificacoes.push({ numero, texto });
      return { ok: true, detalhe: numero };
    },
    enviarPixel: async (_o, _c, pedido) => {
      if (pixelFalha) return { ok: false, detalhe: pixelFalha };
      pixels.push({ evento: pedido.evento, eventoId: pedido.eventoId, valor: pedido.valor, pageId: pedido.pageId });
      return { ok: true, detalhe: "enviado:telefone" };
    },
    chamarIa: async (_o, _c, pedido) => {
      pedidosDeIa.push(pedido);
      return respostaDaIa;
    },
    respostasDesde: async (_o, _c, desde) => respostas.filter((r) => r.criadaEm > desde),
    enviar: async (_o, _c, msg, seq) => {
      if (bloquear) return "bloqueada";
      if (recusar) return { recusada: recusar };
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
      // Como o real (fork jhoow): nome_completo/nome é a COLUNA do nome — fonte única.
      if (k === "nome_completo" || k === "nome" || k === "nome_profissional") nome = v;
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
    recusar(codigo: string) {
      recusar = codigo;
    },
    passo: (motivo: MotivoDoPasso = { tipo: "seguir" }) => executarPasso(deps, ORG, "e1", motivo),
    conversaAtual,
    distribuir(total: number, doContato: string | null = null) {
      totalDistribuido = total;
      distribuidoAoContato = doContato;
    },
    publicar(id: string) {
      publicados.add(id);
    },
    iniciados,
    chamadaPor(origem: OrigemDoFluxo) {
      origemDesta = origem;
    },
    retomados,
    chamadoresCancelados,
    kanbans,
    notificacoes,
    pixels,
    falharPixel(detalhe: string) {
      pixelFalha = detalhe;
    },
    pedidosDeIa,
    iaResponde(r: RespostaDaIa) {
      respostaDaIa = r;
    },
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
  it("canal em modo de teste: o envio recusado encerra o fluxo com o motivo, sem a fila refazer", async () => {
    const m = mundo(
      grafo(
        [no("t", "trigger"), no("m", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "oi" }] }), no("f", "end", {})],
        [sempre("t", "m"), sempre("m", "f")],
      ),
    );
    m.recusar("pre_go_live");
    expect(await m.passo()).toEqual({ tipo: "parado", motivo: "pre_go_live" });
    expect(m.enrollment.status).toBe("cancelled");
    expect(m.eventos.at(-1)).toMatchObject({ tipo: "encerrado", payload: { motivo: "pre_go_live" } });
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

  it("tempo máximo em SEGUNDOS (fork jhoow): 30 s agendam o tempo esgotado 30 s depois", async () => {
    const m = mundo(fluxoDePergunta({ tempo: { valor: 30, unidade: "segundos" } }));
    await m.passo();
    const tempo = m.agendados.at(-1)!;
    expect(tempo.quando.getTime() - new Date("2026-10-03T12:00:00Z").getTime()).toBe(30_000);
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

  it("aguardar sem limite: uma saída só (a comum) leva quem respondeu", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("q", "aguardar_resposta", { sem_limite: true, responder_citando: false }),
          no("e", "etiquetas", { operacao: "adicionar", etiquetas: ["respondeu"] }),
          no("f", "end", {}),
        ],
        [sempre("t", "q"), sempre("q", "e"), sempre("e", "f")],
      ),
    );
    await m.passo();
    expect(m.agendados).toHaveLength(0);
    m.leadDiz("oi");
    expect(await m.passo({ tipo: "resposta", mensagemId: "m1" })).toEqual({ tipo: "concluido" });
    expect(m.tags).toContain("respondeu");
  });

  it("mensagem no meio de um envio (fluxo andando) é ignorada pelo motor", async () => {
    const m = mundo(fluxoDePergunta({}));
    expect(await m.passo({ tipo: "resposta", mensagemId: "m1" })).toEqual({ tipo: "ignorado", motivo: "fluxo_em_andamento" });
  });
});

describe("motor dos fluxos — guardas", () => {
  it("bloco sem executor nesta fase para alto (dead), sem enviar", async () => {
    const m = mundo(grafo([no("t", "trigger"), no("p", "wait", {})], [sempre("t", "p")]));
    expect(await m.passo()).toEqual({ tipo: "parado", motivo: "bloco_sem_executor:wait" });
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

describe("motor dos fluxos — Fase C", () => {
  const fim = () => no("f", "end", {});

  it("Intervalo por duração estaciona, agenda e só segue com o job da MESMA espera", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("i", "intervalo", { modo: "duracao", valor: 2, unidade: "horas" }),
          no("m", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "voltei" }] }),
          fim(),
        ],
        [sempre("t", "i"), sempre("i", "m"), sempre("m", "f")],
      ),
    );
    expect(await m.passo()).toEqual({ tipo: "aguardando", noId: "i" });
    const job = m.agendados.at(-1)!;
    expect(job.motivo).toEqual({ tipo: "intervalo", noId: "i", visita: 1 });
    expect(job.quando.toISOString()).toBe("2026-10-03T14:00:00.000Z");
    expect(m.enviadas).toHaveLength(0);
    expect(await m.passo({ tipo: "intervalo", noId: "i", visita: 7 })).toMatchObject({ tipo: "ignorado" });
    expect(await m.passo(job.motivo)).toEqual({ tipo: "concluido" });
    expect(m.enviadas.map((e) => e.body)).toEqual(["voltei"]);
  });

  it("Intervalo por horários: dentro da janela segue na hora", async () => {
    // 12:00Z = 09:00 em São Paulo, sábado (dia 6).
    const m = mundo(
      grafo(
        [no("t", "trigger"), no("i", "intervalo", { modo: "horarios", janelas: [{ dia: 6, inicio: "08:00", fim: "18:00" }] }), fim()],
        [sempre("t", "i"), sempre("i", "f")],
      ),
    );
    expect(await m.passo()).toEqual({ tipo: "concluido" });
  });

  it("Condicional segue por Sim ou Não conforme etiqueta e hora", async () => {
    const g = grafo(
      [
        no("t", "trigger"),
        no("c", "condicional", {
          regra: "todas",
          condicoes: [
            { id: "c1", campo: { tipo: "etiqueta" }, operador: "contem", valor: "antiga" },
            { id: "c2", campo: { tipo: "hora" }, operador: "entre", valor: "08:00", valor_ate: "18:00" },
          ],
        }),
        no("sim", "etiquetas", { operacao: "adicionar", etiquetas: ["passou"] }),
        no("nao", "etiquetas", { operacao: "adicionar", etiquetas: ["barrou"] }),
        fim(),
      ],
      [sempre("t", "c"), ramo("c", "sim", "sim"), ramo("c", "nao", "nao"), sempre("sim", "f"), sempre("nao", "f")],
    );
    const m = mundo(g);
    await m.passo();
    expect(m.tags).toContain("passou");
    const m2 = mundo(g);
    m2.passar(12 * 3_600_000); // 21:00 em São Paulo
    await m2.passo();
    expect(m2.tags).toContain("barrou");
  });

  it("Distribuidor: rodízio pelo total; fixo por contato devolve a mesma saída", async () => {
    const g = (modo: string) =>
      grafo(
        [
          no("t", "trigger"),
          no("d", "distribuidor", { modo, saidas: [{ id: "a", nome: "Ana" }, { id: "b", nome: "Bruno" }] }),
          no("ea", "etiquetas", { operacao: "adicionar", etiquetas: ["ana"] }),
          no("eb", "etiquetas", { operacao: "adicionar", etiquetas: ["bruno"] }),
          fim(),
        ],
        [sempre("t", "d"), ramo("d", "ea", "a"), ramo("d", "eb", "b"), sempre("ea", "f"), sempre("eb", "f")],
      );
    const r = mundo(g("proximo"));
    r.distribuir(3);
    await r.passo();
    expect(r.tags).toContain("bruno");
    const f = mundo(g("fixo_por_contato"));
    f.distribuir(3, "a");
    await f.passo();
    expect(f.tags).toContain("ana");
    expect(f.eventos.find((e) => e.tipo === "distribuido")?.payload).toEqual({ saida: "a", contato: "c1" });
  });

  it("Conexão sem voltar: este fluxo termina e o outro começa herdando o retorno pendente", async () => {
    const m = mundo(
      grafo([no("t", "trigger"), no("x", "conexao_fluxo", { fluxo_id: "outro", retornar: false })], [sempre("t", "x")]),
    );
    m.publicar("outro");
    m.chamadaPor({ origem: "conexao", saltos: 1, retorno: { enrollment_id: "avo", no_id: "n9" } });
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    expect(m.enrollment.status).toBe("completed");
    expect(m.iniciados[0]).toMatchObject({ fluxoId: "outro", origem: { saltos: 2, retorno: { enrollment_id: "avo", no_id: "n9" } } });
    // Terminou passando a vez: quem esperava lá atrás NÃO é acordado agora.
    expect(m.retomados).toEqual([]);
  });

  it("Conexão com voltar: dorme no bloco; o retorno segue pela saída", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("x", "conexao_fluxo", { fluxo_id: "outro", retornar: true }),
          no("m", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "de volta" }] }),
          fim(),
        ],
        [sempre("t", "x"), sempre("x", "m"), sempre("m", "f")],
      ),
    );
    m.publicar("outro");
    expect(await m.passo()).toEqual({ tipo: "aguardando", noId: "x" });
    expect(m.enrollment.status).toBe("dormente");
    expect(m.iniciados[0]?.origem.retorno).toEqual({ enrollment_id: "e1", no_id: "x" });
    m.enrollment.status = "active"; // o `retomar` do chamado faz isto
    expect(await m.passo({ tipo: "retorno", noId: "x" })).toEqual({ tipo: "concluido" });
    expect(m.enviadas.map((e) => e.body)).toEqual(["de volta"]);
  });

  it("fluxo chamado com voltar: ao chegar ao Fim acorda quem chamou; ao ser cancelado, cancela quem chamou", async () => {
    const g = grafo([no("t", "trigger"), fim()], [sempre("t", "f")]);
    const m = mundo(g);
    m.chamadaPor({ origem: "conexao", saltos: 1, retorno: { enrollment_id: "pai", no_id: "x" } });
    await m.passo();
    expect(m.retomados).toEqual(["pai@x"]);

    const c = mundo(grafo([no("t", "trigger"), no("m", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "oi" }] }), fim()], [sempre("t", "m"), sempre("m", "f")]));
    c.chamadaPor({ origem: "conexao", saltos: 1, retorno: { enrollment_id: "pai", no_id: "x" } });
    c.bloquear();
    await c.passo();
    expect(c.chamadoresCancelados).toEqual(["pai"]);
  });

  it("Conexão para fluxo não publicado sem voltar termina o fluxo sem prender o contato", async () => {
    const m = mundo(grafo([no("t", "trigger"), no("x", "conexao_fluxo", { fluxo_id: "rascunho", retornar: false })], [sempre("t", "x")]));
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    expect(m.iniciados).toHaveLength(0);
    expect(m.eventos.some((e) => e.tipo === "conexao_falhou")).toBe(true);
  });

  it("laço de Conexões para no teto de saltos", async () => {
    const m = mundo(grafo([no("t", "trigger"), no("x", "conexao_fluxo", { fluxo_id: "outro", retornar: false })], [sempre("t", "x")]));
    m.publicar("outro");
    m.chamadaPor({ origem: "conexao", saltos: 20 });
    expect(await m.passo()).toEqual({ tipo: "parado", motivo: "conexoes_demais" });
    expect(m.enrollment.status).toBe("dead");
  });

  it("Kanban e Notificação seguem o fluxo, com o texto interpolado", async () => {
    const m = mundo(
      grafo(
        [
          no("t", "trigger"),
          no("k", "kanban", { acao: "adicionar", pipeline_id: "00000000-0000-4000-8000-0000000000aa" }),
          no("n", "notificacao", { nome: "Ana", ddi: "55", numero: "11988887777", mensagem: "Lead {nome} chegou" }),
          fim(),
        ],
        [sempre("t", "k"), sempre("k", "n"), sempre("n", "f")],
      ),
    );
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    expect(m.kanbans).toHaveLength(1);
    expect(m.notificacoes).toEqual([{ numero: "+5511988887777", texto: "Lead Maria Silva chegou" }]);
  });
});

describe("motor dos fluxos — Fase D: Pixel", () => {
  const fim = () => no("f", "end", { outcome: "exhausted" });

  it("manda o evento com valor e page_id interpolados e segue", async () => {
    const m = mundo(
      grafo(
        [no("t", "trigger"), no("p", "pixel", { evento: "Purchase", valor: "{valor_pacote}", moeda: "BRL", page_id: "123" }), fim()],
        [sempre("t", "p"), sempre("p", "f")],
      ),
    );
    m.campos.valor_pacote = "R$ 29,90";
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    expect(m.pixels).toEqual([{ evento: "Purchase", eventoId: "fluxo:e1:p:1", valor: "R$ 29,90", pageId: "123" }]);
    expect(m.eventos.some((e) => e.tipo === "pixel")).toBe(true);
  });

  it("pixel que falha NÃO prende o contato: registra e segue", async () => {
    const m = mundo(
      grafo([no("t", "trigger"), no("p", "pixel", { evento: "Lead", moeda: "BRL" }), fim()], [sempre("t", "p"), sempre("p", "f")]),
    );
    m.falharPixel("sem_conexao_meta:sem_conexao");
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    expect(m.eventos.find((e) => e.tipo === "pixel_falhou")?.payload).toMatchObject({ detalhe: "sem_conexao_meta:sem_conexao" });
  });
});

describe("motor dos fluxos — Fase D: Bloco de IA", () => {
  const fim = (id = "f") => no(id, "end", { outcome: "exhausted" });
  const ia = (extra: Record<string, unknown> = {}) =>
    no("ia", "bloco_ia", {
      provedor: "anthropic",
      modelo: "claude-sonnet-5-5",
      mensagem: "{ultima_mensagem}",
      salvar_em: "ai.response",
      enviar_resposta: true,
      prompt: "Você atende {nome}.",
      entender: { audio: false, imagem: false, pdf: false },
      condicionais: [],
      contexto: { ativo: true, interacoes: 4 },
      ...extra,
    });

  it("responde o lead, salva no campo e segue pela saída comum; a variável já vale no bloco seguinte", async () => {
    const m = mundo(
      grafo(
        [no("t", "trigger"), ia(), no("m", "mensagem", { itens: [{ id: "a", tipo: "texto", texto: "Você disse: {ai.response}" }] }), fim(), fim("x")],
        [sempre("t", "ia"), sempre("ia", "m"), ramo("ia", "x", "falha"), sempre("m", "f")],
      ),
    );
    expect(await m.passo()).toEqual({ tipo: "concluido" });
    expect(m.pedidosDeIa[0]).toMatchObject({ instrucoes: "Você atende Maria Silva.", historico: 4, credencialId: null });
    expect(m.campos["ai.response"]).toBe("Olá!");
    expect(m.enviadas.map((e) => e.body)).toEqual(["Olá!", "Você disse: Olá!"]);
  });

  it("a rota escolhida pela IA decide a saída; sem rota vai pela de escape", async () => {
    const g = grafo(
      [
        no("t", "trigger"),
        ia({ enviar_resposta: false, condicionais: [{ id: "compra", nome: "Quer comprar", descricao: "pede preço ou pagamento" }] }),
        fim("fc"),
        fim("fo"),
        fim("fx"),
      ],
      [sempre("t", "ia"), ramo("ia", "fc", "compra"), sempre("ia", "fo"), ramo("ia", "fx", "falha")],
    );
    const a = mundo(g);
    a.iaResponde({ ok: true, resposta: "ok", rota: "compra", modelo: "m", origem: "credencial" });
    await a.passo();
    expect(a.eventos.filter((e) => e.tipo === "no_entrou").map((e) => e.no)).toEqual(["t", "ia", "fc"]);
    const b = mundo(g);
    b.iaResponde({ ok: true, resposta: "ok", rota: null, modelo: "m", origem: "credencial" });
    await b.passo();
    expect(b.eventos.filter((e) => e.tipo === "no_entrou").map((e) => e.no)).toEqual(["t", "ia", "fo"]);
    expect(b.enviadas).toHaveLength(0);
  });

  it("falha da IA segue por 'Falhou' sem mandar nada", async () => {
    const m = mundo(
      grafo([no("t", "trigger"), ia(), fim("fo"), fim("fx")], [sempre("t", "ia"), sempre("ia", "fo"), ramo("ia", "fx", "falha")]),
    );
    m.iaResponde({ ok: false, detalhe: "sem_credencial:anthropic" });
    await m.passo();
    expect(m.eventos.filter((e) => e.tipo === "no_entrou").map((e) => e.no)).toEqual(["t", "ia", "fx"]);
    expect(m.enviadas).toHaveLength(0);
    expect(m.eventos.find((e) => e.tipo === "ia_falhou")?.payload).toEqual({ detalhe: "sem_credencial:anthropic" });
  });
});
