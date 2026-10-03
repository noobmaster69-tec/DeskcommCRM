"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";

/**
 * Importar do Leona (fork jhoow, Fase D): cola o JSON do fluxo (ou escolhe o
 * arquivo .json), cria um RASCUNHO e mostra o que não tinha equivalente antes
 * de abrir o editor — nada é publicado sem alguém revisar.
 */
export function ImportarDoLeona({
  aberto,
  onAbertoChange,
  pastaId,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  pastaId: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ id: string; nome: string; blocos: number; avisos: string[] } | null>(null);
  const [ocupado, startTransition] = useTransition();

  function fechar(v: boolean) {
    onAbertoChange(v);
    if (!v) {
      setTexto("");
      setErro(null);
      setResultado(null);
    }
  }

  async function lerArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setTexto(await arquivo.text());
    setErro(null);
  }

  function importar() {
    let leona: unknown;
    try {
      leona = JSON.parse(texto);
    } catch {
      setErro(t("O texto colado não é um JSON válido."));
      return;
    }
    startTransition(async () => {
      setErro(null);
      const resp = await fetch("/api/v1/fluxos/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leona, pasta_id: pastaId }),
      }).catch(() => null);
      const corpo = (await resp?.json().catch(() => null)) as
        | { data?: { id: string; nome: string; blocos: number; avisos: string[] }; error?: { message?: string } }
        | null;
      if (!resp?.ok || !corpo?.data) {
        setErro(corpo?.error?.message ?? t("Não foi possível importar o fluxo."));
        return;
      }
      setResultado(corpo.data);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Importar fluxo do Leona")}</DialogTitle>
        </DialogHeader>
        {resultado ? (
          <div className="space-y-3 text-sm" data-testid="resultado-da-importacao">
            <p>
              {t("Fluxo criado como rascunho:")} <strong>{resultado.nome}</strong> ({resultado.blocos} {t("blocos")}).
            </p>
            {resultado.avisos.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium">{t("Revise antes de publicar:")}</p>
                <ul className="max-h-64 list-disc space-y-1 overflow-auto pl-5 text-xs text-text-muted">
                  {resultado.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              {t("Cole o JSON do fluxo do Leona ou escolha o arquivo .json. O fluxo entra como rascunho; mídias são copiadas para cá e a chave de IA do Leona não é importada.")}
            </p>
            <input
              type="file"
              accept="application/json,.json"
              aria-label={t("Arquivo .json do Leona")}
              onChange={(e) => void lerArquivo(e.target.files?.[0])}
              className="block text-xs"
            />
            <Textarea
              aria-label={t("JSON do fluxo do Leona")}
              rows={10}
              className="font-mono text-xs"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder='{"flow": {...}, "nodes": [...], "connections": [...]}'
            />
            {erro && <p className="text-xs text-error-fg">{erro}</p>}
          </div>
        )}
        <DialogFooter>
          {resultado ? (
            <Button type="button" onClick={() => router.push(`/app/fluxos/${resultado.id}`)}>
              {t("Abrir o fluxo")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => fechar(false)}>
                {t("Cancelar")}
              </Button>
              <Button type="button" onClick={importar} disabled={!texto.trim() || ocupado}>
                {ocupado ? t("Importando…") : t("Importar")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
