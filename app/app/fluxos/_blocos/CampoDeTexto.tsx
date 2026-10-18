"use client";

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Bold, Braces, Code, Italic, Smile, Strikethrough, WandSparkles } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";

// Lazy: o seletor de emoji (+dados) só carrega quando alguém o abre.
const SeletorDeEmoji = lazy(() => import("@emoji-mart/react"));

/** `{variavel}` — o que o motor interpola e o editor mostra como chip. */
const VARIAVEL = /\{[^{}\s]+\}/g;

function chip(texto: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "fx-editor__chip";
  s.contentEditable = "false";
  s.dataset.var = texto;
  s.textContent = texto;
  return s;
}

/** Texto puro → nós do editor: trechos de texto e chips de variável. */
function desenhar(el: HTMLElement, valor: string) {
  const nos: Node[] = [];
  let ultimo = 0;
  for (const m of valor.matchAll(VARIAVEL)) {
    const i = m.index ?? 0;
    if (i > ultimo) nos.push(document.createTextNode(valor.slice(ultimo, i)));
    nos.push(chip(m[0]));
    ultimo = i + m[0].length;
  }
  if (ultimo < valor.length) nos.push(document.createTextNode(valor.slice(ultimo)));
  el.replaceChildren(...nos);
}

/** Nós do editor → texto puro (o que vai para o grafo). */
export function serializar(no: Node): string {
  let out = "";
  no.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) out += c.textContent ?? "";
    else if (c instanceof HTMLElement) {
      if (c.dataset.var) out += c.dataset.var;
      else if (c.tagName === "BR") out += "\n";
      else if (c.tagName === "DIV" || c.tagName === "P") out += (out && !out.endsWith("\n") ? "\n" : "") + serializar(c);
      else out += serializar(c);
    }
  });
  return out;
}

/** Posição (no texto puro) de um ponto do DOM dentro do editor. */
function posicao(el: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(container, offset);
  const caixa = document.createElement("div");
  caixa.append(r.cloneContents());
  return serializar(caixa).length;
}

function colocarCursor(el: HTMLElement, alvo: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  let resto = alvo;
  for (const c of Array.from(el.childNodes)) {
    const tamanho = c instanceof HTMLElement && c.dataset.var ? c.dataset.var.length : (c.textContent ?? "").length;
    if (resto <= tamanho) {
      if (c.nodeType === Node.TEXT_NODE) r.setStart(c, resto);
      else r.setStartAfter(c);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    resto -= tamanho;
  }
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * Texto de bloco de fluxo: formatação do WhatsApp (*negrito*, _itálico_,
 * ~riscado~, ```código```) e variáveis `{nome}`, que aparecem como chips no
 * meio do texto. O valor continua TEXTO PURO — o editor só desenha. Barra
 * embaixo: B, I, S, emoji, código | IA, e "{ } Variável" à direita.
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
  const area = useRef<HTMLDivElement>(null);
  const desenhado = useRef<string | null>(null);
  const selecao = useRef<{ ini: number; fim: number } | null>(null);
  const cursorDepois = useRef<number | null>(null);
  const [abrirVariaveis, setAbrirVariaveis] = useState(false);
  const [abrirEmoji, setAbrirEmoji] = useState(false);

  // Desenha quando o valor vem de fora (abrir, inserir pela barra); o que a
  // pessoa digita já está na tela e não é redesenhado (o cursor não pula).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || props.valor === desenhado.current) return;
    desenhar(el, props.valor);
    desenhado.current = props.valor;
    if (cursorDepois.current !== null) {
      el.focus();
      colocarCursor(el, cursorDepois.current);
      cursorDepois.current = null;
    }
  }, [props.valor]);

  // Guarda a seleção (em posição de texto puro): a barra e o emoji a usam depois do blur.
  useEffect(() => {
    const guardar = () => {
      const el = area.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return;
      selecao.current = { ini: posicao(el, r.startContainer, r.startOffset), fim: posicao(el, r.endContainer, r.endOffset) };
    };
    document.addEventListener("selectionchange", guardar);
    return () => document.removeEventListener("selectionchange", guardar);
  }, []);

  // A lista de variáveis fecha com um clique fora dela.
  const listaDeVariaveis = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abrirVariaveis) return;
    const fora = (e: globalThis.MouseEvent) => {
      if (!listaDeVariaveis.current?.contains(e.target as Node)) setAbrirVariaveis(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [abrirVariaveis]);

  function inserir(antes: string, depois = "") {
    const v = props.valor;
    const { ini, fim } = selecao.current ?? { ini: v.length, fim: v.length };
    const novo = v.slice(0, ini) + antes + v.slice(ini, fim) + depois + v.slice(fim);
    cursorDepois.current = ini + antes.length + (fim - ini) + (fim > ini ? depois.length : 0);
    selecao.current = { ini: cursorDepois.current, fim: cursorDepois.current };
    props.onChange(novo);
  }

  const lerDoEditor = () => {
    const el = area.current;
    if (!el) return;
    const v = serializar(el);
    desenhado.current = v;
    props.onChange(v);
  };

  // A barra não tira o foco do texto (a seleção continua valendo).
  const manterFoco = (e: MouseEvent) => e.preventDefault();
  const formatar = props.comFormatacao !== false;

  return (
    <div className="fx-editor">
      <div
        ref={area}
        role="textbox"
        aria-multiline="true"
        aria-label={props.rotulo}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        className="fx-editor__area"
        style={props.linhas ? { minHeight: Math.max(44, props.linhas * 20 + 20) } : undefined}
        data-placeholder={props.placeholder}
        onInput={lerDoEditor}
        // Colar sempre como texto puro (sem HTML de outro site).
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        // Ao sair, o que foi digitado como {variavel} vira chip.
        onBlur={() => {
          const el = area.current;
          if (el && desenhado.current !== null) desenhar(el, desenhado.current);
        }}
      />
      <div className="fx-editor__bar">
        {formatar && (
          <>
            <button type="button" className="fx-editor__tool" onMouseDown={manterFoco} onClick={() => inserir("*", "*")} aria-label={t("Negrito")} title={t("Negrito")}>
              <Bold size={15} aria-hidden />
            </button>
            <button type="button" className="fx-editor__tool" onMouseDown={manterFoco} onClick={() => inserir("_", "_")} aria-label={t("Itálico")} title={t("Itálico")}>
              <Italic size={15} aria-hidden />
            </button>
            <button type="button" className="fx-editor__tool" onMouseDown={manterFoco} onClick={() => inserir("~", "~")} aria-label={t("Riscado")} title={t("Riscado")}>
              <Strikethrough size={15} aria-hidden />
            </button>
          </>
        )}
        <Popover open={abrirEmoji} onOpenChange={setAbrirEmoji}>
          <PopoverTrigger asChild>
            <button type="button" className="fx-editor__tool" onMouseDown={manterFoco} aria-label={t("Emoji")} title={t("Emoji")}>
              <Smile size={15} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-auto border-none p-0 shadow-lg">
            {abrirEmoji && (
              <Suspense fallback={<div className="h-[420px] w-[352px]" />}>
                <SeletorDeEmoji
                  data={async () => (await import("@emoji-mart/data")).default}
                  locale="pt"
                  theme="dark"
                  previewPosition="none"
                  onEmojiSelect={(e: { native: string }) => {
                    inserir(e.native);
                    setAbrirEmoji(false);
                  }}
                />
              </Suspense>
            )}
          </PopoverContent>
        </Popover>
        {formatar && (
          <button type="button" className="fx-editor__tool" onMouseDown={manterFoco} onClick={() => inserir("```", "```")} aria-label={t("Código")} title={t("Código")}>
            <Code size={15} aria-hidden />
          </button>
        )}
        <span className="fx-editor__divisor" aria-hidden />
        {/* "Escrever com IA" ainda não tem ação no backend: o botão já ocupa o lugar. */}
        <button
          type="button"
          className="fx-editor__tool text-[var(--c-light)] disabled:opacity-60"
          disabled
          aria-label={t("Escrever com IA (em breve)")}
          title={t("Escrever com IA (em breve)")}
        >
          <WandSparkles size={15} aria-hidden />
        </button>
        <div ref={listaDeVariaveis} className="relative ml-auto">
          <button
            type="button"
            className="fx-editor__var"
            onMouseDown={manterFoco}
            onClick={() => setAbrirVariaveis((v) => !v)}
            aria-expanded={abrirVariaveis}
            aria-label={t("Inserir variável")}
          >
            <Braces size={13} aria-hidden />
            {t("Variável")}
          </button>
          {abrirVariaveis && (
            <ul role="listbox" aria-label={t("Variáveis")} className="fx-pop absolute bottom-9 right-0 z-50 max-h-56 w-56 overflow-auto">
              {props.variaveis.map((v) => (
                <li key={v}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="w-full rounded-md px-2 py-1.5 text-left font-[family-name:var(--font-inbox-mono)] text-[12px] text-[var(--c-light)] hover:bg-[#26262b]"
                    onMouseDown={manterFoco}
                    onClick={() => {
                      inserir(`{${v}}`);
                      setAbrirVariaveis(false);
                    }}
                  >
                    {`{${v}}`}
                  </button>
                </li>
              ))}
              {props.variaveis.length === 0 && <li className="px-2 py-1.5 text-[12px] text-[var(--fx-muted)]">{t("Nenhuma variável.")}</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
