"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Search } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { NodeType } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import { DESCRICAO_DO_BLOCO } from "./descricoes-dos-blocos";
import { GRUPOS_DO_DOCK, temaDoBloco, varsDoBloco } from "./tema-dos-blocos";

/** O mesmo MIME que o `onDrop` do canvas lê. */
export const DND_MIME_DO_BLOCO = "application/x-followup-node-type";

/** Onde o tamanho do dock fica guardado (por navegador). */
export const CHAVE_DO_TAMANHO = "fluxos:dock-tamanho";

export type TamanhoDoDock = "grande" | "pequeno";

/** Normaliza para a busca: sem acento, sem caixa ("notificacao" acha "Notificação"). */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function lerTamanho(): TamanhoDoDock {
  try {
    return window.localStorage.getItem(CHAVE_DO_TAMANHO) === "pequeno" ? "pequeno" : "grande";
  } catch {
    return "grande";
  }
}

/** A tecla "/" vale só fora de campo de texto (senão ninguém digita uma barra). */
function digitandoEmCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName);
}

interface Props {
  /** Clique: o canvas cria no centro da área visível, ligado ao bloco selecionado. */
  onAdd: (tipo: NodeType) => void;
  /** Com um modal aberto, "/" não abre a busca. */
  desligado?: boolean;
}

/**
 * Dock de blocos do construtor de FLUXOS, fixo embaixo no centro do canvas, no
 * lugar do botão "Ferramentas". Arrastar um item solta o bloco onde o mouse
 * estiver; clicar cria no centro da tela; "/" abre a busca rápida acima dele.
 */
export function DockDeBlocos({ onAdd, desligado = false }: Props) {
  const t = useT();
  const [tamanho, setTamanho] = useState<TamanhoDoDock>("grande");
  const [buscando, setBuscando] = useState(false);

  // Depois de montar: o servidor não conhece o localStorage, e ler o navegador
  // no inicializador do useState quebra a hidratação (cerca da casa).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTamanho(lerTamanho()), []);

  useEffect(() => {
    if (desligado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || digitandoEmCampo(e.target)) return;
      e.preventDefault();
      setBuscando(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desligado]);

  const alternar = () => {
    const novo: TamanhoDoDock = tamanho === "grande" ? "pequeno" : "grande";
    setTamanho(novo);
    try {
      window.localStorage.setItem(CHAVE_DO_TAMANHO, novo);
    } catch {
      // Sem armazenamento (aba privada): vale só nesta visita.
    }
  };

  return (
    <>
      {buscando && (
        <BuscaRapida
          onEscolher={(tipo) => {
            onAdd(tipo);
            setBuscando(false);
          }}
          onFechar={() => setBuscando(false)}
        />
      )}
      <TooltipProvider delayDuration={250}>
        <div
          className="fx-overlay fx-panel fx-dock"
          data-tamanho={tamanho}
          role="toolbar"
          aria-label={t("Blocos")}
          data-testid="dock-de-blocos"
        >
          {GRUPOS_DO_DOCK.map((grupo, g) => (
            <Fragment key={grupo.nome}>
              {g > 0 && <span className="fx-dock__sep" aria-hidden />}
              <div className="fx-dock__grupo" role="group" aria-label={t(grupo.nome)}>
                {grupo.tipos.map((tipo) => {
                  const tema = temaDoBloco(tipo);
                  const Icone = tema.icon;
                  const descricao = DESCRICAO_DO_BLOCO[tipo];
                  return (
                    <Tooltip key={tipo}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          draggable
                          className="fx-dock__item"
                          style={varsDoBloco(tipo)}
                          aria-label={t(tema.label)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DND_MIME_DO_BLOCO, tipo);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => onAdd(tipo)}
                          data-testid={`dock-${tipo}`}
                        >
                          <span className="fx-dock__quadrado">
                            <Icone size={tamanho === "grande" ? 17 : 15} aria-hidden />
                          </span>
                          <span className="fx-dock__label">{t(tema.curto)}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={10} className="fx-portal fx-dock-tip">
                        <strong className="font-semibold">{t(tema.label)}</strong>
                        {descricao && <span> — {t(descricao)}</span>}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </Fragment>
          ))}
          <span className="fx-dock__sep" aria-hidden />
          <button
            type="button"
            className="fx-iconbtn fx-dock__alternar"
            onClick={alternar}
            aria-label={tamanho === "grande" ? t("Diminuir dock") : t("Aumentar dock")}
            title={tamanho === "grande" ? t("Diminuir dock") : t("Aumentar dock")}
            data-testid="dock-alternar"
          >
            {tamanho === "grande" ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          </button>
        </div>
      </TooltipProvider>
    </>
  );
}

/** A busca do "/": popover acima do dock, setas escolhem, Enter cria, Esc fecha. */
function BuscaRapida({ onEscolher, onFechar }: { onEscolher: (tipo: NodeType) => void; onFechar: () => void }) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  const tipos = useMemo(() => {
    const q = normalizarBusca(busca);
    return GRUPOS_DO_DOCK.flatMap((g) => g.tipos).filter((tipo) => {
      if (q === "") return true;
      const tema = temaDoBloco(tipo);
      const descricao = DESCRICAO_DO_BLOCO[tipo];
      return normalizarBusca(`${t(tema.label)} ${t(tema.curto)} ${descricao ? t(descricao) : ""}`).includes(q);
    });
  }, [busca, t]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) onFechar();
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [onFechar]);

  return (
    <div ref={caixa} className="fx-overlay fx-panel fx-busca" data-testid="dock-busca">
      <div className="relative mb-1.5">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fx-muted)]" />
        <input
          autoFocus
          value={busca}
          placeholder={t("Buscar blocos...")}
          aria-label={t("Buscar blocos...")}
          onChange={(e) => {
            setBusca(e.target.value);
            setAtivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onFechar();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setAtivo((a) => Math.min(a + 1, tipos.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && tipos[ativo]) onEscolher(tipos[ativo]);
          }}
          data-testid="dock-busca-campo"
        />
      </div>
      <ul className="max-h-72 overflow-y-auto" role="listbox" aria-label={t("Blocos")}>
        {tipos.map((tipo, i) => {
          const tema = temaDoBloco(tipo);
          const Icone = tema.icon;
          const descricao = DESCRICAO_DO_BLOCO[tipo];
          return (
            <li key={tipo}>
              <button
                type="button"
                role="option"
                aria-selected={i === ativo}
                className="fx-busca__item"
                data-ativo={i === ativo ? "true" : undefined}
                style={varsDoBloco(tipo)}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => onEscolher(tipo)}
                data-testid={`dock-busca-${tipo}`}
              >
                <span className="fx-dock__quadrado" style={{ width: 28, height: 28, borderRadius: 8 }}>
                  <Icone size={14} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t(tema.label)}</span>
                  {descricao && <span className="block truncate text-[12px] text-[var(--fx-muted)]">{t(descricao)}</span>}
                </span>
              </button>
            </li>
          );
        })}
        {tipos.length === 0 && (
          <li className="px-2 py-3 text-center text-[12px] text-[var(--fx-muted)]">{t("Nenhum bloco encontrado.")}</li>
        )}
      </ul>
    </div>
  );
}
