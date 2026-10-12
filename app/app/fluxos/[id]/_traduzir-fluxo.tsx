"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * "Traduzir mensagens para o idioma do contato ao enviar" (fork jhoow, 9022).
 * Ligado: cada texto do bloco Mensagem é traduzido antes de sair, e as
 * variáveis de tempo (`{saudacao_horario}`) já vêm no idioma do contato.
 * Desligado (padrão): o fluxo sai como foi escrito.
 */
export function TraduzirFluxo({ flowId, inicial }: { flowId: string; inicial: boolean }) {
  const t = useT();
  const [ligado, setLigado] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-4 py-1.5 text-xs text-text-muted">
      <label htmlFor="traduzir-fluxo" className="cursor-pointer">
        {t("Traduzir mensagens para o idioma do contato ao enviar")}
      </label>
      <Switch
        id="traduzir-fluxo"
        checked={ligado}
        disabled={salvando}
        onCheckedChange={async (v) => {
          setSalvando(true);
          setLigado(v);
          try {
            await apiClient.patch(`/api/v1/fluxos/${flowId}`, { traduzir_para_o_contato: v });
          } catch {
            setLigado(!v);
            toast.error(t("Não foi possível salvar o fluxo."));
          } finally {
            setSalvando(false);
          }
        }}
      />
    </div>
  );
}
