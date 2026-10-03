"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENTOS_DO_PIXEL, pixelConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { EVENTOS_DO_PIXEL_NA_TELA } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";

/**
 * Bloco Pixel (fork jhoow, Fase D): um evento para a Meta pela conexão de
 * conversões da empresa. O valor e o page_id aceitam variável.
 */
type Config = ConfigOf<"pixel">;
type Evento = (typeof EVENTOS_DO_PIXEL)[number];

export function PixelForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const [c, setC] = useState<Config>(config);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(patch: Partial<Config>) {
    const next: Config = { ...c, ...patch };
    // Campo apagado = ausente (o formato não aceita texto vazio).
    if (!next.valor) delete next.valor;
    if (!next.page_id) delete next.page_id;
    setC(next);
    const r = pixelConfigSchema.safeParse(next);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {t("Envia o evento para a Meta pela conexão de")}{" "}
        <Link href="/app/settings/conversoes" className="text-link underline" target="_blank">
          {t("Configurações › Conversões")}
        </Link>
        . {t("Se o contato veio de um anúncio, o evento é atribuído ao clique; se não, sai identificado pelo telefone.")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="pixel-evento">{t("Evento")}</Label>
        <Select value={c.evento} onValueChange={(v) => gravar({ evento: v as Evento })}>
          <SelectTrigger id="pixel-evento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENTOS_DO_PIXEL.map((e) => (
              <SelectItem key={e} value={e}>
                {t(EVENTOS_DO_PIXEL_NA_TELA[e])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="pixel-valor">{c.evento === "Purchase" ? t("Valor (obrigatório na compra)") : t("Valor (opcional)")}</Label>
          <Input
            id="pixel-valor"
            placeholder={t("29,90 ou {valor_pacote}")}
            value={c.valor ?? ""}
            maxLength={200}
            onChange={(e) => gravar({ valor: e.target.value })}
          />
        </div>
        <div className="w-24 space-y-2">
          <Label htmlFor="pixel-moeda">{t("Moeda")}</Label>
          <Input
            id="pixel-moeda"
            value={c.moeda}
            maxLength={3}
            onChange={(e) => gravar({ moeda: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pixel-page">{t("ID da página do Facebook (opcional)")}</Label>
        <Input
          id="pixel-page"
          inputMode="numeric"
          value={c.page_id ?? ""}
          maxLength={200}
          onChange={(e) => gravar({ page_id: e.target.value })}
        />
      </div>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
