"use client";

import type { NodeProps } from "@xyflow/react";
import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches, type BranchableNode } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";
import { useEtapasDoFluxo } from "@/app/app/ai/followups/[id]/_components/EtapasDoFluxo";
import { FluxoNode } from "@/app/app/fluxos/_editor/FluxoNode";
import { PreviaDoBloco, rodapeDoBloco } from "@/app/app/fluxos/_editor/previas";
import { corDoBloco } from "@/app/app/fluxos/_editor/cores-dos-blocos";
import { useCanvasDoFluxo } from "@/app/app/fluxos/_editor/canvas-do-fluxo";

/** Blocos cujo corpo é só o cabeçalho (o Distribuidor mostra as saídas com a contagem). */
const SEM_CORPO = new Set<string>(["distribuidor"]);

/**
 * O cartão de qualquer bloco de FLUXO no canvas (fork jhoow): o `FluxoNode`
 * genérico com a prévia do Leona (item 5) e uma bolinha por saída
 * (`nodeBranches` — o Aguardar resposta tem "Respondeu" e "Não respondeu").
 */
export function BlocoDoFluxoNode({ id, data, selected, type }: NodeProps<RFNode>) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const { distribuicoes } = useCanvasDoFluxo();
  const tipo = type as BranchableNode["type"];
  const ramos = nodeBranches({ type: tipo, config: data.config } as BranchableNode);
  const contagem = distribuicoes[id] ?? {};
  const saidas = ramos.map((r) => {
    const rotulo = t(rotuloDoRamo(r, nomes));
    return {
      id: r.id,
      escape: r.kind === "fallback",
      conteudo: tipo === "distribuidor" ? `${rotulo} — ${t("Quantidade")}: ${contagem[r.id] ?? 0}` : rotulo,
    };
  });
  return (
    <FluxoNode
      id={id}
      icon={NODE_VISUALS[tipo].icon}
      title={data.label}
      color={corDoBloco(tipo)}
      selected={selected}
      errors={data.errors}
      saidas={saidas}
      rodape={rodapeDoBloco(tipo, data.config, t)}
    >
      {SEM_CORPO.has(tipo) ? null : <PreviaDoBloco tipo={tipo} config={data.config} />}
    </FluxoNode>
  );
}

/** Início do fluxo no canvas de Fluxos: só cabeçalho; não se duplica nem se apaga pelo cartão. */
export function InicioDoFluxoNode({ id, data, selected }: NodeProps<RFNode>) {
  return (
    <FluxoNode
      id={id}
      icon={NODE_VISUALS.trigger.icon}
      title={data.label}
      color={corDoBloco("trigger")}
      selected={selected}
      errors={data.errors}
      showTarget={false}
      acoes={["editar"]}
    />
  );
}

/** Fim (vermelho escuro): só cabeçalho, sem saída. */
export function FimDoFluxoNode({ id, data, selected }: NodeProps<RFNode>) {
  return (
    <FluxoNode
      id={id}
      icon={NODE_VISUALS.end.icon}
      title={data.label}
      color={corDoBloco("end")}
      selected={selected}
      errors={data.errors}
      showSource={false}
    />
  );
}
