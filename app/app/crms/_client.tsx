"use client";
import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { melhorFrenteSobre } from "@/lib/branding/contraste";
import { atualizacaoDoCrm } from "@/lib/crms/atualizado";
import { Archive, ArrowRight, DotsThree, Kanban, PencilSimple, Plus } from "@/lib/ui/icons";

import type { FunilDaLista } from "./[slug]/_client";
import { GerenciarFunisDialog } from "@/components/kanban/GerenciarFunisDialog";
import type { FunilDoSeletor } from "@/components/kanban/CorDoFunil";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditarCrmDialog } from "./_components/EditarCrm";
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
 * O menu "⋯" do card (manager+): editar o CRM, gerenciar os funis dele e
 * arquivá-lo, sem precisar abrir a página do CRM nem o quadro. Os modais são os
 * MESMOS da página do CRM (`EditarCrmDialog`) e do quadro (`GerenciarFunisDialog`)
 * — as regras são da API, e duas telas com a mesma regra divergiriam.
 */
function MenuDoCrm({ crm }: { crm: CrmDoCard }) {
  const t = useT();
  const [aberto, setAberto] = useState<"editar" | "funis" | "arquivar" | null>(null);
  const editavel = {
    id: crm.id,
    name: crm.name,
    slug: crm.slug,
    description: crm.description,
    avatar_bg_color: crm.avatar_bg_color,
    is_default: crm.is_default,
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
          aria-label={`${t("Opções de")} «${crm.name}»`}
          data-testid={`menu-crm-${crm.slug}`}
        >
          <DotsThree size={20} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setAberto("editar")} data-testid={`menu-crm-editar-${crm.slug}`}>
            <PencilSimple size={14} className="mr-2" aria-hidden /> {t("Editar CRM")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAberto("funis")} data-testid={`menu-crm-funis-${crm.slug}`}>
            <Kanban size={14} className="mr-2" aria-hidden /> {t("Gerenciar funis")}
          </DropdownMenuItem>
          {!crm.is_default && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setAberto("arquivar")}
                className="text-destructive focus:text-destructive"
                data-testid={`menu-crm-arquivar-${crm.slug}`}
              >
                <Archive size={14} className="mr-2" aria-hidden /> {t("Arquivar CRM")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {(aberto === "editar" || aberto === "arquivar") && (
        <EditarCrmDialog crm={editavel} naGrade arquivando={aberto === "arquivar"} onClose={() => setAberto(null)} />
      )}
      {aberto === "funis" && (
        <GerenciarFunisDialog
          open
          onOpenChange={(v) => !v && setAberto(null)}
          funis={crm.funis}
          // Nenhum quadro aberto na grade: arquivar ou excluir um funil só relê a lista.
          pipelineAtualId=""
        />
      )}
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
  const cor = crm.avatar_bg_color;

  return (
    <article
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/60"
      data-testid={`crm-card-${crm.slug}`}
    >
      <header className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-sm font-semibold"
          style={cor ? { backgroundColor: cor, color: melhorFrenteSobre(cor), borderColor: cor } : undefined}
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
        <div className="flex items-center gap-4">
          {/* A página do CRM (funis, arquivados e números de WhatsApp). "Abrir CRM"
              leva ao quadro desde a Fase C, e sem este link a página ficava
              escondida atrás do caminho no topo do quadro. */}
          {crm.quadro_id && (
            <Link
              href={`/app/crms/${crm.slug}`}
              className="text-sm text-muted-foreground hover:text-text hover:underline"
              data-testid={`config-crm-${crm.slug}`}
            >
              {t("Funis e números")}
            </Link>
          )}
          <Link
            href={crm.quadro_id ? `/app/pipelines/${crm.quadro_id}` : `/app/crms/${crm.slug}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
            data-testid={`abrir-crm-${crm.slug}`}
          >
            {t("Abrir CRM")} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
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
