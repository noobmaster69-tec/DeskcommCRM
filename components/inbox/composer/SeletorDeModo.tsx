"use client";

import { useEffect, useRef, useState } from "react";

import { CaretDown, ChatCircle, Note } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

export type ModoDoComposer = "reply" | "note";

/**
 * "Responder ▼" (fork jhoow, composer compacto) — no lugar das duas abas
 * "Responder / Nota interna". Um botão só, embaixo do campo, que abre a troca
 * de modo. Menu próprio (sem Radix): duas opções, fecha no clique fora e no Esc.
 */
export function SeletorDeModo({
  modo,
  onMudar,
  disabled,
}: {
  modo: ModoDoComposer;
  onMudar: (m: ModoDoComposer) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const OPCOES: { valor: ModoDoComposer; rotulo: string; Icone: typeof ChatCircle }[] = [
    { valor: "reply", rotulo: t("Responder"), Icone: ChatCircle },
    { valor: "note", rotulo: t("Nota interna"), Icone: Note },
  ];
  const atual = OPCOES.find((o) => o.valor === modo)!;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-50",
          modo === "reply" ? "bg-accent-soft text-accent-text hover:bg-accent-soft/80" : "bg-warning/20 text-warning-fg hover:bg-warning/30",
        )}
        data-testid="seletor-de-modo"
      >
        <atual.Icone size={15} aria-hidden />
        {atual.rotulo}
        <CaretDown size={12} aria-hidden />
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label={t("Modo do composer")}
          className="absolute bottom-full left-0 z-30 mb-1 w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {OPCOES.map(({ valor, rotulo, Icone }) => (
            <button
              key={valor}
              type="button"
              role="menuitemradio"
              aria-checked={modo === valor}
              onClick={() => {
                onMudar(valor);
                setAberto(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                modo === valor && "font-semibold",
              )}
            >
              <Icone size={15} aria-hidden />
              {rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
