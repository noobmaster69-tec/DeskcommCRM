"use client";

import { useEffect, useState } from "react";
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

interface Definicao {
  key: string;
  label: string;
  visible_in_profile: boolean;
  default_value: string | null;
}

/** As variáveis da organização marcadas "mostrar no perfil" (item 2), com o valor deste contato. */
export function VariaveisDoPerfil({ campos }: { campos: Record<string, unknown> | null | undefined }) {
  const t = useT();
  const [defs, setDefs] = useState<Definicao[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/v1/variaveis")
      .then((r) => (r.ok ? (r.json() as Promise<{ data: { personalizadas: Definicao[] } }>) : null))
      .then((j) => vivo && j && setDefs((j.data.personalizadas ?? []).filter((d) => d.visible_in_profile)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  if (defs.length === 0) return null;
  const valores = campos ?? {};
  return (
    <Card className="space-y-2 p-4" data-testid="variaveis-do-perfil">
      <h3 className="text-sm font-semibold">{t("Variáveis")}</h3>
      <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        {defs.map((d) => {
          const v = Object.prototype.hasOwnProperty.call(valores, d.key) ? valores[d.key] : null;
          const texto = v === null || v === undefined || v === "" ? (d.default_value ?? "—") : String(v);
          return (
            <div key={d.key}>
              <dt className="text-xs uppercase text-muted-foreground">{d.label}</dt>
              <dd className="mt-1">{texto}</dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
