"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

export type ModoDoComposer = "reply" | "note";

/**
 * Responder | Nota — alternador segmentado embaixo do campo (Inbox, painéis
 * flutuantes). Substitui o menu "Responder ▼": as duas opções ficam à vista, e
 * Cmd/Ctrl+Shift+N alterna (o atalho mora no Composer, que é dono do foco).
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
  const OPCOES: { valor: ModoDoComposer; rotulo: string }[] = [
    { valor: "reply", rotulo: t("Responder") },
    { valor: "note", rotulo: t("Nota") },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("Modo do composer")}
      title={t("Cmd/Ctrl+Shift+N alterna Responder e Nota")}
      className={cn(
        "inline-flex h-7 items-center gap-0.5 rounded-[8px] p-0.5",
        modo === "note" ? "bg-ibx-note-chip" : "bg-ibx-chip",
      )}
      data-testid="seletor-de-modo"
      data-modo={modo}
    >
      {OPCOES.map(({ valor, rotulo }) => {
        const ativo = modo === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={disabled}
            onClick={() => onMudar(valor)}
            className={cn(
              "inline-flex h-6 items-center rounded-[6px] px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ibx-accent",
              ativo
                ? valor === "note"
                  ? "bg-ibx-note-accent text-black"
                  : "bg-ibx-chip-strong text-ibx-text"
                : "text-ibx-muted hover:text-ibx-text",
            )}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
