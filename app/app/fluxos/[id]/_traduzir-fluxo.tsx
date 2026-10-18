"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Languages } from "lucide-react";

import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * "Traduzir mensagens para o idioma do contato ao enviar" (fork jhoow, 9022),
 * agora um item do menu "…" da topbar do editor (redesenho de 17 out).
 * Ligado: cada texto do bloco Mensagem é traduzido antes de sair, e as
 * variáveis de tempo (`{saudacao_horario}`) já vêm no idioma do contato.
 * Desligado (padrão): o fluxo sai como foi escrito.
 */
export function TraduzirFluxo({ flowId, inicial }: { flowId: string; inicial: boolean }) {
  const t = useT();
  const [ligado, setLigado] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  return (
    <DropdownMenuCheckboxItem
      checked={ligado}
      disabled={salvando}
      // Fica aberto: a pessoa vê o ✓ mudar.
      onSelect={(e) => e.preventDefault()}
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
      data-testid="traduzir-fluxo"
    >
      <Languages size={14} aria-hidden className="mr-2" />
      {t("Traduzir para o idioma do contato")}
    </DropdownMenuCheckboxItem>
  );
}
