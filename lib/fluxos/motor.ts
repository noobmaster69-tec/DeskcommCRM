/**
 * O MOTOR dos fluxos (fork jhoow, Etapa 2 — Fase B).
 *
 * Executa um enrollment de superfície `fluxo` A PARTIR DE ONDE ELE ESTÁ, até
 * parar: num bloco que espera (Aguardar resposta), no Fim, ou no teto de passos
 * por job. Roda dentro do job `fluxo_step` do worker — na hora, e não no relógio
 * de minuto do follow-up — e é chamado de três jeitos (`MotivoDoPasso`):
 *   - `seguir`: começar (disparo) ou continuar depois do teto de passos;
 *   - `resposta`: o lead mandou mensagem e o fluxo está aguardando;
 *   - `tempo_esgotado` / `buffer`: um job agendado acordou o bloco que espera.
 *
 * Tudo que toca o mundo entra por `DepsDoMotor` — é o que permite testar cada
 * bloco sem banco nem WhatsApp. A implementação real está em `motor-supabase.ts`.
 *
 * Exatamente-uma-vez: cada mensagem enviada leva um número de sequência dentro
 * do job (`seq`), e o envio real passa pelo `send_ledger` (job, seq) — um job
 * que falha no meio e é refeito NÃO repete o que já saiu.
 */
import {
  AGUARDAR_RESPONDEU_BRANCH_ID,
  BLOCO_IA_FALHA_BRANCH_ID,
  AGUARDAR_SEM_RESPOSTA_BRANCH_ID,
  CONDICIONAL_NAO_BRANCH_ID,
  CONDICIONAL_SIM_BRANCH_ID,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
} from "@/lib/followup/graph-schema";
import type { ItemDaMensagem } from "@/lib/followup/blocos-do-fluxo";
import { interpolar, type ContextoDeVariaveis } from "./variaveis";
import { avaliarCondicional } from "./condicao";
import { fimDoIntervalo } from "./intervalo";
import type { PedidoDePixel } from "./pixel";
import type { PedidoDeIa, RespostaDaIa } from "./bloco-ia";

export type StatusDoEnrollment =
  | "active"
  | "waiting_reply"
  /** Fase C: o fluxo chamou outro com "voltar" e espera ele chegar ao Fim. */
  | "dormente"
  | "completed"
  | "cancelled"
  | "dead"
  | "paused_handoff";

export interface EnrollmentDoFluxo {
  id: string;
  organization_id: string;
  version_id: string;
  pointer_id: string;
  contact_id: string;
  conversation_id: string | null;
  current_node_id: string;
  status: StatusDoEnrollment | string;
  steps_taken: number;
}

export type MotivoDoPasso =
  /** `noId` + `item`: retomar uma Mensagem no meio (a espera passou do teto do job). */
  | { tipo: "seguir"; noId?: string; item?: number }
  | { tipo: "resposta"; mensagemId: string | null }
  | { tipo: "tempo_esgotado"; noId: string; visita: number }
  | { tipo: "buffer"; noId: string; visita: number }
  /** Fase C: o Intervalo `noId` (na visita `visita`) terminou de esperar. */
  | { tipo: "intervalo"; noId: string; visita: number }
  /** Fase C: o fluxo chamado pela Conexão `noId` chegou ao Fim — seguir dali. */
  | { tipo: "retorno"; noId: string };

export interface RespostaDoLead {
  id: string;
  texto: string;
  /** Id do provedor (WhatsApp) — é o que a reação e a citação usam. */
  externalId: string | null;
  criadaEm: string;
}

export interface MensagemDeSaida {
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "contact";
  body?: string;
  media_storage_path?: string;
  /** Link https público: a cadeia de envio baixa e guarda, como no Inbox. */
  media_url?: string;
  media_mime?: string;
  shared_contact?: { name: string; phone_number: string };
  reply_to_message_id?: string;
}

export interface OrigemDoFluxo {
  origem?: string;
  /** Conexões encadeadas até aqui — o teto impede um laço A → B → A sem fim. */
  saltos?: number;
  /** Quem espera este fluxo chegar ao Fim para continuar (Conexão com "voltar"). */
  retorno?: { enrollment_id: string; no_id: string } | null;
  [k: string]: unknown;
}

export type ConfigDoKanban = Extract<FlowNode, { type: "kanban" }>["config"];

export type ResultadoDoEnvio = "enviada" | "bloqueada" | { recusada: string };

export interface DepsDoMotor {
  carregarEnrollment(org: string, id: string): Promise<EnrollmentDoFluxo | null>;
  carregarGrafo(org: string, versionId: string): Promise<FlowGraph | null>;
  carregarContato(
    org: string,
    contactId: string,
  ): Promise<{
    nome: string | null;
    telefone: string | null;
    email: string | null;
    etiquetas: string[];
    campos: Record<string, unknown>;
  }>;
  /** O estado da conversa que a Condicional lê. */
  carregarConversa(
    org: string,
    conversationId: string,
  ): Promise<{ status: string | null; atendente: string | null; ultimaEntradaEm: string | null }>;
  fusoDaOrganizacao(org: string): Promise<string>;
  /** Quantas vezes o Distribuidor `noId` deste fluxo já distribuiu, e a última saída deste contato. */
  distribuicoes(
    org: string,
    pointerId: string,
    noId: string,
    contactId: string,
  ): Promise<{ total: number; doContato: string | null }>;
  fluxoPublicado(org: string, fluxoId: string): Promise<boolean>;
  /** Inscreve o contato noutro fluxo, no Início, e enfileira o primeiro passo. */
  iniciarFluxo(
    org: string,
    input: { fluxoId: string; contactId: string; conversationId: string; origem: OrigemDoFluxo },
  ): Promise<{ ok: true; enrollmentId: string } | { ok: false; codigo: string }>;
  /** O `payload` do evento `fluxo.iniciado` desta inscrição (de onde ela veio). */
  origem(org: string, enrollmentId: string): Promise<OrigemDoFluxo | null>;
  /** Acorda o fluxo que chamou (dormente → ativo) e enfileira o passo de retorno. */
  retomar(org: string, enrollmentId: string, noId: string, contactId: string): Promise<boolean>;
  /** Encerra o fluxo que chamou e esperava (o chamado terminou sem chegar ao Fim). */
  cancelarChamador(org: string, enrollmentId: string, motivo: string): Promise<void>;
  /** Bloco Kanban: põe, move ou tira o card do contato no funil. Nunca lança. */
  kanban(org: string, enrollment: EnrollmentDoFluxo, config: ConfigDoKanban): Promise<{ ok: boolean; detalhe: string }>;
  /** Bloco Notificação: mensagem para o número da EQUIPE, pelo canal da conversa. Nunca lança. */
  notificarEquipe(org: string, conversationId: string, numeroE164: string, texto: string): Promise<{ ok: boolean; detalhe: string }>;
  /** Bloco Pixel (Fase D): evento para a Meta pela conexão da organização. Nunca lança. */
  enviarPixel(org: string, contactId: string, pedido: PedidoDePixel): Promise<{ ok: boolean; detalhe: string }>;
  /** Bloco de IA (Fase D): uma chamada de modelo com a credencial da empresa. Nunca lança. */
  chamarIa(org: string, conversationId: string, pedido: PedidoDeIa): Promise<RespostaDaIa>;
  /** Mensagens do lead (inbound) na conversa, depois de `desde`, em ordem. */
  respostasDesde(org: string, conversationId: string, desde: string): Promise<RespostaDoLead[]>;
  /**
   * Envia pela cadeia do Inbox. `bloqueada` = contato bloqueou/pediu para parar;
   * `recusada` = o envio falhou por um motivo que repetir não resolve (canal em
   * modo de teste, canal excluído, contato sem telefone). Os dois encerram o
   * fluxo; falha passageira LANÇA e a fila refaz o job.
   */
  enviar(org: string, conversationId: string, msg: MensagemDeSaida, seq: number): Promise<ResultadoDoEnvio>;
  /** Copia a mídia do fluxo para a pasta da conversa (a cadeia de envio só aceita mídia da conversa). */
  copiarMidia(org: string, conversationId: string, storagePath: string): Promise<{ storage_path: string; mime: string | null }>;
  presenca(org: string, conversationId: string, tipo: "typing" | "recording" | "paused"): Promise<void>;
  reagir(org: string, conversationId: string, mensagem: RespostaDoLead, emoji: string): Promise<void>;
  dormir(ms: number): Promise<void>;
  salvarCampo(org: string, contactId: string, chave: string, valor: string): Promise<void>;
  mudarEtiquetas(org: string, contactId: string, operacao: "adicionar" | "remover", etiquetas: string[]): Promise<void>;
  atualizar(
    org: string,
    id: string,
    patch: Partial<Pick<EnrollmentDoFluxo, "current_node_id" | "status" | "steps_taken">> & {
      completed_at?: string;
      last_error?: string | null;
      cancel_reason?: string;
    },
  ): Promise<void>;
  evento(org: string, enrollmentId: string, nodeId: string | null, tipo: string, payload: Record<string, unknown>): Promise<void>;
  /** Os eventos `tipo` do nó, do mais antigo ao mais novo. */
  eventos(org: string, enrollmentId: string, nodeId: string, tipo: string): Promise<Array<Record<string, unknown>>>;
  /** Agenda outro `fluxo_step` deste enrollment para `quando`. */
  agendar(org: string, enrollment: EnrollmentDoFluxo, motivo: MotivoDoPasso, quando: Date): Promise<void>;
  agora(): Date;
}

export type ResultadoDoPasso =
  | { tipo: "aguardando"; noId: string }
  | { tipo: "concluido" }
  | { tipo: "continua_depois" }
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "parado"; motivo: string };

/** Teto de Conexões encadeadas: A → B → A… sem espera nenhuma pararia aqui. */
export const MAX_SALTOS_DE_CONEXAO = 20;

/** Teto de blocos por job: um laço sem espera não prende o worker. */
export const PASSOS_POR_JOB = 60;
/** Teto de um intervalo DENTRO da mensagem — o resto é bloco Intervalo (Fase C). */
export const MAX_INTERVALO_INLINE_MS = 300_000;
/**
 * Teto de ESPERA somada dentro de um job. O worker devolve à fila o job que
 * passa de 10 min rodando (`QUEUE_VISIBILITY_TIMEOUT_MS`); acima deste teto o
 * motor agenda a continuação para depois do intervalo, em vez de dormir.
 */
export const MAX_ESPERA_POR_JOB_MS = 240_000;

const UNIDADE_EM_MS = { minutos: 60_000, horas: 3_600_000, dias: 86_400_000 } as const;

function proximaAresta(edges: FlowEdge[], origem: string, ramo: string | null): FlowEdge | undefined {
  const saem = edges.filter((e) => e.source === origem).sort((a, b) => a.priority - b.priority);
  if (ramo === null) return saem.find((e) => e.condition.type === "always");
  return saem.find((e) => e.condition.type === "branch" && e.condition.branch_id === ramo);
}

/** Atraso de um item Intervalo, em ms (aleatório inclusive nas pontas). */
export function atrasoDoIntervalo(item: Extract<ItemDaMensagem, { tipo: "intervalo" }>, aleatorio = Math.random): number {
  const s = item.modo === "fixo" ? item.segundos : item.min_segundos + Math.round(aleatorio() * (item.max_segundos - item.min_segundos));
  return Math.min(s * 1000, MAX_INTERVALO_INLINE_MS);
}

export async function executarPasso(
  deps: DepsDoMotor,
  org: string,
  enrollmentId: string,
  motivo: MotivoDoPasso,
): Promise<ResultadoDoPasso> {
  const enrollment = await deps.carregarEnrollment(org, enrollmentId);
  if (!enrollment) return { tipo: "ignorado", motivo: "enrollment_inexistente" };
  if (enrollment.status !== "active" && enrollment.status !== "waiting_reply")
    return { tipo: "ignorado", motivo: `status_${enrollment.status}` };
  if (!enrollment.conversation_id) {
    await encerrar(deps, enrollment, "cancelled", "sem_conversa");
    return { tipo: "parado", motivo: "sem_conversa" };
  }
  const grafo = await deps.carregarGrafo(org, enrollment.version_id);
  if (!grafo) return { tipo: "parado", motivo: "versao_inexistente" };
  const nos = new Map(grafo.nodes.map((n) => [n.id, n]));
  const conversa = enrollment.conversation_id;

  let seq = 0;
  let passos = 0;
  let dormido = 0;
  // Retomada de uma Mensagem no meio: vale só para o PRIMEIRO bloco deste job.
  let retomarNoItem =
    motivo.tipo === "seguir" && motivo.noId === enrollment.current_node_id && typeof motivo.item === "number"
      ? motivo.item
      : 0;
  let citar: RespostaDoLead | null = null;
  let ultimaMensagem: string | null = null;
  let atual = nos.get(enrollment.current_node_id);
  if (!atual) {
    await encerrar(deps, enrollment, "cancelled", "no_inexistente");
    return { tipo: "parado", motivo: "no_inexistente" };
  }

  // ── Quem está ESPERANDO só anda com o motivo certo ──────────────────────
  if (enrollment.status === "waiting_reply") {
    if (atual.type !== "aguardar_resposta") return { tipo: "ignorado", motivo: "esperando_fora_do_aguardar" };
    const config = atual.config;
    const aguardando = await deps.eventos(org, enrollment.id, atual.id, "aguardando");
    const ultima = aguardando.at(-1) as { visita?: number; desde?: string } | undefined;
    const visita = ultima?.visita ?? 1;
    const desde = ultima?.desde ?? new Date(0).toISOString();

    if (motivo.tipo === "tempo_esgotado") {
      if (motivo.noId !== atual.id || motivo.visita !== visita) return { tipo: "ignorado", motivo: "tempo_de_outra_espera" };
      await deps.evento(org, enrollment.id, atual.id, "tempo_esgotado", { visita });
      const aresta = proximaAresta(grafo.edges, atual.id, AGUARDAR_SEM_RESPOSTA_BRANCH_ID);
      atual = aresta ? nos.get(aresta.target) : undefined;
    } else if (motivo.tipo === "resposta" || motivo.tipo === "buffer") {
      if (motivo.tipo === "buffer" && (motivo.noId !== atual.id || motivo.visita !== visita))
        return { tipo: "ignorado", motivo: "buffer_de_outra_espera" };
      // Buffer: a primeira mensagem só agenda; quem junta tudo é o job do buffer.
      if (motivo.tipo === "resposta" && config.buffer?.ativo) {
        const jaAgendado = (await deps.eventos(org, enrollment.id, atual.id, "buffer_agendado")).some(
          (e) => e.visita === visita,
        );
        if (!jaAgendado) {
          await deps.evento(org, enrollment.id, atual.id, "buffer_agendado", { visita });
          const quando = new Date(deps.agora().getTime() + config.buffer.segundos * 1000);
          await deps.agendar(org, enrollment, { tipo: "buffer", noId: atual.id, visita }, quando);
        }
        return { tipo: "aguardando", noId: atual.id };
      }
      const respostas = await deps.respostasDesde(org, conversa, desde);
      if (respostas.length === 0) return { tipo: "ignorado", motivo: "sem_resposta_nova" };
      const texto = respostas.map((r) => r.texto).filter(Boolean).join("\n").trim();
      const ultimaDoLead = respostas[respostas.length - 1]!;
      ultimaMensagem = texto;
      if (config.salvar_em && texto) await deps.salvarCampo(org, enrollment.contact_id, config.salvar_em, texto);
      if (config.reagir?.ativo && config.reagir.emoji) await deps.reagir(org, conversa, ultimaDoLead, config.reagir.emoji);
      if (config.responder_citando) citar = ultimaDoLead;
      await deps.evento(org, enrollment.id, atual.id, "respondeu", { visita, mensagens: respostas.length });
      // Sem tempo máximo o bloco tem uma saída só (a comum, `always`).
      const aresta =
        proximaAresta(grafo.edges, atual.id, AGUARDAR_RESPONDEU_BRANCH_ID) ?? proximaAresta(grafo.edges, atual.id, null);
      atual = aresta ? nos.get(aresta.target) : undefined;
    } else {
      return { tipo: "ignorado", motivo: "esperando_resposta" };
    }
    if (!atual) {
      await encerrar(deps, enrollment, "completed", "sem_saida");
      return { tipo: "concluido" };
    }
    await deps.atualizar(org, enrollment.id, { status: "active", current_node_id: atual.id });
  } else if (motivo.tipo === "intervalo" || motivo.tipo === "retorno") {
    // Fase C: a espera do Intervalo acabou / o fluxo chamado voltou. Só vale
    // para a inscrição PARADA naquele bloco — job de uma espera antiga é ignorado.
    const tipoEsperado = motivo.tipo === "intervalo" ? "intervalo" : "conexao_fluxo";
    if (atual.id !== motivo.noId || atual.type !== tipoEsperado)
      return { tipo: "ignorado", motivo: `${motivo.tipo}_de_outro_bloco` };
    if (motivo.tipo === "intervalo") {
      const agendados = await deps.eventos(org, enrollment.id, atual.id, "intervalo_agendado");
      if ((agendados.at(-1) as { visita?: number } | undefined)?.visita !== motivo.visita)
        return { tipo: "ignorado", motivo: "intervalo_de_outra_espera" };
    }
    const aresta = proximaAresta(grafo.edges, atual.id, null);
    atual = aresta ? nos.get(aresta.target) : undefined;
    if (!atual) {
      await encerrar(deps, enrollment, "completed", "sem_saida");
      return { tipo: "concluido" };
    }
  } else if (motivo.tipo !== "seguir") {
    // Fluxo andando (mandando mensagens): resposta no meio é ignorada pelo motor.
    // O agente de IA também não responde — quem decide isso é o drain.
    return { tipo: "ignorado", motivo: "fluxo_em_andamento" };
  }

  const contato = await deps.carregarContato(org, enrollment.contact_id);
  let etiquetasAtuais = contato.etiquetas;
  const contexto = (): ContextoDeVariaveis => ({
    nome: contato.nome,
    telefone: contato.telefone,
    campos: contato.campos,
    ultimaMensagem,
  });

  // ── O laço: executa blocos até parar ─────────────────────────────────────
  for (;;) {
    if (passos >= PASSOS_POR_JOB) {
      await deps.atualizar(org, enrollment.id, { current_node_id: atual.id, steps_taken: enrollment.steps_taken + passos });
      await deps.agendar(org, enrollment, { tipo: "seguir" }, deps.agora());
      return { tipo: "continua_depois" };
    }
    passos++;
    await deps.evento(org, enrollment.id, atual.id, "no_entrou", { tipo: atual.type });
    const no: FlowNode = atual;
    let ramo: string | null = null;

    switch (no.type) {
      case "trigger":
        break;

      case "mensagem": {
        const itens = no.config.itens;
        const inicio = retomarNoItem;
        retomarNoItem = 0;
        for (let i = inicio; i < itens.length; i++) {
          const item = itens[i]!;
          if (item.tipo === "intervalo") {
            const atraso = atrasoDoIntervalo(item);
            if (dormido + atraso > MAX_ESPERA_POR_JOB_MS) {
              // Não dorme: agenda a continuação no item seguinte, depois do intervalo.
              await deps.atualizar(org, enrollment.id, { current_node_id: no.id, steps_taken: enrollment.steps_taken + passos });
              await deps.agendar(org, enrollment, { tipo: "seguir", noId: no.id, item: i + 1 }, new Date(deps.agora().getTime() + atraso));
              return { tipo: "continua_depois" };
            }
            const proximo = itens[i + 1];
            await deps.presenca(org, conversa, proximo?.tipo === "audio" ? "recording" : "typing");
            await deps.dormir(atraso);
            dormido += atraso;
            continue;
          }
          const saida = await montarSaida(deps, org, conversa, item, contexto());
          if (!saida) continue;
          if (citar && saida.type === "text") {
            saida.reply_to_message_id = citar.id;
            citar = null;
          }
          await deps.presenca(org, conversa, "paused");
          const r = await deps.enviar(org, conversa, saida, ++seq);
          const parada = await pararSeNaoSaiu(deps, enrollment, r);
          if (parada) return parada;
        }
        break;
      }

      case "etiquetas": {
        const etiquetas = no.config.etiquetas.map((e) => interpolar(e, contexto()).trim()).filter(Boolean);
        if (etiquetas.length > 0) {
          await deps.mudarEtiquetas(org, enrollment.contact_id, no.config.operacao, etiquetas);
          // A Condicional seguinte lê as etiquetas DEPOIS desta mudança.
          const pedidas = etiquetas.map((e) => e.toLowerCase());
          etiquetasAtuais =
            no.config.operacao === "adicionar"
              ? [...new Set([...etiquetasAtuais, ...pedidas])]
              : etiquetasAtuais.filter((t) => !pedidas.includes(t.toLowerCase()));
        }
        break;
      }

      case "aguardar_resposta": {
        const visita = (await deps.eventos(org, enrollment.id, no.id, "aguardando")).length + 1;
        if (no.config.mensagem_antes?.trim()) {
          const body = interpolar(no.config.mensagem_antes, contexto()).trim();
          if (body) {
            const r = await deps.enviar(org, conversa, { type: "text", body }, ++seq);
            const parada = await pararSeNaoSaiu(deps, enrollment, r);
            if (parada) return parada;
          }
        }
        // `desde` é DEPOIS do envio da pergunta: resposta que chegou antes dela não conta.
        const desde = deps.agora().toISOString();
        await deps.evento(org, enrollment.id, no.id, "aguardando", { visita, desde });
        await deps.atualizar(org, enrollment.id, {
          status: "waiting_reply",
          current_node_id: no.id,
          steps_taken: enrollment.steps_taken + passos,
        });
        if (!no.config.sem_limite && no.config.tempo) {
          const quando = new Date(deps.agora().getTime() + no.config.tempo.valor * UNIDADE_EM_MS[no.config.tempo.unidade]);
          await deps.agendar(org, enrollment, { tipo: "tempo_esgotado", noId: no.id, visita }, quando);
        }
        return { tipo: "aguardando", noId: no.id };
      }

      // ── Fase C ──────────────────────────────────────────────────────────
      case "intervalo": {
        const fuso = await deps.fusoDaOrganizacao(org);
        const fim = fimDoIntervalo(no.config, deps.agora(), fuso, contexto());
        if (fim.tipo === "agora") {
          await deps.evento(org, enrollment.id, no.id, "intervalo_pulado", { motivo: fim.motivo ?? null });
          break;
        }
        const visita = (await deps.eventos(org, enrollment.id, no.id, "intervalo_agendado")).length + 1;
        await deps.evento(org, enrollment.id, no.id, "intervalo_agendado", { visita, ate: fim.ate.toISOString() });
        await deps.atualizar(org, enrollment.id, { current_node_id: no.id, steps_taken: enrollment.steps_taken + passos });
        await deps.agendar(org, enrollment, { tipo: "intervalo", noId: no.id, visita }, fim.ate);
        return { tipo: "aguardando", noId: no.id };
      }

      case "condicional": {
        const [conversaAtual, fuso] = await Promise.all([deps.carregarConversa(org, conversa), deps.fusoDaOrganizacao(org)]);
        const resultado = avaliarCondicional(no.config, {
          nome: contato.nome,
          telefone: contato.telefone,
          email: contato.email,
          etiquetas: etiquetasAtuais,
          campos: contato.campos,
          statusDaConversa: conversaAtual.status,
          atendente: conversaAtual.atendente,
          ultimaEntradaEm: conversaAtual.ultimaEntradaEm,
          fuso,
          agora: deps.agora(),
          variaveis: contexto(),
        });
        await deps.evento(org, enrollment.id, no.id, "condicao", { resultado });
        ramo = resultado ? CONDICIONAL_SIM_BRANCH_ID : CONDICIONAL_NAO_BRANCH_ID;
        break;
      }

      case "distribuidor": {
        const saidas = no.config.saidas;
        const { total, doContato } = await deps.distribuicoes(org, enrollment.pointer_id, no.id, enrollment.contact_id);
        const fixa = no.config.modo === "fixo_por_contato" && doContato && saidas.some((s) => s.id === doContato);
        const saida = fixa ? doContato! : saidas[total % saidas.length]!.id;
        await deps.evento(org, enrollment.id, no.id, "distribuido", { saida, contato: enrollment.contact_id });
        ramo = saida;
        break;
      }

      case "conexao_fluxo":
        return conectar(deps, enrollment, no, passos, grafo, nos);

      case "kanban": {
        const r = await deps.kanban(org, enrollment, no.config);
        await deps.evento(org, enrollment.id, no.id, r.ok ? "kanban" : "kanban_falhou", { detalhe: r.detalhe });
        break;
      }

      case "notificacao": {
        const texto = interpolar(no.config.mensagem, contexto()).trim();
        const r = texto
          ? await deps.notificarEquipe(org, conversa, `+${no.config.ddi}${no.config.numero}`, texto)
          : { ok: false, detalhe: "texto_vazio" };
        await deps.evento(org, enrollment.id, no.id, r.ok ? "notificacao" : "notificacao_falhou", { detalhe: r.detalhe });
        break;
      }

      // ── Fase D ──────────────────────────────────────────────────────────
      case "pixel": {
        // A visita entra no id do evento: o job refeito manda o MESMO id (a Meta
        // descarta a cópia); passar de novo pelo bloco num laço é outro evento.
        const anteriores =
          (await deps.eventos(org, enrollment.id, no.id, "pixel")).length +
          (await deps.eventos(org, enrollment.id, no.id, "pixel_falhou")).length;
        const valor = no.config.valor ? interpolar(no.config.valor, contexto()).trim() || null : null;
        const pageId = no.config.page_id ? interpolar(no.config.page_id, contexto()).trim() || null : null;
        const r = await deps.enviarPixel(org, enrollment.contact_id, {
          evento: no.config.evento,
          eventoId: `fluxo:${enrollment.id}:${no.id}:${anteriores + 1}`,
          valor,
          moeda: no.config.moeda,
          pageId,
          agora: deps.agora(),
        });
        await deps.evento(org, enrollment.id, no.id, r.ok ? "pixel" : "pixel_falhou", { evento: no.config.evento, detalhe: r.detalhe });
        break;
      }

      case "bloco_ia": {
        const c = no.config;
        const r = await deps.chamarIa(org, conversa, {
          provedor: c.provedor,
          credencialId: c.credencial_id ?? null,
          modelo: c.modelo,
          instrucoes: interpolar(c.prompt, contexto()).trim(),
          mensagem: interpolar(c.mensagem, contexto()).trim(),
          condicionais: c.condicionais,
          entender: c.entender,
          historico: c.contexto.ativo ? c.contexto.interacoes : 0,
        });
        if (!r.ok) {
          await deps.evento(org, enrollment.id, no.id, "ia_falhou", { detalhe: r.detalhe });
          ramo = BLOCO_IA_FALHA_BRANCH_ID;
          break;
        }
        await deps.evento(org, enrollment.id, no.id, "ia", { modelo: r.modelo, origem: r.origem, rota: r.rota });
        if (c.salvar_em && r.resposta) {
          await deps.salvarCampo(org, enrollment.contact_id, c.salvar_em, r.resposta);
          // Os blocos seguintes leem `{ai.response}` já com a resposta.
          contato.campos[c.salvar_em] = r.resposta;
        }
        if (c.enviar_resposta && r.resposta) {
          const envio = await deps.enviar(org, conversa, { type: "text", body: r.resposta }, ++seq);
          const parada = await pararSeNaoSaiu(deps, enrollment, envio);
          if (parada) return parada;
        }
        // Sem rota (ou sem condicionais) segue pela saída de escape.
        ramo = r.rota;
        break;
      }

      case "end":
        await encerrar(deps, enrollment, "completed", "fim", passos);
        return { tipo: "concluido" };

      default:
        // Bloco sem executor nesta fase: o publish o recusa; se chegar aqui, para alto.
        await encerrar(deps, enrollment, "dead", `bloco_sem_executor:${no.type}`, passos);
        return { tipo: "parado", motivo: `bloco_sem_executor:${no.type}` };
    }

    const aresta = proximaAresta(grafo.edges, no.id, ramo);
    const proximo = aresta ? nos.get(aresta.target) : undefined;
    if (!proximo) {
      // Bloco sem saída: o fluxo termina aqui (o publish exige saída, mas um
      // rascunho antigo publicado não pode deixar o lead preso).
      await encerrar(deps, enrollment, "completed", "sem_saida", passos);
      return { tipo: "concluido" };
    }
    atual = proximo;
  }
}

async function montarSaida(
  deps: DepsDoMotor,
  org: string,
  conversa: string,
  item: Exclude<ItemDaMensagem, { tipo: "intervalo" }>,
  ctx: ContextoDeVariaveis,
): Promise<MensagemDeSaida | null> {
  switch (item.tipo) {
    case "texto": {
      const body = interpolar(item.texto, ctx).trim();
      return body ? { type: "text", body } : null;
    }
    case "contato":
      return { type: "contact", shared_contact: { name: interpolar(item.nome, ctx), phone_number: item.telefone } };
    default: {
      const tipo = item.tipo === "imagem" ? "image" : item.tipo === "arquivo" ? "document" : item.tipo === "video" ? "video" : item.tipo;
      const legenda = "legenda" in item && item.legenda ? interpolar(item.legenda, ctx).trim() : undefined;
      if (item.midia.storage_path) {
        const copia = await deps.copiarMidia(org, conversa, item.midia.storage_path);
        return {
          type: tipo,
          media_storage_path: copia.storage_path,
          ...(copia.mime ? { media_mime: copia.mime } : {}),
          ...(legenda ? { body: legenda } : {}),
        };
      }
      // Link https: a cadeia de envio baixa e guarda (o mesmo caminho do Inbox).
      return { type: tipo, media_url: item.midia.url, ...(legenda ? { body: legenda } : {}) };
    }
  }
}

/** Envio que não saiu e não vai sair: encerra o fluxo com o motivo (sem a fila refazer). */
async function pararSeNaoSaiu(
  deps: DepsDoMotor,
  enrollment: EnrollmentDoFluxo,
  r: ResultadoDoEnvio,
): Promise<ResultadoDoPasso | null> {
  if (r === "enviada") return null;
  const motivo = r === "bloqueada" ? "contato_bloqueado" : r.recusada;
  await encerrar(deps, enrollment, "cancelled", motivo);
  return { tipo: "parado", motivo };
}

async function encerrar(
  deps: DepsDoMotor,
  enrollment: EnrollmentDoFluxo,
  status: "completed" | "cancelled" | "dead",
  motivo: string,
  passos = 0,
  opcoes: { semRetorno?: boolean } = {},
): Promise<void> {
  const org = enrollment.organization_id;
  await deps.atualizar(org, enrollment.id, {
    status,
    completed_at: deps.agora().toISOString(),
    steps_taken: enrollment.steps_taken + passos,
    ...(status === "completed" ? {} : { cancel_reason: motivo }),
  });
  await deps.evento(org, enrollment.id, null, status === "completed" ? "concluido" : "encerrado", { motivo });
  if (opcoes.semRetorno) return;
  // Fase C: este fluxo foi chamado por uma Conexão com "voltar"? Ao chegar ao
  // fim, quem chamou continua; se terminou de outro jeito, quem chamou também
  // termina — ele não pode ficar dormente para sempre.
  const retorno = (await deps.origem(org, enrollment.id))?.retorno;
  if (!retorno) return;
  if (status === "completed") await deps.retomar(org, retorno.enrollment_id, retorno.no_id, enrollment.contact_id);
  else await deps.cancelarChamador(org, retorno.enrollment_id, "fluxo_chamado_encerrado");
}

/**
 * Conexão de fluxo (Fase C). Sem "voltar": este fluxo termina e o contato
 * começa o outro — que HERDA o retorno pendente deste, se houver (senão quem
 * esperava lá atrás nunca acordaria). Com "voltar": este fluxo dorme no bloco e
 * o outro, ao chegar ao Fim, o acorda (`encerrar` → `retomar`).
 *
 * A vaga é liberada ANTES de inscrever no outro: o índice `one_live` deixa uma
 * inscrição viva por contato, e `dormente` fica fora dele.
 */
async function conectar(
  deps: DepsDoMotor,
  enrollment: EnrollmentDoFluxo,
  no: Extract<FlowNode, { type: "conexao_fluxo" }>,
  passos: number,
  grafo: FlowGraph,
  nos: Map<string, FlowNode>,
): Promise<ResultadoDoPasso> {
  const org = enrollment.organization_id;
  const conversa = enrollment.conversation_id!;
  const origemAtual = await deps.origem(org, enrollment.id);
  const saltos = (origemAtual?.saltos ?? 0) + 1;
  if (saltos > MAX_SALTOS_DE_CONEXAO) {
    await encerrar(deps, enrollment, "dead", "conexoes_demais", passos);
    return { tipo: "parado", motivo: "conexoes_demais" };
  }
  const { fluxo_id: fluxoId, retornar } = no.config;
  if (!(await deps.fluxoPublicado(org, fluxoId))) {
    await deps.evento(org, enrollment.id, no.id, "conexao_falhou", { fluxo_id: fluxoId, motivo: "fluxo_nao_publicado" });
    if (retornar) {
      // Segue pela saída como se o outro fluxo tivesse terminado — o contato não fica preso.
      const aresta = proximaAresta(grafo.edges, no.id, null);
      const proximo = aresta ? nos.get(aresta.target) : undefined;
      await deps.atualizar(org, enrollment.id, { current_node_id: proximo?.id ?? no.id, steps_taken: enrollment.steps_taken + passos });
      if (proximo) {
        await deps.agendar(org, enrollment, { tipo: "seguir" }, deps.agora());
        return { tipo: "continua_depois" };
      }
    }
    await encerrar(deps, enrollment, "completed", "conexao_fluxo_indisponivel", passos);
    return { tipo: "concluido" };
  }

  if (retornar) {
    await deps.atualizar(org, enrollment.id, {
      status: "dormente",
      current_node_id: no.id,
      steps_taken: enrollment.steps_taken + passos,
    });
  } else {
    await encerrar(deps, enrollment, "completed", "conexao", passos, { semRetorno: true });
  }
  const r = await deps.iniciarFluxo(org, {
    fluxoId,
    contactId: enrollment.contact_id,
    conversationId: conversa,
    origem: {
      origem: "conexao",
      de: enrollment.id,
      saltos,
      retorno: retornar ? { enrollment_id: enrollment.id, no_id: no.id } : (origemAtual?.retorno ?? null),
    },
  });
  await deps.evento(org, enrollment.id, no.id, r.ok ? "conectado" : "conexao_falhou", {
    fluxo_id: fluxoId,
    ...(r.ok ? { enrollment_id: r.enrollmentId } : { motivo: r.codigo }),
  });
  if (!r.ok) {
    if (retornar) {
      // Não deu para entrar no outro: volta a andar daqui, pela saída.
      await deps.atualizar(org, enrollment.id, { status: "active" });
      await deps.agendar(org, enrollment, { tipo: "retorno", noId: no.id }, deps.agora());
      return { tipo: "continua_depois" };
    }
    const retorno = origemAtual?.retorno;
    if (retorno) await deps.retomar(org, retorno.enrollment_id, retorno.no_id, enrollment.contact_id);
    return { tipo: "parado", motivo: `conexao_falhou:${r.codigo}` };
  }
  return retornar ? { tipo: "aguardando", noId: no.id } : { tipo: "concluido" };
}
