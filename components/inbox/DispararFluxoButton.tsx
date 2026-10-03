"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CircleNotch, Lightning } from "@/lib/ui/icons";

/**
 * "⚡ Disparar fluxo" no cabeçalho da conversa (fork jhoow, Fase B): lista os
 * fluxos PUBLICADOS da organização e coloca o contato no escolhido
 * (`POST /api/v1/fluxos/:id/disparar`). A lista é lida só quando o menu abre.
 */
interface FluxoPublicado {
  id: string;
  name: string;
}

export function DispararFluxoButton({ conversationId }: { conversationId: string }) {
  const t = useT();
  const [fluxos, setFluxos] = useState<FluxoPublicado[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [disparando, setDisparando] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const resp = await fetch("/api/v1/ai/followup-flows?surface=fluxo");
      const json = (await resp.json().catch(() => null)) as
        | { data?: Array<{ id: string; name: string; status: string; active_version_id: string | null }> }
        | null;
      setFluxos(
        (json?.data ?? [])
          .filter((f) => f.status === "active" && f.active_version_id)
          .map((f) => ({ id: f.id, name: f.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch {
      setFluxos([]);
    } finally {
      setCarregando(false);
    }
  }

  async function disparar(f: FluxoPublicado) {
    setDisparando(f.id);
    try {
      const resp = await fetch(`/api/v1/fluxos/${f.id}/disparar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const json = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!resp.ok) {
        toast.error(json?.error?.message ?? t("Não foi possível disparar o fluxo."));
        return;
      }
      toast.success(`${t("Fluxo disparado:")} ${f.name}`);
    } finally {
      setDisparando(null);
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(aberto) => {
        if (aberto) void carregar();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="flex items-center gap-1" disabled={disparando !== null}>
          {disparando ? <CircleNotch size={12} className="animate-spin" aria-hidden /> : <Lightning size={12} aria-hidden />}
          {t("Disparar fluxo")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-text-muted">
          {t("Fluxos publicados")}
        </DropdownMenuLabel>
        {carregando && fluxos === null ? (
          <DropdownMenuItem disabled>{t("Carregando…")}</DropdownMenuItem>
        ) : fluxos && fluxos.length > 0 ? (
          fluxos.map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => void disparar(f)}>
              <span className="truncate">{f.name}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>{t("Nenhum fluxo publicado.")}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
