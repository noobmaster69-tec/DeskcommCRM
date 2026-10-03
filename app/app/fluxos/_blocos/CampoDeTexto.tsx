"use client";

import { useRef, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Texto de bloco de fluxo: formatação do WhatsApp (*negrito*, _itálico_,
 * ~riscado~, ```código```) e variáveis `{nome}` — o botão `{ }` lista as
 * sugestões e insere onde está o cursor. Fork jhoow, Fase B.
 */
export function CampoDeTexto(props: {
  valor: string;
  onChange: (v: string) => void;
  variaveis: readonly string[];
  placeholder?: string;
  rotulo: string;
  linhas?: number;
  comFormatacao?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [abrirVariaveis, setAbrirVariaveis] = useState(false);

  function inserir(antes: string, depois = "") {
    const el = ref.current;
    if (!el) return props.onChange(props.valor + antes + depois);
    const ini = el.selectionStart ?? props.valor.length;
    const fim = el.selectionEnd ?? props.valor.length;
    const novo = props.valor.slice(0, ini) + antes + props.valor.slice(ini, fim) + depois + props.valor.slice(fim);
    props.onChange(novo);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = ini + antes.length + (fim - ini);
      el.setSelectionRange(cursor, cursor);
    });
  }

  const botao = "h-7 min-w-7 rounded-sm px-1.5 text-xs text-text-muted hover:bg-surface-elevated hover:text-text";
  return (
    <div className="rounded-md border border-border bg-bg focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        {props.comFormatacao !== false && (
          <>
            <button type="button" className={cn(botao, "font-bold")} onClick={() => inserir("*", "*")} aria-label={t("Negrito")}>
              B
            </button>
            <button type="button" className={cn(botao, "italic")} onClick={() => inserir("_", "_")} aria-label={t("Itálico")}>
              I
            </button>
            <button type="button" className={cn(botao, "line-through")} onClick={() => inserir("~", "~")} aria-label={t("Riscado")}>
              S
            </button>
            <button type="button" className={cn(botao, "font-mono")} onClick={() => inserir("```", "```")} aria-label={t("Código")}>
              {"</>"}
            </button>
          </>
        )}
        <div className="relative ml-auto">
          <button
            type="button"
            className={cn(botao, "font-mono")}
            onClick={() => setAbrirVariaveis((v) => !v)}
            aria-expanded={abrirVariaveis}
            aria-label={t("Inserir variável")}
          >
            {"{ }"}
          </button>
          {abrirVariaveis && (
            <ul
              role="listbox"
              aria-label={t("Variáveis")}
              className="absolute right-0 top-8 z-50 max-h-56 w-56 overflow-auto rounded-md border border-border bg-surface p-1 shadow-lg"
            >
              {props.variaveis.map((v) => (
                <li key={v}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="w-full rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-surface-elevated"
                    onClick={() => {
                      inserir(`{${v}}`);
                      setAbrirVariaveis(false);
                    }}
                  >
                    {`{${v}}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <textarea
        ref={ref}
        aria-label={props.rotulo}
        value={props.valor}
        onChange={(e) => props.onChange(e.target.value)}
        rows={props.linhas ?? 3}
        placeholder={props.placeholder}
        className="w-full resize-y bg-transparent px-3 py-2 text-sm text-text outline-hidden placeholder:text-text-subtle"
      />
    </div>
  );
}
