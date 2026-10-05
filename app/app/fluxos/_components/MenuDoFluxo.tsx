"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Archive, Copy, DotsThree, Pause, PencilSimple, Play, ShareNetwork, Translate, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import type { IdiomaDeTraducao } from "@/lib/fluxos/traduzir";

export interface FluxoDoMenu {
  id: string;
  nome: string;
  status: "draft" | "active" | "disabled";
  publicado: boolean;
  arquivado: boolean;
}

const IDIOMAS: { valor: IdiomaDeTraducao; rotulo: string }[] = [
  { valor: "en", rotulo: "English" },
  { valor: "es", rotulo: "Español" },
  { valor: "pt", rotulo: "Português" },
];

async function chamar(url: string, metodo: string, corpo?: unknown) {
  const resp = await fetch(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).catch(() => null);
  const json = (await resp?.json().catch(() => null)) as
    | { data?: Record<string, unknown>; error?: { code?: string; message?: string } }
    | null;
  return { ok: Boolean(resp?.ok), status: resp?.status ?? 0, data: json?.data, erro: json?.error };
}

/**
 * O "⋯" de cada linha da lista de Fluxos (fork jhoow, item 2 — imagem 2 do
 * Leona): menu escuro, ícone à esquerda, Excluir em vermelho. Aparece no hover
 * da linha (e fica visível enquanto aberto ou com foco de teclado).
 *
 * Reusa as rotas que já existiam (nome, duplicar, excluir em
 * /api/v1/ai/followup-flows) e as novas do fork (mover/arquivar/ativar,
 * compartilhar, traduzir em /api/v1/fluxos).
 */
export function MenuDoFluxo({ fluxo }: { fluxo: FluxoDoMenu }) {
  const t = useT();
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(fluxo.nome);
  const [traduzindo, setTraduzindo] = useState(false);
  const [idioma, setIdioma] = useState<IdiomaDeTraducao>("en");
  const [erroDaTraducao, setErroDaTraducao] = useState<string | null>(null);
  const [semProvedor, setSemProvedor] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const executar = (fn: () => Promise<void>) => startTransition(fn);

  const renomear = () =>
    executar(async () => {
      const r = await chamar(`/api/v1/ai/followup-flows/${fluxo.id}`, "PATCH", { name: nome.trim() });
      if (!r.ok) {
        toast.error(r.status === 409 ? t("Já existe um fluxo com este nome.") : t("Não foi possível renomear o fluxo."));
        return;
      }
      setRenomeando(false);
      router.refresh();
    });

  const duplicar = () =>
    executar(async () => {
      const r = await chamar(`/api/v1/ai/followup-flows/${fluxo.id}/duplicate`, "POST");
      const id = r.data?.id;
      if (!r.ok || typeof id !== "string") {
        toast.error(t("Não foi possível duplicar o fluxo."));
        return;
      }
      router.push(`/app/fluxos/${id}`);
    });

  const compartilhar = () =>
    executar(async () => {
      const r = await chamar(`/api/v1/fluxos/${fluxo.id}/compartilhar`, "POST");
      const caminho = r.data?.caminho;
      if (!r.ok || typeof caminho !== "string") {
        toast.error(t("Não foi possível compartilhar o fluxo."));
        return;
      }
      const url = `${window.location.origin}${caminho}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t("Link copiado. Quem abrir vê o fluxo sem poder editar."));
      } catch {
        toast.message(url);
      }
    });

  const traduzir = () =>
    executar(async () => {
      setErroDaTraducao(null);
      setSemProvedor(false);
      const r = await chamar(`/api/v1/fluxos/${fluxo.id}/traduzir`, "POST", { idioma });
      if (!r.ok) {
        if (r.erro?.code === "sem_provedor") setSemProvedor(true);
        setErroDaTraducao(r.erro?.message ?? t("Não foi possível traduzir o fluxo."));
        return;
      }
      setTraduzindo(false);
      toast.success(`${t("Cópia traduzida criada:")} ${String(r.data?.nome ?? "")}`);
      router.refresh();
    });

  const patch = (corpo: Record<string, unknown>, sucesso: string) =>
    executar(async () => {
      const r = await chamar(`/api/v1/fluxos/${fluxo.id}`, "PATCH", corpo);
      if (!r.ok) {
        toast.error(r.erro?.message ?? t("Não foi possível salvar o fluxo."));
        return;
      }
      toast.success(t(sucesso));
      router.refresh();
    });

  const excluir = () =>
    executar(async () => {
      const r = await chamar(`/api/v1/ai/followup-flows/${fluxo.id}`, "DELETE");
      if (!r.ok) {
        toast.error(t("Não foi possível excluir o fluxo."));
        return;
      }
      setExcluindo(false);
      router.refresh();
    });

  const item = "gap-2.5 text-neutral-100 focus:bg-neutral-800 focus:text-white";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("Ações do fluxo")}
            disabled={ocupado}
            onClick={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted opacity-0 transition-opacity hover:bg-surface-elevated hover:text-text focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            data-testid={`menu-fluxo-${fluxo.id}`}
          >
            <DotsThree size={18} weight="bold" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 border-neutral-800 bg-neutral-900 text-neutral-100"
          onClick={(e) => e.stopPropagation()}
          data-testid={`menu-fluxo-conteudo-${fluxo.id}`}
        >
          <DropdownMenuItem className={item} onSelect={() => { setNome(fluxo.nome); setRenomeando(true); }}>
            <PencilSimple size={15} aria-hidden /> {t("Editar nome")}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={duplicar}>
            <Copy size={15} aria-hidden /> {t("Duplicar")}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={compartilhar}>
            <ShareNetwork size={15} aria-hidden /> {t("Compartilhar")}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={() => { setErroDaTraducao(null); setSemProvedor(false); setTraduzindo(true); }}>
            <Translate size={15} aria-hidden /> {t("Traduzir")}
          </DropdownMenuItem>
          {fluxo.status === "active" && (
            <DropdownMenuItem className={item} onSelect={() => patch({ ativo: false }, "Fluxo desativado.")}>
              <Pause size={15} aria-hidden /> {t("Desativar")}
            </DropdownMenuItem>
          )}
          {fluxo.status !== "active" && fluxo.publicado && !fluxo.arquivado && (
            <DropdownMenuItem className={item} onSelect={() => patch({ ativo: true }, "Fluxo reativado.")}>
              <Play size={15} aria-hidden /> {t("Reativar")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className={item}
            onSelect={() =>
              fluxo.arquivado
                ? patch({ arquivado: false }, "Fluxo desarquivado.")
                : patch({ arquivado: true }, "Fluxo arquivado.")
            }
          >
            <Archive size={15} aria-hidden /> {fluxo.arquivado ? t("Desarquivar") : t("Arquivar")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-neutral-800" />
          <DropdownMenuItem
            className="gap-2.5 text-red-400 focus:bg-red-500/15 focus:text-red-300"
            onSelect={() => setExcluindo(true)}
            data-testid={`menu-fluxo-excluir-${fluxo.id}`}
          >
            <Trash size={15} aria-hidden /> {t("Excluir")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renomeando} onOpenChange={setRenomeando}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("Editar nome")}</DialogTitle>
            <DialogDescription className="sr-only">{t("Novo nome do fluxo")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={nome}
            maxLength={80}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nome.trim() && renomear()}
            aria-label={t("Nome do fluxo")}
            data-testid="renomear-fluxo-input"
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRenomeando(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="button" onClick={renomear} disabled={!nome.trim() || nome.trim() === fluxo.nome || ocupado}>
              {t("Salvar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={traduzindo} onOpenChange={setTraduzindo}>
        <DialogContent onClick={(e) => e.stopPropagation()} data-testid="traduzir-fluxo-dialog">
          <DialogHeader>
            <DialogTitle>{t("Traduzir fluxo")}</DialogTitle>
            <DialogDescription>
              {t("Cria uma cópia com os textos das mensagens traduzidos. O fluxo original não muda.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Idioma")}>
            {IDIOMAS.map((i) => (
              <button
                key={i.valor}
                type="button"
                role="radio"
                aria-checked={idioma === i.valor}
                onClick={() => setIdioma(i.valor)}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  idioma === i.valor ? "border-accent bg-accent-soft font-semibold text-accent-text" : "border-border hover:bg-surface-elevated",
                )}
                data-testid={`traduzir-idioma-${i.valor}`}
              >
                {i.rotulo}
              </button>
            ))}
          </div>
          {erroDaTraducao && (
            <p className="text-sm text-error-fg" role="alert" data-testid="traduzir-erro">
              {erroDaTraducao}{" "}
              {semProvedor && (
                <Link href="/app/ai/credentials" className="font-medium underline">
                  {t("Abrir Credenciais")}
                </Link>
              )}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setTraduzindo(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="button" onClick={traduzir} disabled={ocupado} data-testid="traduzir-confirmar">
              {ocupado ? t("Traduzindo...") : t("Traduzir")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluindo} onOpenChange={setExcluindo}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir fluxo")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Tem certeza? Esta ação não pode ser desfeita.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                excluir();
              }}
              className="bg-red-600 text-white hover:bg-red-500"
              data-testid="excluir-fluxo-confirmar"
            >
              {t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
