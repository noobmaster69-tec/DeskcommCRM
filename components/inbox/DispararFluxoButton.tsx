"use client";

import { useCallback, useEffect, useState } from "react";
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
import { CircleNotch, Lightning, Pause } from "@/lib/ui/icons";

/**
 * "⚡ Disparar fluxo" no cabeçalho da conversa (fork jhoow, Fase B): lista os
 * fluxos PUBLICADOS da organização e coloca o contato no escolhido
 * (`POST /api/v1/fluxos/:id/disparar`). A lista é lida só quando o menu abre.
 *
 * Com o contato já num fluxo (`GET /api/v1/fluxos/ativo`), o botão vira "Parar
 * fluxo" (`POST /api/v1/fluxos/parar`): o fluxo é encerrado e o agente de IA
 * volta a responder.
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
  const [ativo, setAtivo] = useState<{ nome: string } | null>(null);
  const [parando, setParando] = useState(false);

  const lerAtivo = useCallback(async () => {
    try {
      const resp = await fetch(`/api/v1/fluxos/ativo?conversation_id=${conversationId}`);
      const json = (await resp.json().catch(() => null)) as { data?: { nome: string } | null } | null;
      setAtivo(resp.ok && json?.data ? { nome: json.data.nome } : null);
    } catch {
      setAtivo(null);
    }
  }, [conversationId]);

  useEffect(() => {
    void lerAtivo();
    // O fluxo termina sozinho (Fim, tempo esgotado): relê de tempos em tempos.
    const t = setInterval(() => void lerAtivo(), 30_000);
    return () => clearInterval(t);
  }, [lerAtivo]);

  async function parar() {
    setParando(true);
    try {
      const resp = await fetch("/api/v1/fluxos/parar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const json = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!resp.ok) toast.error(json?.error?.message ?? t("Não foi possível parar o fluxo."));
      else toast.success(t("Fluxo parado. O agente de IA volta a responder."));
      await lerAtivo();
    } finally {
      setParando(false);
    }
  }

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
      await lerAtivo();
    } finally {
      setDisparando(null);
    }
  }

  if (ativo) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="flex items-center gap-1"
        disabled={parando}
        title={`${t("Em fluxo:")} ${ativo.nome}`}
        onClick={() => void parar()}
      >
        {parando ? <CircleNotch size={12} className="animate-spin" aria-hidden /> : <Pause size={12} aria-hidden />}
        {t("Parar fluxo")}
      </Button>
    );
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
