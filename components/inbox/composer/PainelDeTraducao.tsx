"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { useMudarIdiomasDaConversa } from "@/hooks/inbox/useIdiomasDaConversa";
import { nomeDaLingua } from "@/lib/translation/idiomas";
import { Languages } from "../icones";

/**
 * "SERÁ ENVIADO EM INGLÊS" — a prévia da tradução de saída acima do campo
 * (fork jhoow, Fase C). "Editar tradução" abre o texto para ajuste à mão;
 * "Traduzir automaticamente" desliga a chave de saída da conversa.
 */
export function PainelDeTraducao({
  conversationId,
  para,
  previa,
  carregando,
  falhou,
  onEditar,
}: {
  conversationId: string;
  para: string;
  previa: string | null;
  carregando: boolean;
  falhou: boolean;
  onEditar: (traducao: string) => void;
}) {
  const t = useT();
  const mudar = useMudarIdiomasDaConversa(conversationId);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const lingua = t(nomeDaLingua(para));

  return (
    <div className="mb-2 rounded-[12px] border border-ibx-border bg-ibx-field px-3 py-2" data-testid="painel-de-traducao">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ibx-muted">
          <Languages size={12} aria-hidden />
          {t("Será enviado em")} {lingua}
        </span>
        <div className="flex items-center gap-3 text-[12px]">
          {previa && (
            <button
              type="button"
              className="font-medium text-ibx-link hover:underline"
              onClick={() => {
                setRascunho(previa);
                setEditando(true);
              }}
            >
              {t("Editar tradução")}
            </button>
          )}
          <button
            type="button"
            className="text-ibx-muted hover:text-ibx-text hover:underline"
            disabled={mudar.isPending}
            onClick={() => mudar.mutate({ saida: false })}
            title={t("Desliga a tradução das suas respostas nesta conversa")}
          >
            {t("Não traduzir")}
          </button>
        </div>
      </div>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-[13px] text-ibx-text-2" aria-live="polite">
        {previa ?? (falhou ? t("Tradução indisponível. Tente de novo em instantes.") : carregando ? t("Traduzindo…") : "")}
      </p>
      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-w-lg space-y-3">
          <DialogTitle>{t("Editar tradução")}</DialogTitle>
          <textarea
            className="min-h-32 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            aria-label={t("Tradução")}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="h-8 rounded-md border border-border px-3 text-sm" onClick={() => setEditando(false)}>
              {t("Cancelar")}
            </button>
            <button
              type="button"
              className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
              disabled={!rascunho.trim()}
              onClick={() => {
                onEditar(rascunho.trim());
                setEditando(false);
              }}
            >
              {t("Usar esta tradução")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
