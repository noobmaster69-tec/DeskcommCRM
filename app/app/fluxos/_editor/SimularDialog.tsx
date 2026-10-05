"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

/**
 * Botão "Simular" ao lado de Ferramentas (fork jhoow, item 4). O simulador do
 * Leona roda o fluxo num chat de mentira; aqui ainda é um aviso "Em breve" —
 * o botão já ocupa o lugar dele para a tela não mudar de forma quando chegar.
 */
export function SimularDialog() {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-text shadow-md transition-colors hover:bg-surface-elevated"
        data-testid="simular-botao"
      >
        <Play size={14} weight="fill" aria-hidden />
        {t("Simular")}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent data-testid="simular-dialog">
          <DialogHeader>
            <DialogTitle>{t("Simulador de fluxo")}</DialogTitle>
            <DialogDescription>
              {t("Em breve: teste o fluxo numa conversa simulada, sem enviar nada a um contato de verdade.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setAberto(false)}>
              {t("Entendi")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
