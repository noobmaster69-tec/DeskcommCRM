"use client";

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { Copy, CornerDownRight, Pencil, Trash2, type LucideIcon } from "lucide-react";

import { useT } from "@/hooks/i18n/useT";

import { useCanvasDoFluxo } from "./canvas-do-fluxo";
import { temaDoBloco, varsDoBloco } from "./tema-dos-blocos";

export type AcaoDoCartao = "editar" | "duplicar" | "excluir";

export interface SaidaDoCartao {
  id: string;
  conteudo: ReactNode;
  /** À direita da linha, 11px (ex.: "34%"). */
  valor?: ReactNode;
  icone?: LucideIcon;
  /** A saída de escape ("nenhuma serve"): itálico, apagada. */
  escape?: boolean;
}

interface Props {
  id: string;
  /** Tipo do bloco: ícone, categoria e cores saem de BLOCK_THEME. */
  tipo: string;
  title: string;
  selected?: boolean;
  errors?: string[];
  showTarget?: boolean;
  showSource?: boolean;
  /** Mais de uma saída: uma linha de 36px com alça própria para cada. */
  saidas?: SaidaDoCartao[];
  /** Separador "OU" entre as saídas (Aguardar resposta). */
  ouEntreSaidas?: boolean;
  acoes?: readonly AcaoDoCartao[];
  children?: ReactNode;
}

const TODAS: readonly AcaoDoCartao[] = ["editar", "duplicar", "excluir"];

/**
 * O cartão de bloco do canvas de FLUXOS (redesenho de 17 out): 264px, borda e
 * cabeçalho na cor do tipo, corpo em linhas tingidas. Editar/duplicar/excluir
 * saem do cabeçalho para uma barra flutuante 42px acima do card, visível no
 * hover ou com o bloco selecionado. Entrada à esquerda na altura do cabeçalho;
 * saída única à direita embaixo; saídas múltiplas, uma alça por linha.
 */
export function FluxoNode({
  id,
  tipo,
  title,
  selected,
  errors,
  showTarget = true,
  showSource = true,
  saidas,
  ouEntreSaidas = false,
  acoes = TODAS,
  children,
}: Props) {
  const t = useT();
  const { editar, duplicar, excluir, somenteLeitura } = useCanvasDoFluxo();
  const acoesVisiveis = somenteLeitura ? [] : acoes;
  const tema = temaDoBloco(tipo);
  const Icone = tema.icon;
  const corpo = useRef<HTMLDivElement>(null);
  const [transborda, setTransborda] = useState(false);
  const temErro = (errors?.length ?? 0) > 0;
  const linhasDeSaida = saidas !== undefined && saidas.length > 1 ? saidas : null;
  const temCorpo = Boolean(children) || linhasDeSaida !== null;

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

  const BOTOES: Record<AcaoDoCartao, { rotulo: string; Icone: LucideIcon; fazer: () => void; perigo?: boolean }> = {
    editar: { rotulo: t("Editar bloco"), Icone: Pencil, fazer: () => editar(id) },
    duplicar: { rotulo: t("Duplicar bloco"), Icone: Copy, fazer: () => duplicar(id) },
    excluir: { rotulo: t("Excluir bloco"), Icone: Trash2, fazer: () => excluir(id), perigo: true },
  };

  return (
    <div
      className="fx-node"
      style={varsDoBloco(tipo)}
      data-selected={selected ? "true" : undefined}
      data-erro={temErro ? "true" : undefined}
      data-so-cabecalho={temCorpo || temErro ? undefined : "true"}
      data-testid={`node-card-${id}`}
      title={temErro ? errors!.join("; ") : undefined}
    >
      {acoesVisiveis.length > 0 && (
        <div className="fx-node__acoes nodrag" data-testid={`acoes-${id}`}>
          {acoesVisiveis.map((a) => {
            const { rotulo, Icone: IconeDaAcao, fazer, perigo } = BOTOES[a];
            return (
              <button
                key={a}
                type="button"
                aria-label={rotulo}
                title={rotulo}
                className="fx-node__acao"
                data-perigo={perigo ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  fazer();
                }}
                data-testid={`bloco-${a}-${id}`}
              >
                <IconeDaAcao size={15} aria-hidden />
              </button>
            );
          })}
        </div>
      )}
      {showTarget && <Handle type="target" position={Position.Left} className="fx-h fx-h--in" />}

      <div className="fx-node__head">
        <span className="fx-node__icon">
          <Icone size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="fx-node__title" title={title}>
            {title}
          </p>
          {tema.categoria && <p className="fx-node__cat">{t(tema.categoria)}</p>}
        </div>
      </div>

      {temCorpo && (
        <div className="fx-node__body">
          {children ? (
            <>
              <div
                ref={corpo}
                className="flex max-h-[220px] flex-col gap-1.5 overflow-hidden"
                data-testid={`previa-${id}`}
              >
                {children}
              </div>
              {transborda && !somenteLeitura && (
                <button
                  type="button"
                  className="fx-node__mais nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    editar(id);
                  }}
                  data-testid={`ver-mais-${id}`}
                >
                  … + {t("ver mais")}
                </button>
              )}
            </>
          ) : null}
          {linhasDeSaida !== null && (
            <ul className="flex flex-col gap-1.5" data-testid={`node-branches-${id}`}>
              {linhasDeSaida.map((s, i) => {
                const IconeDaSaida = s.icone ?? CornerDownRight;
                return (
                  <Fragment key={s.id}>
                    {ouEntreSaidas && i > 0 && (
                      <li className="fx-or" aria-hidden>
                        {t("OU")}
                      </li>
                    )}
                    <li className="fx-out" data-escape={s.escape ? "true" : undefined} data-testid={`node-branch-${id}-${s.id}`}>
                      <IconeDaSaida size={14} aria-hidden />
                      <span className="fx-out__name">{s.conteudo}</span>
                      {s.valor !== undefined && s.valor !== null && <span className="fx-out__value">{s.valor}</span>}
                      <Handle type="source" id={s.id} position={Position.Right} className="fx-h fx-h--ramo" />
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {temErro && (
        <p className={temCorpo ? "fx-node__erro" : "fx-node__erro mt-2.5"} data-testid={`node-error-${id}`}>
          {errors![0]}
        </p>
      )}
      {showSource && linhasDeSaida === null && <Handle type="source" position={Position.Right} className="fx-h fx-h--out" />}
    </div>
  );
}
