import type { ComponentType } from "react";

import { Bell, Play, Clock, GitBranch, Brain, ChatCircle, ArrowsClockwise, PaperPlaneTilt, Flag, Question, PuzzlePiece, ChatText, Tag, Hourglass, ArrowsSplit, LinkSimple, Target, Timer, Robot, Kanban } from "@/lib/ui/icons";
import type { FlowNode, NodeType } from "@/lib/followup/graph-schema";
import { EVENTOS_DO_PIXEL_NA_TELA, RESULTADOS_DO_FIM } from "@/lib/followup/vocabulario";
import { NOS_DA_SUPERFICIE } from "@/lib/followup/validate-publish";

/**
 * Visual identity per node type — shared by the palette (Task 6.2 increment 2)
 * and the custom node cards (increment 3). Each type gets a DISTINCT icon +
 * Sage token pairing (never a bare default React Flow box): trigger=accent
 * (start), wait=info (calm/waiting), condition=warning (branch), ai_classify=
 * solid accent (the "smart" step), action=success (send/go), end=error
 * (terminal — reads as "stop", not literally an error).
 */
export interface NodeVisual {
  type: NodeType;
  paletteLabel: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Icon chip background + text. */
  chipClassName: string;
  /** Left accent border on the node card. */
  borderClassName: string;
  defaultLabel: string;
  defaultConfig: () => FlowNode["config"];
}

type RegraDeCondicao = Extract<FlowNode, { type: "condition" }>["config"]["checks"][number];

/**
 * A regra com que o nó de condição nasce, e a que o "+ Condição" acrescenta.
 *
 * Era `passos ≥ 0` — válida no schema e VERDADEIRA PARA TODO LEAD (o contador
 * nasce em zero e só soma). No modo uma-saída-por-regra ela desviava todo mundo
 * e tornava "Nenhuma delas" inalcançável; num OU, fixava o nó em "Sim". E o card
 * a mostrava com cara de regra pronta.
 *
 * Agora nasce INCOMPLETA de propósito: o schema aceita (o rascunho salva), o
 * motor nunca a satisfaz e o publish a recusa até alguém escolher a etapa. Etapa
 * porque é a pergunta mais comum de um funil — e a que o seletor responde sem
 * digitar nada.
 */
export function regraEmBranco(): RegraDeCondicao {
  return { field: "lead_stage", op: "eq", value: "" };
}

/**
 * Nó de mensagem novo: IA, salvo o gatilho de retorno — ali o padrão é texto
 * fixo, porque a saudação de quem voltou não pede o LLM (e duas vozes
 * nasceriam se o default fosse `ai_message` + o turno inbound).
 */
export function configPadraoDaAcao(triggerKind?: string): FlowNode["config"] {
  if (triggerKind === "inbound_after_silence") {
    return { mode: "text", body: "Configure esta mensagem." };
  }
  return { mode: "ai_message", prompt_hint: "Configure esta etapa." };
}

/**
 * Cor dos blocos de FLUXOS (fork jhoow): o pedido dá uma cor por bloco, e os
 * tokens semânticos do produto são cinco. As classes ficam LITERAIS aqui porque
 * o Tailwind só gera o que lê no fonte.
 */
const CORES_DOS_BLOCOS = {
  sky: { chip: "bg-sky-500/15 text-sky-400", borda: "border-l-sky-500" },
  violet: { chip: "bg-violet-500/15 text-violet-400", borda: "border-l-violet-500" },
  orange: { chip: "bg-orange-500/15 text-orange-400", borda: "border-l-orange-500" },
  teal: { chip: "bg-teal-500/15 text-teal-400", borda: "border-l-teal-500" },
  cyan: { chip: "bg-cyan-500/15 text-cyan-400", borda: "border-l-cyan-500" },
  amber: { chip: "bg-amber-500/15 text-amber-400", borda: "border-l-amber-500" },
  rose: { chip: "bg-rose-500/15 text-rose-400", borda: "border-l-rose-500" },
  yellow: { chip: "bg-yellow-500/15 text-yellow-400", borda: "border-l-yellow-500" },
  emerald: { chip: "bg-emerald-500/15 text-emerald-400", borda: "border-l-emerald-500" },
  green: { chip: "bg-green-500/15 text-green-400", borda: "border-l-green-500" },
  indigo: { chip: "bg-indigo-500/15 text-indigo-400", borda: "border-l-indigo-500" },
} as const;

function bloco(
  type: NodeType,
  rotulo: string,
  icon: NodeVisual["icon"],
  cor: keyof typeof CORES_DOS_BLOCOS,
  defaultConfig: () => unknown,
): NodeVisual {
  return {
    type,
    paletteLabel: rotulo,
    icon,
    chipClassName: CORES_DOS_BLOCOS[cor].chip,
    borderClassName: CORES_DOS_BLOCOS[cor].borda,
    defaultLabel: rotulo,
    defaultConfig: defaultConfig as NodeVisual["defaultConfig"],
  };
}

export const NODE_VISUALS: Record<NodeType, NodeVisual> = {
  trigger: {
    type: "trigger",
    paletteLabel: "Gatilho",
    icon: Play,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Início do fluxo",
    defaultConfig: () => ({}),
  },
  wait: {
    type: "wait",
    paletteLabel: "Aguardar",
    icon: Clock,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Aguardar",
    defaultConfig: () => ({ mode: "fixed", duration_ms: 300_000 }),
  },
  condition: {
    type: "condition",
    paletteLabel: "Condição",
    icon: GitBranch,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Verificar condição",
    defaultConfig: () => ({ combinator: "and", checks: [regraEmBranco()] }),
  },
  ai_classify: {
    type: "ai_classify",
    paletteLabel: "Classificar (IA)",
    icon: Brain,
    chipClassName: "bg-accent text-accent-foreground",
    borderClassName: "border-l-accent-700",
    defaultLabel: "Classificar resposta",
    defaultConfig: () => ({
      // Em português, e dizendo o CRITÉRIO: estes nomes são a definição inteira
      // que o modelo recebe para classificar a resposta (`followup-flow-classify`),
      // e aparecem crus na saída do card, na aresta e no dossiê. "hot"/"cold"
      // pedia ao dono da loja que adivinhasse o critério — e ao modelo também.
      // Fora do dicionário de propósito: são DADO do usuário, e uma chave faria
      // o card traduzir o que o motor compara ao pé da letra.
      classes: ["Interessado", "Sem interesse"],
      grace_timeout_ms: 900_000,
      target: "last_reply",
    }),
  },
  match_reply: {
    type: "match_reply",
    paletteLabel: "Resposta (texto)",
    icon: ChatCircle,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Casar resposta",
    defaultConfig: () => ({
      branches: [{ id: "br_sim", label: "Sim", op: "contains", pattern: "sim" }],
      grace_timeout_ms: 900_000,
    }),
  },
  repeat: {
    type: "repeat",
    paletteLabel: "Repetir",
    icon: ArrowsClockwise,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Repetir pela resposta",
    defaultConfig: () => ({ max_count: 12 }),
  },
  collect: {
    type: "collect",
    paletteLabel: "Pergunta",
    icon: Question,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Nova pergunta",
    defaultConfig: () => ({ key: "novo_campo", label: "Nova pergunta", type: "text", required: true, permite_correcao: true }),
  },
  skill: {
    type: "skill",
    paletteLabel: "Skill",
    icon: PuzzlePiece,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Puxar skill",
    defaultConfig: () => ({ skill_name: "nome-da-skill" }),
  },
  action: {
    type: "action",
    paletteLabel: "Ação",
    icon: PaperPlaneTilt,
    chipClassName: "bg-success-bg text-success-fg",
    borderClassName: "border-l-success",
    defaultLabel: "Enviar mensagem",
    defaultConfig: () => configPadraoDaAcao(),
  },
  internal_task: {
    type: "internal_task",
    paletteLabel: "Lembrete interno",
    icon: Bell,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Criar tarefa (só interno)",
    defaultConfig: () => ({
      titulo: "Ligar para {{contact.name}}",
      vence_em_dias: 1,
      atribuir_a: "dono_do_lead",
      prioridade: "medium",
    }),
  },
  end: {
    type: "end",
    paletteLabel: "Fim",
    icon: Flag,
    chipClassName: "bg-error-bg text-error-fg",
    borderClassName: "border-l-error",
    defaultLabel: "Fim do fluxo",
    defaultConfig: () => ({ outcome: "exhausted" }),
  },
  // ── Fork jhoow: os 11 blocos de FLUXOS (cor e ícone do pedido do dono) ──
  mensagem: bloco("mensagem", "Mensagem", ChatText, "sky", () => ({ itens: [{ id: "t1", tipo: "texto", texto: "Olá, {nome}!" }] })),
  etiquetas: bloco("etiquetas", "Etiquetas", Tag, "violet", () => ({ operacao: "adicionar", etiquetas: ["nova_etiqueta"] })),
  aguardar_resposta: bloco("aguardar_resposta", "Aguardar resposta", Hourglass, "orange", () => ({
    sem_limite: false,
    tempo: { valor: 1, unidade: "dias" },
    responder_citando: false,
  })),
  notificacao: bloco("notificacao", "Notificação", Bell, "teal", () => ({
    nome: "Notificação",
    ddi: "55",
    numero: "11999999999",
    mensagem: "{nome} precisa de atenção.",
  })),
  condicional: bloco("condicional", "Condicional", GitBranch, "cyan", () => ({
    regra: "todas",
    condicoes: [{ id: "c1", campo: { tipo: "etiqueta" }, operador: "contem", valor: "" }],
  })),
  distribuidor: bloco("distribuidor", "Distribuidor", ArrowsSplit, "amber", () => ({
    modo: "fixo_por_contato",
    saidas: [
      { id: "s1", nome: "Saída 1" },
      { id: "s2", nome: "Saída 2" },
    ],
  })),
  conexao_fluxo: bloco("conexao_fluxo", "Conexão de fluxo", LinkSimple, "rose", () => ({
    fluxo_id: "00000000-0000-4000-8000-000000000000",
    retornar: false,
  })),
  pixel: bloco("pixel", "Pixel", Target, "yellow", () => ({ evento: "Lead", moeda: "BRL" })),
  intervalo: bloco("intervalo", "Intervalo inteligente", Timer, "emerald", () => ({ modo: "duracao", valor: 30, unidade: "minutos" })),
  bloco_ia: bloco("bloco_ia", "Bloco de IA", Robot, "green", () => ({
    provedor: "anthropic",
    modelo: "claude-sonnet-5-5",
    mensagem: "{last_user_message}",
    salvar_em: "ai.response",
    enviar_resposta: true,
    prompt: "",
    entender: { audio: false, imagem: false, pdf: false },
    condicionais: [],
    contexto: { ativo: false, interacoes: 5 },
  })),
  kanban: bloco("kanban", "Kanban", Kanban, "indigo", () => ({
    acao: "adicionar",
    pipeline_id: "00000000-0000-4000-8000-000000000000",
  })),
};

/**
 * A paleta do editor de follow-up: só o que o motor do RELÓGIO executa. Pergunta
 * e Skill são do roteiro de atendimento (#1130) e ficam fora — a mesma lista
 * que o publish cobra (`NOS_DA_SUPERFICIE`), para a tela não oferecer caixa que
 * o publish recusa.
 */
export const NODE_VISUAL_LIST = NOS_DA_SUPERFICIE.followup.map((tipo) => NODE_VISUALS[tipo]);

type ConfigOf<T extends NodeType> = Extract<FlowNode, { type: T }>["config"];

/** "15 min", com espaço — o mesmo formato do card de espera, que dizia "5 min" enquanto este dizia "15min". */
function minutos(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

/**
 * One-line summary of a node's config — shown as the card subtitle. Takes the
 * RF node's own `type`/`data.config` pair (not a reconstructed `FlowNode`)
 * because the node components only ever see React Flow's generic shape.
 */
const UNIDADE_NO_SINGULAR: Record<string, string> = { segundos: "segundo", minutos: "minuto", horas: "hora", dias: "dia" };

/** "1 minuto", "2 minutos" — a unidade concorda com o número. */
function unidadeNoNumero(valor: number, unidade: string): string {
  return valor === 1 ? (UNIDADE_NO_SINGULAR[unidade] ?? unidade) : unidade;
}

export function describeNodeConfig(
  type: NodeType,
  config: FlowNode["config"],
  // `t` OBRIGATÓRIO. Era opcional com padrão identidade, e foi assim que dois
  // cards que chegaram por outra branch (repetir e casar resposta) ficaram sem
  // tradução nenhuma sem o typecheck notar: em português o padrão devolve o
  // mesmo texto, então o esquecimento só aparecia para quem usa espanhol.
  t: (texto: string) => string,
): string {
  switch (type) {
    case "trigger":
      return t("Início do fluxo");
    case "wait": {
      const c = config as ConfigOf<"wait">;
      return c.mode === "fixed"
        ? minutos(c.duration_ms)
        : `${Math.round(c.min_ms / 60_000)}–${minutos(c.max_ms)} ${t("(adaptativo)")}`;
    }
    case "condition": {
      const c = config as ConfigOf<"condition">;
      // No modo uma-saída-por-regra o combinador NÃO é consultado (a regra não
      // vota, ela roteia). Continuar anunciando "E"/"OU" ali seria o card
      // afirmando uma coisa que o motor ignora — e o usuário acredita no card.
      if (c.branching === "per_check")
        return `${c.checks.length} ${c.checks.length === 1 ? t("regra · uma saída por regra") : t("regras · uma saída por regra")}`;
      return `${c.checks.length} ${c.checks.length === 1 ? t("condição") : t("condições")} · ${c.combinator === "and" ? t("E") : t("OU")}`;
    }
    // "grace" é o nome do CAMPO, não palavra nenhuma para quem tem uma loja — e o
    // formulário do mesmo nó já perguntava "Esperar a resposta por (minutos)".
    // O card dizia o número com dois nomes na mesma tela.
    case "ai_classify": {
      const c = config as ConfigOf<"ai_classify">;
      return `${c.classes.length} ${c.classes.length === 1 ? t("classe · espera") : t("classes · espera")} ${minutos(c.grace_timeout_ms)}`;
    }
    case "match_reply": {
      const c = config as ConfigOf<"match_reply">;
      return `${c.branches.length} ${c.branches.length === 1 ? t("regra · espera") : t("regras · espera")} ${minutos(c.grace_timeout_ms)}${
        c.save_to
          ? ` · ${t("grava resposta")}${c.if_exists === "skip" ? ` · ${t("pula se já existir")}` : c.if_exists === "confirm" ? ` · ${t("confirma se já existir")}` : ""}`
          : ""
      }`;
    }
    case "repeat": {
      const c = config as ConfigOf<"repeat">;
      return `${t("até")} ${c.max_count} ${c.max_count === 1 ? t("volta") : t("voltas")}`;
    }
    case "collect": {
      const c = config as ConfigOf<"collect">;
      return `${c.label} · ${c.required ? t("obrigatória") : t("opcional")}`;
    }
    case "skill": {
      const c = config as ConfigOf<"skill">;
      return c.skill_name;
    }
    case "action": {
      const c = config as ConfigOf<"action">;
      if (c.mode === "ai_message") return c.prompt_hint;
      if (c.mode === "text") return c.body;
      return t("Template fixo");
    }
    case "internal_task": {
      const c = config as ConfigOf<"internal_task">;
      const prazo = c.vence_em_dias === 0 ? t("hoje") : `+${c.vence_em_dias}d`;
      return `${c.titulo} · ${prazo} · ${t("sem mensagem ao cliente")}`;
    }
    case "end": {
      const c = config as ConfigOf<"end">;
      return t(RESULTADOS_DO_FIM[c.outcome]);
    }
    // ── Blocos de FLUXOS (fork jhoow) ──
    case "mensagem": {
      const c = config as ConfigOf<"mensagem">;
      return `${c.itens.length} ${c.itens.length === 1 ? t("item") : t("itens")}`;
    }
    case "etiquetas": {
      const c = config as ConfigOf<"etiquetas">;
      return `${c.operacao === "remover" ? "−" : "+"} ${c.etiquetas.join(", ")}`;
    }
    case "aguardar_resposta": {
      const c = config as ConfigOf<"aguardar_resposta">;
      return c.sem_limite || !c.tempo ? t("sem limite de tempo") : `${t("até")} ${c.tempo.valor} ${t(unidadeNoNumero(c.tempo.valor, c.tempo.unidade))}`;
    }
    case "notificacao": {
      const c = config as ConfigOf<"notificacao">;
      return `+${c.ddi} ${c.numero}`;
    }
    case "condicional": {
      const c = config as ConfigOf<"condicional">;
      return `${c.condicoes.length} ${c.condicoes.length === 1 ? t("condição") : t("condições")}`;
    }
    case "distribuidor": {
      const c = config as ConfigOf<"distribuidor">;
      return `${c.saidas.length} ${t("saídas")}`;
    }
    case "conexao_fluxo": {
      const c = config as ConfigOf<"conexao_fluxo">;
      return c.retornar ? t("vai e volta") : t("segue no outro fluxo");
    }
    case "pixel": {
      const c = config as ConfigOf<"pixel">;
      return c.valor ? `${t(EVENTOS_DO_PIXEL_NA_TELA[c.evento])} · ${c.valor}` : t(EVENTOS_DO_PIXEL_NA_TELA[c.evento]);
    }
    case "intervalo": {
      const c = config as ConfigOf<"intervalo">;
      if (c.modo === "duracao") return `${c.valor} ${t(unidadeNoNumero(c.valor, c.unidade))}`;
      if (c.modo === "data") return c.quando;
      return `${c.janelas.length} ${t("janelas de horário")}`;
    }
    case "bloco_ia": {
      const c = config as ConfigOf<"bloco_ia">;
      return c.enviar_resposta ? `${c.modelo} · ${t("responde o lead")}` : c.modelo;
    }
    case "kanban": {
      const c = config as ConfigOf<"kanban">;
      return t(c.acao === "adicionar" ? "cria o card" : c.acao === "mover" ? "move o card" : "remove o card");
    }
    default: {
      const exhaustive: never = type;
      return String(exhaustive);
    }
  }
}
