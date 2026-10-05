"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { format } from "date-fns";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
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
import { ALVO_SEM_PASTA, ALVO_TODOS, alvoDaPasta, destinoDoSoltar } from "@/lib/fluxos/arrastar";
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

/** O filtro "Sem pasta" da barra lateral (não é id de pasta nenhuma). */
const SEM_PASTA = "__sem_pasta__";

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
  // Item 1: a pasta escolhida no arrasto vale na hora (otimista); o PATCH
  // confirma, e a falha devolve o fluxo para onde estava.
  const [movidos, setMovidos] = useState<Record<string, string | null>>({});
  const [arrastando, setArrastando] = useState<FluxoDaLista | null>(null);
  // Distância mínima: sem ela, todo clique na linha (que abre o editor) viraria arrasto.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const fluxosVivos = useMemo(
    () => fluxos.map((f) => (f.id in movidos ? { ...f, pasta_id: movidos[f.id] ?? null } : f)),
    [fluxos, movidos],
  );

  const arvore = useMemo(() => {
    const porPasta = new Map<string, number>();
    for (const f of fluxosVivos) if (f.pasta_id && !f.arquivado) porPasta.set(f.pasta_id, (porPasta.get(f.pasta_id) ?? 0) + 1);
    return arvoreDePastas(pastas, porPasta);
  }, [fluxosVivos, pastas]);

  const visiveis = useMemo(() => {
    const naPasta = pastaAtual && pastaAtual !== SEM_PASTA ? idsDaPastaEDescendentes(arvore, pastaAtual) : null;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return fluxosVivos.filter(
      (f) =>
        passaNoFiltro(f.status, filtro, f.arquivado) &&
        (pastaAtual !== SEM_PASTA || f.pasta_id === null) &&
        (!naPasta || (f.pasta_id !== null && naPasta.has(f.pasta_id))) &&
        (!termo || f.nome.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [fluxosVivos, filtro, busca, pastaAtual, arvore]);

  function aoComecar(e: DragStartEvent) {
    setArrastando(fluxosVivos.find((f) => f.id === e.active.id) ?? null);
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const fluxo = fluxosVivos.find((f) => f.id === e.active.id);
    if (!fluxo) return;
    const plano = destinoDoSoltar(e.over ? String(e.over.id) : null, fluxo.pasta_id);
    if (!plano.mudar) return;
    const antes = fluxo.pasta_id;
    setMovidos((m) => ({ ...m, [fluxo.id]: plano.pasta_id }));
    void fetch(`/api/v1/fluxos/${fluxo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pasta_id: plano.pasta_id }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        router.refresh();
      })
      .catch(() => {
        setMovidos((m) => ({ ...m, [fluxo.id]: antes }));
        toast.error(t("Não foi possível mover o fluxo."));
      });
  }

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

  const semPasta = fluxosVivos.filter((f) => f.pasta_id === null && !f.arquivado).length;

  return (
    <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
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
            total={fluxosVivos.filter((f) => !f.arquivado).length}
            ativo={pastaAtual === null}
            nivel={0}
            alvo={ALVO_TODOS}
            onClick={() => setPastaAtual(null)}
          />
          {arvore.map((no) => (
            <RamoDePastas key={no.id} no={no} nivel={0} atual={pastaAtual} onEscolher={setPastaAtual} />
          ))}
          <ItemDePasta
            nome={t("Sem pasta")}
            total={semPasta}
            ativo={pastaAtual === SEM_PASTA}
            nivel={0}
            alvo={ALVO_SEM_PASTA}
            onClick={() => setPastaAtual(SEM_PASTA)}
          />
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
                  <LinhaDoFluxo key={f.id} id={f.id} onAbrir={() => router.push(`/app/fluxos/${f.id}`)}>
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
                  </LinhaDoFluxo>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* O que segue o mouse: o nome do fluxo. A linha fica no lugar, translúcida. */}
      <DragOverlay dropAnimation={null}>
        {arrastando ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-accent bg-surface px-3 py-2 text-sm font-medium shadow-lg">
            <Lightning size={14} aria-hidden className="text-accent" />
            {arrastando.nome}
          </div>
        ) : null}
      </DragOverlay>

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
    </DndContext>
  );
}

/** A linha arrastável (item 1): segura e arrasta para uma pasta da barra lateral. */
function LinhaDoFluxo({ id, onAbrir, children }: { id: string; onAbrir: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <tr
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // O dnd-kit põe role="button" na linha; numa tabela ela continua linha.
      role="row"
      onClick={onAbrir}
      className={cn(
        "group cursor-pointer border-b border-border last:border-0 hover:bg-surface-elevated",
        isDragging && "opacity-40",
      )}
      data-testid={`linha-fluxo-${id}`}
      data-arrastando={isDragging || undefined}
    >
      {children}
    </tr>
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

function ItemDePasta(props: {
  nome: string;
  total: number;
  ativo: boolean;
  nivel: number;
  /** Id do alvo de soltar (item 1) — `todos`, `sem-pasta` ou `pasta:<id>`. */
  alvo: string;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: props.alvo });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={props.onClick}
      data-alvo={props.alvo}
      data-sobre={isOver || undefined}
      aria-current={props.ativo ? "true" : undefined}
      style={{ paddingLeft: 8 + props.nivel * 14 }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm",
        props.ativo ? "bg-accent-soft font-semibold text-accent-text" : "text-text hover:bg-surface-elevated",
        // Destaque do alvo enquanto um fluxo passa por cima ("Todos" não recebe nada).
        isOver && props.alvo !== ALVO_TODOS && "bg-accent-soft ring-2 ring-accent",
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
        alvo={alvoDaPasta(props.no.id)}
        onClick={() => props.onEscolher(props.no.id)}
      />
      {props.no.filhas.map((f) => (
        <RamoDePastas key={f.id} no={f} nivel={props.nivel + 1} atual={props.atual} onEscolher={props.onEscolher} />
      ))}
    </>
  );
}
