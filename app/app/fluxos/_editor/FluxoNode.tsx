"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";

import { Copy, PencilSimple, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import type { NodeVisual } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";

import { useCanvasDoFluxo } from "./canvas-do-fluxo";

export type AcaoDoCartao = "editar" | "duplicar" | "excluir";

export interface SaidaDoCartao {
  id: string;
  conteudo: ReactNode;
  /** A saída de escape ("nenhuma serve"): itálico, apagada. */
  escape?: boolean;
}

interface Props {
  id: string;
  icon: NodeVisual["icon"];
  title: string;
  color: string;
  selected?: boolean;
  errors?: string[];
  showTarget?: boolean;
  showSource?: boolean;
  /** Mais de uma saída: uma linha com bolinha própria para cada (Sim/Não, Saída N). */
  saidas?: SaidaDoCartao[];
  rodape?: ReactNode;
  acoes?: readonly AcaoDoCartao[];
  children?: ReactNode;
}

const TODAS: readonly AcaoDoCartao[] = ["editar", "duplicar", "excluir"];

/**
 * O cartão genérico de bloco do canvas de FLUXOS (fork jhoow, item 5) — o
 * "preview" do Leona (imagens 7–9): cabeçalho na cor do bloco com ícone,
 * título e ✏️ 📋 🗑️ à direita; corpo com a prévia do que o bloco faz.
 *
 * Tamanho: 240px de largura; o corpo tem teto de 220px (o cartão fica entre
 * ~100 e ~320px) — o que passar disso some sob "… + ver mais", que abre o
 * bloco. As bolinhas seguem as do NodeCard (entrada em cima, saída embaixo ou
 * uma por linha à direita), para o auto-layout e as arestas antigas não mudarem.
 */
export function FluxoNode({
  id,
  icon: Icon,
  title,
  color,
  selected,
  errors,
  showTarget = true,
  showSource = true,
  saidas,
  rodape,
  acoes = TODAS,
  children,
}: Props) {
  const t = useT();
  const { editar, duplicar, excluir, somenteLeitura } = useCanvasDoFluxo();
  const acoesVisiveis = somenteLeitura ? [] : acoes;
  const corpo = useRef<HTMLDivElement>(null);
  const [transborda, setTransborda] = useState(false);
  const temErro = (errors?.length ?? 0) > 0;
  const linhasDeSaida = saidas !== undefined && saidas.length > 1 ? saidas : null;

  // Mede depois de pintar: o corpo só sabe se passou do teto com o texto real.
  useLayoutEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const medir = () => setTransborda(el.scrollHeight > el.clientHeight + 1);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const BOTOES: Record<AcaoDoCartao, { rotulo: string; Icone: NodeVisual["icon"]; fazer: () => void; perigo?: boolean }> = {
    editar: { rotulo: t("Editar bloco"), Icone: PencilSimple, fazer: () => editar(id) },
    duplicar: { rotulo: t("Duplicar bloco"), Icone: Copy, fazer: () => duplicar(id) },
    excluir: { rotulo: t("Excluir bloco"), Icone: Trash, fazer: () => excluir(id), perigo: true },
  };

  return (
    <div
      className={cn(
        "w-60 rounded-lg border border-border bg-surface shadow-md transition-shadow",
        temErro && "border-error ring-2 ring-error ring-offset-1 ring-offset-bg",
      )}
      style={selected && !temErro ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
      data-testid={`node-card-${id}`}
      title={temErro ? errors!.join("; ") : undefined}
    >
      {showTarget && <Handle type="target" position={Position.Top} />}
      <div
        className={cn("flex items-center gap-2 px-2.5 py-2", (children || linhasDeSaida || rodape) && "border-b border-border")}
        style={{ backgroundColor: `${color}1f`, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: color }}
        >
          <Icon size={14} aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text" title={title}>
          {title}
        </p>
        <div className="flex shrink-0 items-center">
          {acoesVisiveis.map((a) => {
            const { rotulo, Icone, fazer, perigo } = BOTOES[a];
            return (
              <button
                key={a}
                type="button"
                aria-label={rotulo}
                title={rotulo}
                className={cn(
                  "nodrag flex h-6 w-6 items-center justify-center rounded-sm text-text-muted hover:bg-surface-elevated",
                  perigo ? "hover:text-error" : "hover:text-text",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  fazer();
                }}
                data-testid={`bloco-${a}-${id}`}
              >
                <Icone size={13} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
      {children ? (
        <div className="relative">
          <div ref={corpo} className="max-h-[220px] space-y-1.5 overflow-hidden px-2.5 py-2" data-testid={`previa-${id}`}>
            {children}
          </div>
          {transborda && !somenteLeitura && (
            <button
              type="button"
              className="nodrag block w-full border-t border-border px-2.5 py-1 text-left text-xs font-medium text-accent hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                editar(id);
              }}
              data-testid={`ver-mais-${id}`}
            >
              … + {t("ver mais")}
            </button>
          )}
        </div>
      ) : null}
      {temErro && (
        <p className="border-t border-error/30 px-2.5 py-1.5 text-xs leading-snug text-error-fg" data-testid={`node-error-${id}`}>
          {errors![0]}
        </p>
      )}
      {linhasDeSaida !== null && (
        <ul className="border-t border-border" data-testid={`node-branches-${id}`}>
          {linhasDeSaida.map((s) => (
            <li
              key={s.id}
              className={cn(
                "relative flex items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5 text-xs first:border-t-0",
                s.escape && "italic text-text-muted",
              )}
              data-testid={`node-branch-${id}-${s.id}`}
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.escape ? "#71717a" : color }} />
              <span className="line-clamp-2 min-w-0 break-words leading-tight">{s.conteudo}</span>
              <Handle type="source" id={s.id} position={Position.Right} style={{ top: "50%" }} />
            </li>
          ))}
        </ul>
      )}
      {rodape ? (
        <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-text-muted" data-testid={`rodape-${id}`}>
          {rodape}
        </p>
      ) : null}
      {showSource && linhasDeSaida === null && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
