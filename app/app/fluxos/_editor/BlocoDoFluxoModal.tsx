"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RFNode, RFNodeData } from "@/lib/followup/graph-mappers";
import type { FlowGraph, FlowNode } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";

import { corDoBloco } from "./cores-dos-blocos";

interface Props {
  node: RFNode;
  /** Fecha mantendo o que foi editado (o formulário já gravou no nó vivo). */
  onSalvar: () => void;
  /**
   * Fecha DEVOLVENDO o nó — e as configurações do grafo, que o Início edita —
   * ao que eram quando o modal abriu.
   */
  onCancelar: (original: RFNodeData, settings: FlowGraph["settings"]) => void;
  settings?: FlowGraph["settings"];
  /** O formulário do bloco (NodeConfigPanel com `naModal`). */
  children: ReactNode;
}

/**
 * O modal centralizado de configuração de bloco do canvas de FLUXOS (fork
 * jhoow, item 7), no lugar do painel lateral: fundo escurecido, cabeçalho com
 * o ícone colorido e o nome do bloco, X, e Cancelar/Salvar no canto inferior.
 *
 * Os formulários gravam no nó a cada campo válido (é o contrato deles — o
 * cartão atrás já mostra a prévia nova). Por isso "Salvar" só fecha, e
 * "Cancelar" (ou X, Esc, clique fora) devolve a foto tirada na abertura:
 * fechar sem salvar não pode deixar meia edição no rascunho.
 */
export function BlocoDoFluxoModal({ node, onSalvar, onCancelar, settings, children }: Props) {
  const t = useT();
  const [original] = useState<RFNodeData>(() => structuredClone(node.data));
  const [settingsOriginais] = useState(() => (settings === undefined ? undefined : structuredClone(settings)));
  const cancelar = () => onCancelar(original, settingsOriginais);
  const tipo = node.type as FlowNode["type"];
  const visual = NODE_VISUALS[tipo];
  const Icon = visual.icon;
  const cor = corDoBloco(tipo);
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && cancelar()}>
      <DialogContent
        className="flex max-h-[88vh] max-w-2xl flex-col gap-0 p-0"
        data-testid="bloco-modal"
        // O primeiro campo do formulário recebe o foco, não o X.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2.5 pr-8 text-base">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: cor }}
            >
              <Icon size={15} aria-hidden />
            </span>
            {t(visual.paletteLabel)}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("Configure o bloco e salve.")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="node-config-sheet">
          {children}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="outline" onClick={cancelar} data-testid="bloco-modal-cancelar">
            {t("Cancelar")}
          </Button>
          <Button type="button" onClick={onSalvar} data-testid="bloco-modal-salvar">
            {t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
