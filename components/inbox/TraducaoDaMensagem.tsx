"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { nomeDaLingua } from "@/lib/translation/idiomas";
import type { Message } from "@/lib/types/messaging";
import { cn } from "@/lib/utils";
import { Languages } from "./icones";

/**
 * A TRADUÇÃO NA BOLHA (fork jhoow, Fase B — e o mesmo componente no drawer do
 * funil, que reusa a bolha). Decide o que a bolha mostra e desenha a linha de
 * baixo: "Traduzido do inglês · Ver original", ou o aviso de falha com
 * "tentar novamente?".
 */
export function estadoDaTraducao(m: Message): "traduzida" | "enviada_traduzida" | "falhou" | null {
  if (m.direction === "inbound" && m.translation_status === "done" && m.content_translated) return "traduzida";
  if (m.direction === "inbound" && m.translation_status === "failed") return "falhou";
  if (m.direction === "outbound" && m.content_original && m.content_original !== m.body) return "enviada_traduzida";
  return null;
}

/** O texto que a bolha mostra: a tradução (entrada) ou o que saiu (saída), salvo "Ver original". */
export function textoDaBolha(m: Message, verOriginal: boolean): string | null {
  const estado = estadoDaTraducao(m);
  if (estado === "traduzida") return verOriginal ? m.body : m.content_translated!;
  if (estado === "enviada_traduzida") return verOriginal ? m.content_original! : m.body;
  return m.body;
}

export function LinhaDaTraducao({
  message,
  verOriginal,
  onAlternar,
}: {
  message: Message;
  verOriginal: boolean;
  onAlternar: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [tentando, setTentando] = useState(false);
  const [erro, setErro] = useState(false);
  const estado = estadoDaTraducao(message);
  if (!estado) return null;
  const saida = message.direction === "outbound";

  if (estado === "falhou") {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ibx-muted" data-testid="traducao-falhou">
        <Languages size={11} aria-hidden />
        {t("Tradução indisponível")} —{" "}
        <button
          type="button"
          disabled={tentando}
          className="font-medium text-ibx-link hover:underline disabled:opacity-60"
          onClick={async () => {
            setTentando(true);
            setErro(false);
            try {
              await apiClient.post(`/api/v1/messages/${message.id}/traducao`, {});
              await qc.invalidateQueries({ queryKey: ["messages", message.conversation_id] });
            } catch {
              setErro(true);
            } finally {
              setTentando(false);
            }
          }}
        >
          {tentando ? t("Traduzindo…") : t("tentar novamente?")}
        </button>
        {erro && <span>{t("Ainda indisponível.")}</span>}
      </p>
    );
  }

  const lingua = t(nomeDaLingua(saida ? message.translated_to : message.content_locale));
  return (
    <p
      className={cn("mt-1 flex flex-wrap items-center gap-1 text-[11px]", saida ? "text-ibx-sent-meta" : "text-ibx-muted")}
      data-testid="linha-da-traducao"
    >
      <Languages size={11} aria-hidden />
      {saida ? `${t("Enviado em")} ${lingua}` : `${t("Traduzido do")} ${lingua}`} ·{" "}
      <button
        type="button"
        className={cn("font-medium hover:underline", saida ? "text-white" : "text-ibx-link")}
        aria-pressed={verOriginal}
        onClick={onAlternar}
      >
        {verOriginal ? t("Ver tradução") : t("Ver original")}
      </button>
    </p>
  );
}
