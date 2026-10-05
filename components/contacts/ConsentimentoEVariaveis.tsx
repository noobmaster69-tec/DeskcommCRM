"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { consentiuMarketing, recusouMarketing } from "@/lib/campanhas/elegibilidade";
import { useT } from "@/hooks/i18n/useT";

/**
 * Consentimento para campanhas (fork jhoow, Campanhas › item 6). A campanha
 * com base legal CONSENTIMENTO só fala com quem tem `consent.marketing.granted_at`
 * — este cartão é onde a equipe registra (ou retira) esse consentimento. O PATCH
 * do contato faz merge POR FINALIDADE: mexer em `marketing` não apaga as outras.
 */
export function ConsentimentoDeCampanhas({
  contactId,
  consent,
  podeEditar,
}: {
  contactId: string;
  consent: Record<string, unknown> | null | undefined;
  podeEditar: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const consentiu = consentiuMarketing(consent);
  const recusou = recusouMarketing(consent);
  const marketing = ((consent ?? {}) as { marketing?: Record<string, unknown> }).marketing ?? {};

  async function gravar(marketingNovo: Record<string, unknown>, mensagemDeSucesso: string) {
    setOcupado(true);
    try {
      await apiClient.patch(`/api/v1/contacts/${contactId}`, { consent: { marketing: marketingNovo } });
      await qc.invalidateQueries({ queryKey: ["contact", contactId] });
      toast.success(mensagemDeSucesso);
    } catch {
      toast.error(t("Não foi possível registrar o consentimento."));
    } finally {
      setOcupado(false);
    }
  }

  const agora = () => new Date().toISOString();
  return (
    <Card className="space-y-2 p-4" data-testid="consentimento-de-campanhas">
      <h3 className="text-sm font-semibold">{t("Consentimento para campanhas")}</h3>
      <p className="text-sm" data-testid="estado-do-consentimento">
        {consentiu
          ? `${t("Consentiu em")} ${new Date(String(marketing.granted_at)).toLocaleDateString("pt-BR")}`
          : recusou
            ? t("Recusou receber contato comercial")
            : t("Sem consentimento registrado — campanhas com base legal “consentimento” não falam com este contato.")}
      </p>
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          {!consentiu && (
            <Button
              size="sm"
              variant="secondary"
              disabled={ocupado}
              onClick={() => void gravar({ ...marketing, granted_at: agora(), declined_at: null, source: "tela" }, t("Consentimento registrado."))}
              data-testid="registrar-consentimento"
            >
              {t("Registrar consentimento")}
            </Button>
          )}
          {consentiu && (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => void gravar({ ...marketing, declined_at: agora(), source: "tela" }, t("Consentimento retirado."))}
              data-testid="retirar-consentimento"
            >
              {t("Retirar consentimento")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
