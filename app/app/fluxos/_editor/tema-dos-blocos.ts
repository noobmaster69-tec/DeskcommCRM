import type { CSSProperties } from "react";
import {
  Bell,
  Bot,
  CircleStop,
  Hourglass,
  MessageCircleReply,
  MessageSquare,
  Play,
  Shuffle,
  Split,
  SquareKanban,
  Tag,
  Target,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import type { NodeType } from "@/lib/followup/graph-schema";

/**
 * A identidade visual de cada bloco do construtor de FLUXOS (fork jhoow,
 * redesenho de 17 out): matiz, ícone, nome, categoria e rótulo curto do dock.
 * TODA cor do bloco — cabeçalho, corpo, alça, linha, dock, mini-mapa, modal —
 * deriva daqui (`varsDoBloco`, `corDoBloco`); ninguém escreve cor de bloco à mão.
 *
 * Base da especificação: --c = oklch(0.66 0.155 H), --c-light = oklch(0.87 0.09 H).
 * Texto sobre --c é branco, menos Distribuidor e Pixel (amarelos), que usam #1f1600.
 */
export interface TemaDoBloco {
  hue: number;
  icon: LucideIcon;
  /** Nome completo (cabeçalho do cartão, título do modal, tooltip do dock). */
  label: string;
  /** Rótulo curto embaixo do quadrado do dock. */
  curto: string;
  /** Segunda linha do cabeçalho do cartão e do modal. */
  categoria: string;
  /** Cor do texto/ícone sobre --c. */
  sobreCor: string;
  /** Croma: o Fim é neutro (não tem cor de "fazer" nenhuma). */
  croma?: number;
}

const BRANCO = "#ffffff";
const ESCURO = "#1f1600";

export const BLOCK_THEME: Partial<Record<NodeType, TemaDoBloco>> = {
  trigger: { hue: 150, icon: Play, label: "Início", curto: "Gatilho", categoria: "Gatilho", sobreCor: BRANCO },
  mensagem: { hue: 262, icon: MessageSquare, label: "Mensagem", curto: "Mensagem", categoria: "Enviar", sobreCor: BRANCO },
  aguardar_resposta: {
    hue: 52,
    icon: MessageCircleReply,
    label: "Aguardar resposta",
    curto: "Aguardar",
    categoria: "Espera",
    sobreCor: BRANCO,
  },
  intervalo: {
    hue: 228,
    icon: Hourglass,
    label: "Intervalo inteligente",
    curto: "Intervalo",
    categoria: "Espera",
    sobreCor: BRANCO,
  },
  condicional: { hue: 120, icon: Split, label: "Condicional", curto: "Condição", categoria: "Lógica", sobreCor: BRANCO },
  distribuidor: { hue: 88, icon: Shuffle, label: "Distribuidor", curto: "Distribuir", categoria: "Lógica", sobreCor: ESCURO },
  conexao_fluxo: {
    hue: 18,
    icon: Waypoints,
    label: "Conexão de fluxo",
    curto: "Conexão",
    categoria: "Fluxo",
    sobreCor: BRANCO,
  },
  etiquetas: { hue: 295, icon: Tag, label: "Etiquetas", curto: "Etiquetas", categoria: "CRM", sobreCor: BRANCO },
  kanban: { hue: 335, icon: SquareKanban, label: "Kanban", curto: "Kanban", categoria: "CRM", sobreCor: BRANCO },
  notificacao: { hue: 190, icon: Bell, label: "Notificação", curto: "Notificar", categoria: "Integração", sobreCor: BRANCO },
  pixel: { hue: 65, icon: Target, label: "Pixel", curto: "Pixel", categoria: "Integração", sobreCor: ESCURO },
  // Fora da lista do pedido, mas já existiam e continuam funcionando.
  bloco_ia: { hue: 355, icon: Bot, label: "Bloco de IA", curto: "IA", categoria: "IA", sobreCor: BRANCO },
  end: { hue: 20, icon: CircleStop, label: "Fim", curto: "Fim", categoria: "Fluxo", sobreCor: BRANCO, croma: 0.02 },
};

/** Grupos do dock, na ordem do pedido. IA e Fim entram para não sumirem do construtor. */
export const GRUPOS_DO_DOCK: ReadonlyArray<{ nome: string; tipos: readonly NodeType[] }> = [
  { nome: "Gatilho", tipos: ["trigger"] },
  { nome: "Mensagens", tipos: ["mensagem", "aguardar_resposta", "intervalo"] },
  { nome: "Lógica", tipos: ["condicional", "distribuidor", "conexao_fluxo", "end"] },
  { nome: "CRM", tipos: ["etiquetas", "kanban"] },
  { nome: "Integrações", tipos: ["notificacao", "pixel", "bloco_ia"] },
];

const RESERVA: TemaDoBloco = {
  hue: 0,
  icon: CircleStop,
  label: "Bloco",
  curto: "Bloco",
  categoria: "",
  sobreCor: BRANCO,
  croma: 0,
};

export function temaDoBloco(tipo: string | undefined): TemaDoBloco {
  return (tipo && BLOCK_THEME[tipo as NodeType]) || RESERVA;
}

/** --c do bloco. */
export function corDoTema(tema: TemaDoBloco): string {
  return `oklch(0.66 ${tema.croma ?? 0.155} ${tema.hue})`;
}

/** --c-light do bloco. */
export function corClaraDoTema(tema: TemaDoBloco): string {
  return `oklch(0.87 ${tema.croma === undefined ? 0.09 : tema.croma / 2} ${tema.hue})`;
}

/** As custom properties que o CSS do editor lê (`--c`, `--c-light`, `--c-on`). */
export function varsDoBloco(tipo: string | undefined): CSSProperties {
  const tema = temaDoBloco(tipo);
  return {
    "--c": corDoTema(tema),
    "--c-light": corClaraDoTema(tema),
    "--c-on": tema.sobreCor,
  } as CSSProperties;
}
