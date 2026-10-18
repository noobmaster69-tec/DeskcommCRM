"use client";

import type { NodeProps } from "@xyflow/react";
import { Check, Clock, CornerDownRight, MessageCircleReply, Shuffle, TriangleAlert, X, type LucideIcon } from "lucide-react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import {
  AGUARDAR_RESPONDEU_BRANCH_ID,
  AGUARDAR_SEM_RESPOSTA_BRANCH_ID,
  BLOCO_IA_FALHA_BRANCH_ID,
  CONDICIONAL_NAO_BRANCH_ID,
  CONDICIONAL_SIM_BRANCH_ID,
  nodeBranches,
  type BranchableNode,
  type FlowNode,
} from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import { useT } from "@/hooks/i18n/useT";
import { useEtapasDoFluxo } from "@/app/app/ai/followups/[id]/_components/EtapasDoFluxo";
import { FluxoNode } from "@/app/app/fluxos/_editor/FluxoNode";
import { PreviaDoBloco } from "@/app/app/fluxos/_editor/previas";
import { useCanvasDoFluxo } from "@/app/app/fluxos/_editor/canvas-do-fluxo";

/** Blocos cujo corpo é só o cabeçalho (o Distribuidor mostra as saídas com a porcentagem). */
const SEM_CORPO = new Set<string>(["distribuidor"]);

const ICONE_DO_RAMO: Record<string, LucideIcon> = {
  [CONDICIONAL_SIM_BRANCH_ID]: Check,
  [CONDICIONAL_NAO_BRANCH_ID]: X,
  [AGUARDAR_RESPONDEU_BRANCH_ID]: MessageCircleReply,
  [AGUARDAR_SEM_RESPOSTA_BRANCH_ID]: Clock,
  [BLOCO_IA_FALHA_BRANCH_ID]: TriangleAlert,
};

const UNIDADE_CURTA: Record<string, string> = { segundos: "s", minutos: "min", horas: "h", dias: "dias" };

/** "34%" de cada saída do Distribuidor, a partir da contagem de quem já passou. */
export function porcentagens(contagem: Record<string, number>, ids: readonly string[]): Record<string, string> {
  const total = ids.reduce((s, id) => s + (contagem[id] ?? 0), 0);
  return Object.fromEntries(ids.map((id) => [id, total === 0 ? "0%" : `${Math.round(((contagem[id] ?? 0) / total) * 100)}%`]));
}

/**
 * O cartão de qualquer bloco de FLUXO no canvas: o `FluxoNode` com a prévia e
 * uma linha (com alça) por saída (`nodeBranches`).
 */
export function BlocoDoFluxoNode({ id, data, selected, type }: NodeProps<RFNode>) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const { distribuicoes } = useCanvasDoFluxo();
  const tipo = type as BranchableNode["type"];
  const ramos = nodeBranches({ type: tipo, config: data.config } as BranchableNode);
  const pct = tipo === "distribuidor" ? porcentagens(distribuicoes[id] ?? {}, ramos.map((r) => r.id)) : {};
  const aguardar = tipo === "aguardar_resposta" ? (data.config as Extract<FlowNode, { type: "aguardar_resposta" }>["config"]) : null;
  const saidas = ramos.map((r) => ({
    id: r.id,
    escape: r.kind === "fallback",
    conteudo: t(rotuloDoRamo(r, nomes)),
    icone: tipo === "distribuidor" ? Shuffle : (ICONE_DO_RAMO[r.id] ?? CornerDownRight),
    valor:
      tipo === "distribuidor"
        ? pct[r.id]
        : r.id === AGUARDAR_SEM_RESPOSTA_BRANCH_ID && aguardar?.tempo
          ? `${aguardar.tempo.valor} ${t(UNIDADE_CURTA[aguardar.tempo.unidade] ?? aguardar.tempo.unidade)}`
          : undefined,
  }));
  return (
    <FluxoNode
      id={id}
      tipo={tipo}
      title={data.label}
      selected={selected}
      errors={data.errors}
      saidas={saidas}
      ouEntreSaidas={tipo === "aguardar_resposta"}
    >
      {SEM_CORPO.has(tipo) ? null : <PreviaDoBloco tipo={tipo} config={data.config} />}
    </FluxoNode>
  );
}

/** Início do fluxo: só cabeçalho e uma linha do que dispara; não se duplica nem se apaga pelo cartão. */
export function InicioDoFluxoNode({ id, data, selected }: NodeProps<RFNode>) {
  return (
    <FluxoNode
      id={id}
      tipo="trigger"
      title={data.label}
      selected={selected}
      errors={data.errors}
      showTarget={false}
      acoes={["editar"]}
    />
  );
}

/** Fim: só cabeçalho, sem saída. */
export function FimDoFluxoNode({ id, data, selected }: NodeProps<RFNode>) {
  return (
    <FluxoNode id={id} tipo="end" title={data.label} selected={selected} errors={data.errors} showSource={false} />
  );
}
