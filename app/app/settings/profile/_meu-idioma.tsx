"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { IDIOMAS_OFERECIDOS, nomeDoIdioma } from "@/lib/translation/idiomas";

/**
 * "Meu idioma" — o idioma em que você atende. Mensagens de clientes em outro
 * idioma chegam traduzidas para ele no Inbox.
 */
export function MeuIdioma({ inicial }: { inicial: string }) {
  const t = useT();
  const [valor, setValor] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  return (
    <Card className="max-w-xl space-y-3 p-6" data-testid="meu-idioma">
      <div>
        <Label htmlFor="meu-idioma">{t("Meu idioma")}</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("O idioma em que você atende. Mensagens de clientes em outro idioma chegam traduzidas para ele no Inbox.")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={valor} onValueChange={setValor}>
          <SelectTrigger id="meu-idioma" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IDIOMAS_OFERECIDOS.map((l) => (
              <SelectItem key={l} value={l}>
                {t(nomeDoIdioma(l))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          disabled={salvando || valor === inicial}
          onClick={async () => {
            setSalvando(true);
            try {
              await apiClient.put("/api/v1/me/idioma-de-trabalho", { operating_locale: valor });
              toast.success(t("Idioma salvo."));
            } catch {
              toast.error(t("Não foi possível salvar o idioma."));
            } finally {
              setSalvando(false);
            }
          }}
        >
          {salvando ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </Card>
  );
}
