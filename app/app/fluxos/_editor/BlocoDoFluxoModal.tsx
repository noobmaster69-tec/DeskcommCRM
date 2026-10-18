"use client";

import { useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RFNode, RFNodeData } from "@/lib/followup/graph-mappers";
import type { FlowGraph, FlowNode } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import { temaDoBloco, varsDoBloco } from "./tema-dos-blocos";

interface Props {
  node: RFNode;
  /** Posição do bloco no caminho a partir do Início ("etapa N" no cabeçalho). */
  etapa?: number;
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

/** O que conta como "mexeu": rótulo e config (os erros do publish não). */
function foto(data: RFNodeData, settings: FlowGraph["settings"]): string {
  return JSON.stringify({ label: data.label, config: data.config, settings: settings ?? null });
}

/**
 * O modal de edição de bloco do canvas de FLUXOS (redesenho de 17 out): 560px,
 * cabeçalho com o ícone na cor do bloco, "Editar {bloco}" e "{categoria} ·
 * etapa N"; corpo que rola; rodapé fixo com a dica de teclado, Cancelar e
 * Salvar. O mesmo modal serve a todo bloco — só o formulário muda.
 *
 * Os formulários gravam no nó a cada campo válido (o cartão atrás já mostra a
 * prévia nova). "Salvar" (ou ⌘/Ctrl+Enter) só fecha; Cancelar, X, Esc ou
 * clique fora devolvem a foto tirada na abertura — e, se algo mudou, perguntam
 * antes de descartar.
 */
export function BlocoDoFluxoModal({ node, etapa, onSalvar, onCancelar, settings, children }: Props) {
  const t = useT();
  const [original] = useState<RFNodeData>(() => structuredClone(node.data));
  const [settingsOriginais] = useState(() => (settings === undefined ? undefined : structuredClone(settings)));
  const [confirmar, setConfirmar] = useState(false);
  const tipo = node.type as FlowNode["type"];
  const tema = temaDoBloco(tipo);
  const Icone = tema.icon;

  const cancelar = () => onCancelar(original, settingsOriginais);
  const mudou = foto(node.data, settings) !== foto(original, settingsOriginais);
  const tentarFechar = () => (mudou ? setConfirmar(true) : cancelar());

  return (
    <DialogPrimitive.Root open onOpenChange={(aberto) => !aberto && tentarFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fx-portal fx-modal-overlay" />
        <DialogPrimitive.Content
          className="fx-portal fx-modal"
          style={varsDoBloco(tipo)}
          data-testid="bloco-modal"
          aria-describedby={undefined}
          // O primeiro campo do formulário recebe o foco, não o X.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSalvar();
            }
          }}
        >
          <header className="fx-modal__head">
            <span className="fx-modal__icon">
              <Icone size={17} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="fx-modal__title truncate">
                {t("Editar")} {t(tema.label)}
              </DialogPrimitive.Title>
              <p className="fx-modal__sub">
                {[tema.categoria ? t(tema.categoria) : null, etapa ? `${t("etapa")} ${etapa}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button type="button" className="fx-iconbtn" onClick={tentarFechar} aria-label={t("Fechar")} data-testid="bloco-modal-fechar">
              <X size={17} aria-hidden />
            </button>
          </header>
          <div className="fx-modal__body" data-testid="node-config-sheet">
            {children}
          </div>
          <footer className="fx-modal__foot">
            <span className="fx-modal__dica">{t("Esc para fechar · ⌘ Enter para salvar")}</span>
            <button type="button" className="fx-btn" onClick={tentarFechar} data-testid="bloco-modal-cancelar">
              {t("Cancelar")}
            </button>
            <button type="button" className="fx-btn fx-btn--primary" onClick={onSalvar} data-testid="bloco-modal-salvar">
              {t("Salvar")}
            </button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent data-testid="bloco-modal-descartar">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Descartar alterações?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O que você mudou neste bloco volta a ser como estava quando o modal abriu.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Continuar editando")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmar(false);
                cancelar();
              }}
              data-testid="bloco-modal-descartar-sim"
            >
              {t("Descartar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogPrimitive.Root>
  );
}
