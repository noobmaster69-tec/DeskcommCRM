"use client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

/** Um número de WhatsApp da organização, com o CRM para onde ele manda o contato novo. */
export interface NumeroDoCrm {
  id: string;
  nome: string | null;
  telefone: string | null;
  status: string;
  /** `null` = sem vínculo: o contato novo cai no CRM padrão. */
  crm: { id: string; name: string } | null;
}

export interface CrmDaEscolha {
  id: string;
  name: string;
  is_default: boolean;
}

const SEM_VINCULO = "__sem_vinculo__";

/** O status do WAHA em palavras de gente. Os cinco do CHECK de `channel_sessions`. */
const STATUS: Record<string, string> = {
  WORKING: "Conectado",
  SCAN_QR_CODE: "Esperando o QR code",
  STARTING: "Conectando",
  STOPPED: "Parado",
  FAILED: "Com falha",
};

/**
 * "Números de WhatsApp" dentro do CRM (Funis no modelo Kommo, Fase D): todos os
 * números da organização e o CRM de cada um. O vínculo decide para onde vai o
 * contato NOVO daquele número — a Etapa de entrada do funil principal do CRM
 * (`crmDaConversa` em `lib/leads/nascimento-do-lead.ts`). Número sem vínculo
 * manda para o CRM padrão. Trocar o CRM de um número não move os leads antigos.
 *
 * A tabela mostra TODOS os números, não só os deste CRM: é aqui que se vê de
 * onde vem cada contato, e um número ligado a outro CRM é a informação que
 * explica por que um lead não caiu neste.
 */
export function NumerosDoCrm({
  crmId,
  numeros,
  crms,
}: {
  crmId: string;
  numeros: NumeroDoCrm[];
  crms: CrmDaEscolha[];
}) {
  const t = useT();
  const [editando, setEditando] = useState<NumeroDoCrm | null>(null);
  const padrao = crms.find((c) => c.is_default) ?? null;

  return (
    // `id`: a âncora do botão "Números de WhatsApp" do quadro (`#numeros-do-crm`).
    <section id="numeros-do-crm" className="scroll-mt-6 space-y-3" data-testid="numeros-do-crm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("Números de WhatsApp")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("Cada número manda o contato novo para a Etapa de entrada de um CRM. Número sem vínculo manda para o CRM padrão")}
          {padrao ? ` (${padrao.name}).` : "."}
        </p>
      </div>
      {numeros.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="numeros-vazio">
          {t("Nenhum número de WhatsApp conectado. Conecte um em Conexões.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("Número")}</th>
                <th className="px-3 py-2 font-medium">{t("Status")}</th>
                <th className="px-3 py-2 font-medium">{t("Vinculado ao CRM")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {numeros.map((n) => (
                <tr key={n.id} data-testid={`numero-${n.id}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{n.telefone ? `+${n.telefone}` : t("Sem número")}</div>
                    {n.nome && <div className="text-xs text-muted-foreground">{n.nome}</div>}
                  </td>
                  <td className="px-3 py-2">{t(STATUS[n.status] ?? n.status)}</td>
                  <td className="px-3 py-2" data-testid={`vinculo-${n.id}`}>
                    {n.crm ? (
                      <span className={n.crm.id === crmId ? "font-medium text-text" : ""}>{n.crm.name}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("Sem vínculo (CRM padrão)")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditando(n)} data-testid={`vincular-${n.id}`}>
                      {n.crm ? t("Alterar") : t("Vincular…")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <VinculoDialog
          numero={editando}
          crms={crms}
          sugestao={crmId}
          onClose={() => setEditando(null)}
        />
      )}
    </section>
  );
}

function VinculoDialog({
  numero,
  crms,
  sugestao,
  onClose,
}: {
  numero: NumeroDoCrm;
  crms: CrmDaEscolha[];
  /** O CRM da página: um número sem vínculo aberto aqui já vem com ele escolhido. */
  sugestao: string;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [escolha, setEscolha] = useState<string>(numero.crm?.id ?? sugestao);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (crmId: string | null) =>
      apiClient.put<unknown>(`/api/v1/channel-sessions/${encodeURIComponent(numero.id)}/crm`, { crm_id: crmId }),
  });

  function confirmar() {
    const crmId = escolha === SEM_VINCULO ? null : escolha;
    setErro(null);
    salvar.mutate(crmId, {
      onSuccess: () => {
        toast.success(crmId ? t("Número vinculado.") : t("Número desvinculado."));
        onClose();
        router.refresh();
      },
      onError: (e) =>
        setErro(
          e instanceof ApiError && (e.status === 409 || e.status === 422)
            ? t(e.message)
            : t("Não deu para salvar agora. Tente de novo em instantes."),
        ),
    });
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="vinculo-dialog">
        <DialogHeader>
          <DialogTitle>{numero.telefone ? `+${numero.telefone}` : t("Número de WhatsApp")}</DialogTitle>
          <DialogDescription>
            {t("O contato novo deste número vai para a Etapa de entrada do CRM escolhido. Os leads que já existem não mudam de lugar.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="vinculo-crm">
            {t("Vincular a qual CRM?")}
          </label>
          <Select value={escolha} onValueChange={setEscolha}>
            <SelectTrigger id="vinculo-crm" data-testid="vinculo-crm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {crms.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
              <SelectItem value={SEM_VINCULO}>{t("Desvincular (usar o CRM padrão)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {erro && (
          <p className="text-sm text-destructive" role="alert" data-testid="vinculo-erro">
            {erro}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            {t("Cancelar")}
          </Button>
          <Button onClick={confirmar} disabled={salvar.isPending} data-testid="vinculo-salvar">
            {t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
