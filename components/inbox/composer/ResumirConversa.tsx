"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListBullets } from "@/lib/ui/icons";
import { useCreateNote } from "@/hooks/inbox/useCreateNote";
import { useT } from "@/hooks/i18n/useT";

type Estado =
  | { fase: "parado" }
  | { fase: "carregando" }
  | { fase: "pronto"; resumo: string }
  | { fase: "erro"; mensagem: string; semProvedor: boolean };

/**
 * A pílula "Resumir" (fork jhoow, composer compacto): resume a conversa com o
 * modelo da empresa (IA › Credenciais) e mostra num balão, com "Salvar como
 * nota" — o resumo não vai para o cliente e não é gravado sozinho.
 */
export function ResumirConversa({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ fase: "parado" });
  const createNote = useCreateNote();

  async function resumir() {
    setEstado({ fase: "carregando" });
    const resp = await fetch(`/api/v1/conversations/${conversationId}/resumo`, { method: "POST" }).catch(() => null);
    const json = (await resp?.json().catch(() => null)) as
      | { data?: { resumo?: string }; error?: { code?: string; message?: string } }
      | null;
    if (resp?.ok && json?.data?.resumo) setEstado({ fase: "pronto", resumo: json.data.resumo });
    else
      setEstado({
        fase: "erro",
        mensagem: json?.error?.message ?? t("Não foi possível resumir a conversa."),
        semProvedor: json?.error?.code === "sem_provedor",
      });
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) void resumir();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-transparent px-3.5 text-sm text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
          data-testid="acao-resumir"
        >
          <ListBullets size={15} aria-hidden />
          {t("Resumir")}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 space-y-2 p-3" data-testid="resumo-da-conversa">
        <p className="text-sm font-semibold">{t("Resumo da conversa")}</p>
        {estado.fase === "carregando" && <p className="text-sm text-text-muted">{t("Resumindo…")}</p>}
        {estado.fase === "erro" && (
          <p className="text-sm text-error-fg" role="alert">
            {estado.mensagem}{" "}
            {estado.semProvedor && (
              <Link href="/app/ai/credentials" className="font-medium underline">
                {t("Abrir Credenciais")}
              </Link>
            )}
          </p>
        )}
        {estado.fase === "pronto" && (
          <>
            <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm">{estado.resumo}</p>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={createNote.isPending}
                onClick={() =>
                  createNote.mutate(
                    { conversation_id: conversationId, body: `${t("Resumo da conversa")}:\n${estado.resumo}` },
                    { onSuccess: () => setAberto(false) },
                  )
                }
              >
                {t("Salvar como nota")}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
