"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { atualizacaoDoCrm } from "@/lib/crms/atualizado";

interface Funil {
  id: string;
  name: string;
  color: string | null;
  is_primary: boolean;
  leads: number;
  etapas: number;
  ultima_atividade: string | null;
}
interface Numero {
  id: string;
  nome: string | null;
  telefone: string | null;
}

/**
 * "Ver funis e números" do menu "⋯" do card (fork jhoow): cada funil vivo do
 * CRM com nº de negócios, nº de etapas e a última atividade, e os números de
 * WhatsApp ligados. Só leitura — "Gerenciar funis" leva à página do CRM.
 */
export function FunisENumerosDialog({
  crm,
  onClose,
}: {
  crm: { id: string; name: string; slug: string };
  onClose: () => void;
}) {
  const t = useT();
  const formato = new Intl.NumberFormat(useTagDeIdioma());
  const [dados, setDados] = useState<{ funis: Funil[]; numeros: Numero[] } | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/v1/crms/${crm.id}/funis-resumo`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data: { funis: Funil[]; numeros: Numero[] } }>) : Promise.reject()))
      .then((j) => vivo && setDados(j.data))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [crm.id]);

  const quando = (iso: string | null) => {
    if (!iso) return "—";
    const a = atualizacaoDoCrm(iso);
    return "n" in a ? t(a.frase).replace("{n}", String(a.n)) : t(a.frase);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" data-testid={`funis-e-numeros-${crm.slug}`}>
        <DialogHeader>
          <DialogTitle>
            {t("Funis de")} {crm.name}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("Funis e números de WhatsApp deste CRM")}</DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-error-fg">{t("Não foi possível ler os funis.")}</p>}
        {!dados && !erro && <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>}
        {dados && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t("Nome do funil")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("Leads")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("Etapas")}</th>
                    <th className="px-3 py-2 font-semibold">{t("Última atividade")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.funis.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        {t("Nenhum funil ativo neste CRM.")}
                      </td>
                    </tr>
                  ) : (
                    dados.funis.map((f) => (
                      <tr key={f.id} className="border-b border-border last:border-0" data-testid={`funil-resumo-${f.id}`}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full border border-border"
                              style={f.color ? { backgroundColor: f.color, borderColor: f.color } : undefined}
                              aria-hidden
                            />
                            <span className="font-medium">{f.name}</span>
                            {f.is_primary && (
                              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                                {t("Principal")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formato.format(f.leads)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formato.format(f.etapas)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{quando(f.ultima_atividade)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Números de WhatsApp")}
              </p>
              {dados.numeros.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("Nenhum número ligado a este CRM.")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {dados.numeros.map((n) => (
                    <li key={n.id}>
                      <span className="font-medium">{n.nome ?? t("Sem nome")}</span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">{n.telefone ?? ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button asChild variant="secondary">
            <Link href={`/app/crms/${crm.slug}`} data-testid={`gerenciar-funis-${crm.slug}`}>
              {t("Gerenciar funis")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
