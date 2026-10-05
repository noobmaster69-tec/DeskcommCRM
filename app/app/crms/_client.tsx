"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { melhorFrenteSobre } from "@/lib/branding/contraste";
import { atualizacaoDoCrm } from "@/lib/crms/atualizado";
import { Archive, ArrowRight, Copy, DotsThree, Kanban, PencilSimple, Plus, Star, Trash } from "@/lib/ui/icons";
import { corDoAvatar } from "@/lib/crms/cor-do-avatar";
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

import type { FunilDaLista } from "./[slug]/_client";
import type { FunilDoSeletor } from "@/components/kanban/CorDoFunil";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditarCrmDialog } from "./_components/EditarCrm";
import { FunisENumerosDialog } from "./_components/FunisENumeros";
import { ImportarLeads } from "./_components/ImportarLeads";
import { NovoCrm } from "./_components/NovoCrm";

/** O que o card mostra — a linha de `fn_crms_com_metricas` + as iniciais. */
export interface CrmDoCard {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  avatar_bg_color: string | null;
  initials: string;
  leads_count: number;
  funis_count: number;
  last_updated_at: string | null;
  /** O funil principal do CRM — "Abrir CRM" leva ao quadro dele. `null` = sem funil vivo. */
  quadro_id: string | null;
  /** Para o "Editar CRM" do menu do card. */
  description: string | null;
  /** Os funis vivos do CRM, na ordem — o "Gerenciar funis" do menu do card. */
  funis: FunilDoSeletor[];
}

/**
 * O menu "⋯" do card (manager+), na ordem do pedido do Jhoow: Editar CRM ·
 * Duplicar · Ver funis e números · Definir como padrão · Arquivar · Excluir.
 * Editar/Arquivar usam o MESMO modal da página do CRM (`EditarCrmDialog`).
 * Excluir é DE VEZ e só passa em CRM sem negócio nenhum (migration 9012) —
 * quem tem história arquiva.
 */
function MenuDoCrm({ crm }: { crm: CrmDoCard }) {
  const t = useT();
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();
  const [aberto, setAberto] = useState<"editar" | "funis" | "arquivar" | "excluir" | null>(null);
  const editavel = {
    id: crm.id,
    name: crm.name,
    slug: crm.slug,
    description: crm.description,
    avatar_bg_color: crm.avatar_bg_color,
    is_default: crm.is_default,
  };

  const chamar = (url: string, method: string, corpo: unknown, sucesso: string, aoTerminar?: () => void) =>
    startTransition(async () => {
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).catch(() => null);
      const json = (await resp?.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!resp?.ok) {
        toast.error(json?.error?.message ?? t("Não foi possível concluir a ação."));
        return;
      }
      toast.success(t(sucesso));
      aoTerminar?.();
      router.refresh();
    });

  const item = "gap-2";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
          aria-label={`${t("Opções de")} «${crm.name}»`}
          data-testid={`menu-crm-${crm.slug}`}
          disabled={ocupado}
        >
          <DotsThree size={20} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className={item} onSelect={() => setAberto("editar")} data-testid={`menu-crm-editar-${crm.slug}`}>
            <PencilSimple size={14} aria-hidden /> {t("Editar CRM")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={item}
            onSelect={() => chamar(`/api/v1/crms/${crm.id}/duplicate`, "POST", {}, "CRM duplicado.")}
            data-testid={`menu-crm-duplicar-${crm.slug}`}
          >
            <Copy size={14} aria-hidden /> {t("Duplicar")}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={() => setAberto("funis")} data-testid={`menu-crm-funis-${crm.slug}`}>
            <Kanban size={14} aria-hidden /> {t("Ver funis e números")}
          </DropdownMenuItem>
          {!crm.is_default && (
            <DropdownMenuItem
              className={item}
              onSelect={() => chamar(`/api/v1/crms/${crm.id}`, "PATCH", { is_default: true }, "CRM definido como padrão.")}
              data-testid={`menu-crm-padrao-${crm.slug}`}
            >
              <Star size={14} aria-hidden /> {t("Definir como padrão")}
            </DropdownMenuItem>
          )}
          {!crm.is_default && (
            <>
              <DropdownMenuItem
                className={item}
                onSelect={() => setAberto("arquivar")}
                data-testid={`menu-crm-arquivar-${crm.slug}`}
              >
                <Archive size={14} aria-hidden /> {t("Arquivar")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setAberto("excluir")}
                className="gap-2 text-destructive focus:text-destructive"
                data-testid={`menu-crm-excluir-${crm.slug}`}
              >
                <Trash size={14} aria-hidden /> {t("Excluir")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {(aberto === "editar" || aberto === "arquivar") && (
        <EditarCrmDialog crm={editavel} naGrade arquivando={aberto === "arquivar"} onClose={() => setAberto(null)} />
      )}
      {aberto === "funis" && <FunisENumerosDialog crm={crm} onClose={() => setAberto(null)} />}
      <AlertDialog open={aberto === "excluir"} onOpenChange={(v) => !v && setAberto(null)}>
        <AlertDialogContent data-testid={`excluir-crm-${crm.slug}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Excluir")} «{crm.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("Tem certeza? Esta ação não pode ser desfeita. Só CRM sem nenhum negócio pode ser excluído — os outros, arquive.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={ocupado}
              onClick={(e) => {
                e.preventDefault();
                chamar(`/api/v1/crms/${crm.id}/excluir`, "POST", {}, "CRM excluído.", () => setAberto(null));
              }}
              data-testid={`excluir-crm-confirmar-${crm.slug}`}
            >
              {t("Excluir de vez")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CardDoCrm({ crm, podeGerenciar }: { crm: CrmDoCard; podeGerenciar: boolean }) {
  const t = useT();
  // Separador de milhar do idioma da tela ("12.480" em pt, "12,480" em en).
  const formato = new Intl.NumberFormat(useTagDeIdioma());
  const numero = (n: number) => formato.format(n);
  const atualizacao = atualizacaoDoCrm(crm.last_updated_at);
  const rodape = "n" in atualizacao ? t(atualizacao.frase).replace("{n}", String(atualizacao.n)) : t(atualizacao.frase);
  // Sem cor escolhida, a cor vem do NOME (mesma paleta, sempre a mesma por CRM).
  const cor = corDoAvatar(crm.name, crm.avatar_bg_color);

  return (
    <article
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/60"
      data-testid={`crm-card-${crm.slug}`}
    >
      <header className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
          style={{ backgroundColor: cor, color: melhorFrenteSobre(cor) }}
          aria-hidden
          data-testid={`crm-avatar-${crm.slug}`}
        >
          {crm.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground" title={crm.name}>
              {crm.name}
            </h2>
            {crm.is_default ? (
              <Badge
                className="shrink-0 border-transparent bg-accent-soft text-[11px] font-medium text-accent-text"
                data-testid={`crm-padrao-${crm.slug}`}
              >
                {t("Padrão")}
              </Badge>
            ) : null}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">/{crm.slug}</p>
        </div>
        {podeGerenciar && <MenuDoCrm crm={crm} />}
      </header>

      <dl className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{t("Leads")}</dt>
          <dd className="text-3xl font-bold tabular-nums tracking-tight" data-testid={`crm-leads-${crm.slug}`}>
            {numero(crm.leads_count)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{t("Funis")}</dt>
          <dd className="text-3xl font-bold tabular-nums tracking-tight" data-testid={`crm-funis-${crm.slug}`}>
            {numero(crm.funis_count)}
          </dd>
        </div>
      </dl>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground" data-testid={`crm-atualizado-${crm.slug}`}>
          {rodape}
        </span>
        {/* "Funis e números" saiu do rodapé: virou "Ver funis e números" no
            menu "⋯" (o modal leva à página do CRM em "Gerenciar funis"). */}
        <Link
          href={crm.quadro_id ? `/app/pipelines/${crm.quadro_id}` : `/app/crms/${crm.slug}`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          data-testid={`abrir-crm-${crm.slug}`}
        >
          {t("Abrir CRM")} <ArrowRight size={14} aria-hidden />
        </Link>
      </footer>
    </article>
  );
}

export function CrmsClient({
  crms,
  funisParaImportar,
  podeGerenciar,
  podeImportar,
}: {
  crms: CrmDoCard[];
  /** Os funis vivos da organização, já nomeados "CRM › Funil". */
  funisParaImportar: FunilDaLista[];
  /** Espelha o `requireRole("manager")` de `POST /api/v1/crms`. */
  podeGerenciar: boolean;
  /** Espelha o `requireRole("agent")` de `POST /api/v1/leads/import`. */
  podeImportar: boolean;
}) {
  const t = useT();
  const [novoAberto, setNovoAberto] = useState(false);
  // A mesma regra do rodapé da lista de funis: com "Clientes pela agenda"
  // ligado, a nota diz o que acontece; desligado, é a porta para ligar.
  const clientesLigado = useActiveOrg()?.cliente_pela_agenda === true;

  const modal = (
    <NovoCrm
      aberto={novoAberto}
      aoFechar={() => setNovoAberto(false)}
      jaExisteCrm={crms.length > 0}
      slugsOcupados={crms.map((c) => c.slug)}
    />
  );

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{t("CRMs")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Cada CRM agrupa seus funis e os leads que passam por eles.")}
          </p>
        </div>
        {(podeImportar && funisParaImportar.length > 0) || podeGerenciar ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {podeImportar && funisParaImportar.length > 0 ? <ImportarLeads funis={funisParaImportar} /> : null}
            {podeGerenciar ? (
              <Button onClick={() => setNovoAberto(true)} data-testid="novo-crm">
                <Plus size={16} className="mr-2" aria-hidden /> {t("Novo CRM")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {crms.length === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border p-10 text-center"
          data-testid="crms-vazio"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
            <Kanban size={28} weight="duotone" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold">{t("Crie seu primeiro CRM")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("Um CRM agrupa funis com o mesmo público ou a mesma marca.")}
            </p>
          </div>
          {podeGerenciar ? (
            <Button onClick={() => setNovoAberto(true)} data-testid="novo-crm-vazio">
              <Plus size={16} className="mr-2" aria-hidden /> {t("Novo CRM")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="crms-grade">
          {crms.map((crm) => (
            <CardDoCrm key={crm.id} crm={crm} podeGerenciar={podeGerenciar} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-testid="crms-nota-clientes">
        {clientesLigado
          ? t(
              "Quem já tem atendimento marcado entra pelo funil de clientes. Sem um funil marcado, entra pelo padrão.",
            )
          : t(
              "Para separar quem já é cliente, ligue “Clientes pela agenda” em Configurações › Tipos de agendamento. Enquanto estiver desligado, todo contato novo entra pelo funil padrão.",
            )}{" "}
        {clientesLigado ? null : (
          <Link
            href="/app/settings/tenant/agenda"
            className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
            data-testid="crms-nota-ligar"
          >
            {t("Abrir Tipos de agendamento")} <ArrowRight size={12} aria-hidden />
          </Link>
        )}
      </p>

      {podeGerenciar ? modal : null}
    </div>
  );
}
