"use client";

import type { NodeProps } from "@xyflow/react";
import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches, type BranchableNode } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";
import { NodeCard } from "@/app/app/ai/followups/[id]/_components/nodes/NodeCard";

/**
 * O cartão de qualquer bloco de FLUXO no canvas (fork jhoow): o mesmo
 * `NodeCard` do follow-up, com ícone e cor do bloco e uma bolinha por saída
 * (`nodeBranches` — o Aguardar resposta tem "Respondeu" e "Não respondeu").
 */
export function BlocoDoFluxoNode({ id, data, selected, type }: NodeProps<RFNode>) {
  const t = useT();
  const tipo = type as BranchableNode["type"];
  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS[tipo]}
      label={data.label}
      subtitle={describeNodeConfig(tipo, data.config, t)}
      selected={selected}
      errors={data.errors}
      branches={nodeBranches({ type: tipo, config: data.config } as BranchableNode)}
    />
  );
}
