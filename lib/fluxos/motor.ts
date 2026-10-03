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
  AGUARDAR_SEM_RESPOSTA_BRANCH_ID,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
} from "@/lib/followup/graph-schema";
import type { ItemDaMensagem } from "@/lib/followup/blocos-do-fluxo";
import { interpolar, type ContextoDeVariaveis } from "./variaveis";

export type StatusDoEnrollment = "active" | "waiting_reply" | "completed" | "cancelled" | "dead" | "paused_handoff";

export interface EnrollmentDoFluxo {
  id: string;
  organization_id: string;
  version_id: string;
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
  | { tipo: "buffer"; noId: string; visita: number };

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

export interface DepsDoMotor {
  carregarEnrollment(org: string, id: string): Promise<EnrollmentDoFluxo | null>;
  carregarGrafo(org: string, versionId: string): Promise<FlowGraph | null>;
  carregarContato(
    org: string,
    contactId: string,
  ): Promise<{ nome: string | null; telefone: string | null; campos: Record<string, unknown> }>;
  /** Mensagens do lead (inbound) na conversa, depois de `desde`, em ordem. */
  respostasDesde(org: string, conversationId: string, desde: string): Promise<RespostaDoLead[]>;
  /** Envia pela cadeia do Inbox. `bloqueada` = contato bloqueou/pediu para parar (veto permanente). */
  enviar(org: string, conversationId: string, msg: MensagemDeSaida, seq: number): Promise<"enviada" | "bloqueada">;
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
      const aresta = proximaAresta(grafo.edges, atual.id, AGUARDAR_RESPONDEU_BRANCH_ID);
      atual = aresta ? nos.get(aresta.target) : undefined;
    } else {
      return { tipo: "ignorado", motivo: "esperando_resposta" };
    }
    if (!atual) {
      await encerrar(deps, enrollment, "completed", "sem_saida");
      return { tipo: "concluido" };
    }
    await deps.atualizar(org, enrollment.id, { status: "active", current_node_id: atual.id });
  } else if (motivo.tipo !== "seguir") {
    // Fluxo andando (mandando mensagens): resposta no meio é ignorada pelo motor.
    // O agente de IA também não responde — quem decide isso é o drain.
    return { tipo: "ignorado", motivo: "fluxo_em_andamento" };
  }

  const contato = await deps.carregarContato(org, enrollment.contact_id);
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
    const ramo: string | null = null;

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
          if (r === "bloqueada") {
            await encerrar(deps, enrollment, "cancelled", "contato_bloqueado");
            return { tipo: "parado", motivo: "contato_bloqueado" };
          }
        }
        break;
      }

      case "etiquetas": {
        const etiquetas = no.config.etiquetas.map((e) => interpolar(e, contexto()).trim()).filter(Boolean);
        if (etiquetas.length > 0) await deps.mudarEtiquetas(org, enrollment.contact_id, no.config.operacao, etiquetas);
        break;
      }

      case "aguardar_resposta": {
        const visita = (await deps.eventos(org, enrollment.id, no.id, "aguardando")).length + 1;
        if (no.config.mensagem_antes?.trim()) {
          const body = interpolar(no.config.mensagem_antes, contexto()).trim();
          if (body) {
            const r = await deps.enviar(org, conversa, { type: "text", body }, ++seq);
            if (r === "bloqueada") {
              await encerrar(deps, enrollment, "cancelled", "contato_bloqueado");
              return { tipo: "parado", motivo: "contato_bloqueado" };
            }
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

async function encerrar(
  deps: DepsDoMotor,
  enrollment: EnrollmentDoFluxo,
  status: "completed" | "cancelled" | "dead",
  motivo: string,
  passos = 0,
): Promise<void> {
  await deps.atualizar(enrollment.organization_id, enrollment.id, {
    status,
    completed_at: deps.agora().toISOString(),
    steps_taken: enrollment.steps_taken + passos,
    ...(status === "completed" ? {} : { cancel_reason: motivo }),
  });
  await deps.evento(enrollment.organization_id, enrollment.id, null, status === "completed" ? "concluido" : "encerrado", { motivo });
}
