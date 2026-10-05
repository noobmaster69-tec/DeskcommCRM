"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderPlus, FolderSimple, Lightning, MagnifyingGlass, Plus, UploadSimple } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { arvoreDePastas, idsDaPastaEDescendentes, type NoDaArvore, type PastaDoFluxo } from "@/lib/fluxos/pastas";
import { passaNoFiltro, proximoNomeDeFluxo, type FiltroDeStatus, type StatusDoFluxo } from "@/lib/fluxos/lista";
import { ImportarDoLeona } from "./ImportarDoLeona";
import { MenuDoFluxo } from "./MenuDoFluxo";

export interface FluxoDaLista {
  id: string;
  nome: string;
  status: StatusDoFluxo;
  pasta_id: string | null;
  blocos: number;
  atualizado_em: string;
  /** Tem versão publicada — só então "Reativar" faz sentido (item 2). */
  publicado: boolean;
  arquivado: boolean;
}

const FILTROS: { valor: FiltroDeStatus; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "pausados", rotulo: "Pausados" },
  { valor: "arquivados", rotulo: "Arquivados" },
];

/**
 * A lista de Fluxos (fork jhoow, Etapa 2 — Fase A): busca, filtro de status,
 * pastas com contador e a tabela. Clicar numa linha abre o editor.
 */
export function ListaDeFluxos({ fluxos, pastas }: { fluxos: FluxoDaLista[]; pastas: PastaDoFluxo[] }) {
  const t = useT();
  const router = useRouter();
  const locale = useLocaleDeData();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeStatus>("todos");
  const [pastaAtual, setPastaAtual] = useState<string | null>(null);
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [nomeDaPasta, setNomeDaPasta] = useState("");
  const [importando, setImportando] = useState(false);
  const [ocupado, startTransition] = useTransition();

  const arvore = useMemo(() => {
    const porPasta = new Map<string, number>();
    for (const f of fluxos) if (f.pasta_id && !f.arquivado) porPasta.set(f.pasta_id, (porPasta.get(f.pasta_id) ?? 0) + 1);
    return arvoreDePastas(pastas, porPasta);
  }, [fluxos, pastas]);

  const visiveis = useMemo(() => {
    const naPasta = pastaAtual ? idsDaPastaEDescendentes(arvore, pastaAtual) : null;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return fluxos.filter(
      (f) =>
        passaNoFiltro(f.status, filtro, f.arquivado) &&
        (!naPasta || (f.pasta_id !== null && naPasta.has(f.pasta_id))) &&
        (!termo || f.nome.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [fluxos, filtro, busca, pastaAtual, arvore]);

  function novoFluxo() {
    startTransition(async () => {
      const usados = fluxos.map((f) => f.nome);
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        const nome = proximoNomeDeFluxo(usados);
        const resp = await fetch("/api/v1/ai/followup-flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nome, surface: "fluxo", pasta_id: pastaAtual }),
        }).catch(() => null);
        if (resp?.status === 409) {
          // O nome é único na organização inteira (follow-ups inclusive).
          usados.push(nome);
          continue;
        }
        const corpo = (await resp?.json().catch(() => null)) as { data?: { id?: string } } | null;
        if (!resp?.ok || !corpo?.data?.id) break;
        router.push(`/app/fluxos/${corpo.data.id}`);
        return;
      }
      toast.error(t("Não foi possível criar o fluxo."));
    });
  }

  function criarPasta() {
    const nome = nomeDaPasta.trim();
    if (!nome) return;
    startTransition(async () => {
      const resp = await fetch("/api/v1/fluxos/pastas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, parent_id: pastaAtual }),
      }).catch(() => null);
      if (!resp?.ok) {
        toast.error(t("Não foi possível criar a pasta."));
        return;
      }
      setCriandoPasta(false);
      setNomeDaPasta("");
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <MagnifyingGlass size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar fluxos...")}
            aria-label={t("Buscar fluxos")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={t("Filtrar por status")}>
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filtro === f.valor
                  ? "border-accent bg-accent-soft font-semibold text-accent-text"
                  : "border-border text-text-muted hover:text-text",
              )}
            >
              {t(f.rotulo)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" onClick={novoFluxo} disabled={ocupado}>
            <Plus size={16} aria-hidden className="mr-1.5" />
            {t("Novo fluxo")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setCriandoPasta(true)} disabled={ocupado}>
            <FolderPlus size={16} aria-hidden className="mr-1.5" />
            {t("Pasta")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setImportando(true)} disabled={ocupado}>
            <UploadSimple size={16} aria-hidden className="mr-1.5" />
            {t("Importar")}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <nav aria-label={t("Pastas")} className="w-56 shrink-0 space-y-1 rounded-md border border-border bg-surface p-2">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t("Pastas")}</p>
          <ItemDePasta
            nome={t("Todos os fluxos")}
            total={fluxos.filter((f) => !f.arquivado).length}
            ativo={pastaAtual === null}
            nivel={0}
            onClick={() => setPastaAtual(null)}
          />
          {arvore.map((no) => (
            <RamoDePastas key={no.id} no={no} nivel={0} atual={pastaAtual} onEscolher={setPastaAtual} />
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">{t("Nome")}</th>
                <th className="px-4 py-2 font-semibold">{t("Status")}</th>
                <th className="px-4 py-2 font-semibold">{t("Blocos")}</th>
                <th className="px-4 py-2 font-semibold">{t("Atualizado")}</th>
                <th className="w-12 px-2 py-2">
                  <span className="sr-only">{t("Ações")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-muted">
                    {fluxos.length === 0
                      ? t("Nenhum fluxo ainda. Clique em \"Novo fluxo\" para começar.")
                      : t("Nenhum fluxo com esses filtros.")}
                  </td>
                </tr>
              ) : (
                visiveis.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/app/fluxos/${f.id}`)}
                    className="group cursor-pointer border-b border-border last:border-0 hover:bg-surface-elevated"
                  >
                    <td className="px-4 py-2.5">
                      <a href={`/app/fluxos/${f.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {f.nome}
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <PillDeStatus status={f.status} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Lightning size={14} aria-hidden />
                        {f.blocos}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">
                      {format(new Date(f.atualizado_em), "dd/MM/yyyy HH:mm", { locale })}
                    </td>
                    <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <MenuDoFluxo fluxo={f} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ImportarDoLeona aberto={importando} onAbertoChange={setImportando} pastaId={pastaAtual} />

      <Dialog open={criandoPasta} onOpenChange={setCriandoPasta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Nova pasta")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nomeDaPasta}
            onChange={(e) => setNomeDaPasta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criarPasta()}
            placeholder={t("Nome da pasta")}
            aria-label={t("Nome da pasta")}
            maxLength={80}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCriandoPasta(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="button" onClick={criarPasta} disabled={!nomeDaPasta.trim() || ocupado}>
              {t("Criar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PillDeStatus({ status }: { status: StatusDoFluxo }) {
  const t = useT();
  const estilo =
    status === "active"
      ? "bg-success-bg text-success-fg"
      : status === "disabled"
        ? "bg-error-bg text-error-fg"
        : "bg-surface-elevated text-text-muted";
  const rotulo = status === "active" ? "Ativo" : status === "disabled" ? "Pausado" : "Rascunho";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", estilo)}>{t(rotulo)}</span>;
}

function ItemDePasta(props: { nome: string; total: number; ativo: boolean; nivel: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.ativo ? "true" : undefined}
      style={{ paddingLeft: 8 + props.nivel * 14 }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm",
        props.ativo ? "bg-accent-soft font-semibold text-accent-text" : "text-text hover:bg-surface-elevated",
      )}
    >
      <FolderSimple size={16} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{props.nome}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-text-muted">
        <Lightning size={12} aria-hidden />
        {props.total}
      </span>
    </button>
  );
}

function RamoDePastas(props: {
  no: NoDaArvore;
  nivel: number;
  atual: string | null;
  onEscolher: (id: string) => void;
}) {
  return (
    <>
      <ItemDePasta
        nome={props.no.nome}
        total={props.no.total}
        ativo={props.atual === props.no.id}
        nivel={props.nivel + 1}
        onClick={() => props.onEscolher(props.no.id)}
      />
      {props.no.filhas.map((f) => (
        <RamoDePastas key={f.id} no={f} nivel={props.nivel + 1} atual={props.atual} onEscolher={props.onEscolher} />
      ))}
    </>
  );
}
