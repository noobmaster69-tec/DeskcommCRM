"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { Preferencias } from "@/lib/messaging/lidas";

export function PreferenciasClient({ inicial, podeEditar }: { inicial: Preferencias; podeEditar: boolean }) {
  const t = useT();
  const [v, setV] = useState(inicial);
  const [salvando, setSalvando] = useState(false);

  async function mudar(marcar: boolean) {
    const anterior = v;
    setV({ ...v, marcar_lidas_ao_responder: marcar });
    setSalvando(true);
    try {
      await apiClient.patch("/api/v1/settings/preferencias", { marcar_lidas_ao_responder: marcar });
      toast.success(t("Preferência salva."));
    } catch {
      setV(anterior);
      toast.error(t("Não foi possível salvar a preferência."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Preferências")}</h1>
        <p className="text-sm text-muted-foreground">{t("Como o CRM se comporta na conversa com o contato.")}</p>
      </header>
      <Card className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <Label htmlFor="marcar-lidas" className="block">
            {t("Marcar mensagens como lidas ao responder")}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t(
              "Quando o CRM responde — fluxo, follow-up, IA ou atendente — as mensagens do contato aparecem como lidas (dois tiques azuis) no WhatsApp dele. No Inbox, também ao abrir a conversa ou começar a digitar.",
            )}
          </p>
        </div>
        <Switch
          id="marcar-lidas"
          checked={v.marcar_lidas_ao_responder}
          disabled={!podeEditar || salvando}
          onCheckedChange={(x) => void mudar(x)}
          data-testid="marcar-lidas"
        />
      </Card>
    </div>
  );
}
