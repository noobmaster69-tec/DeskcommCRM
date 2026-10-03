"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notificacaoConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { CampoDeTexto } from "./CampoDeTexto";
import { useCamposDaFicha } from "./useCamposDaFicha";

/**
 * Bloco Notificação (fork jhoow, Fase C): avisa a EQUIPE por WhatsApp, pelo
 * mesmo número da conversa. Não é mensagem para o lead.
 */
type Config = ConfigOf<"notificacao">;

export function NotificacaoForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const { variaveis } = useCamposDaFicha();
  const [c, setC] = useState<Config>(config);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(patch: Partial<Config>) {
    const next = { ...c, ...patch };
    setC(next);
    const r = notificacaoConfigSchema.safeParse(next);
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
        {t("Avisa alguém da equipe pelo WhatsApp, usando o mesmo número da conversa. O lead não recebe esta mensagem.")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="notificacao-nome">{t("Quem recebe")}</Label>
        <Input id="notificacao-nome" value={c.nome} maxLength={80} onChange={(e) => gravar({ nome: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notificacao-numero">{t("WhatsApp de quem recebe")}</Label>
        <div className="flex gap-2">
          <Input
            aria-label={t("Código do país")}
            className="w-20"
            inputMode="numeric"
            value={c.ddi}
            onChange={(e) => gravar({ ddi: e.target.value.replace(/\D/g, "") })}
          />
          <Input
            id="notificacao-numero"
            inputMode="numeric"
            placeholder="11999999999"
            value={c.numero}
            onChange={(e) => gravar({ numero: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("Mensagem")}</Label>
        <CampoDeTexto
          rotulo={t("Mensagem")}
          valor={c.mensagem}
          onChange={(mensagem) => gravar({ mensagem })}
          variaveis={variaveis}
          placeholder={t("{nome} pediu orçamento.")}
        />
      </div>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
