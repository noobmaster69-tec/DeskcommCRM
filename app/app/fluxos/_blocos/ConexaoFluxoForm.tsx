"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { conexaoFluxoConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { useListaRemota } from "./useListaRemota";

/**
 * Bloco Conexão de fluxo (fork jhoow, Fase C): leva o contato para outro fluxo.
 * Sem "voltar", este fluxo termina ali. Com "voltar", ele espera o outro chegar
 * ao Fim e continua pela saída do bloco.
 */
type Config = ConfigOf<"conexao_fluxo">;
const NENHUM = "00000000-0000-4000-8000-000000000000";

export function ConexaoFluxoForm({ config, onChange, flowId }: { config: Config; onChange: (c: Config) => void; flowId?: string }) {
  const t = useT();
  const [c, setC] = useState<Config>(config);
  const { itens } = useListaRemota<{ id: string; name: string; status: string }>("/api/v1/ai/followup-flows?surface=fluxo");
  const outros = itens.filter((f) => f.id !== flowId).sort((a, b) => a.name.localeCompare(b.name));
  const escolhido = itens.find((f) => f.id === c.fluxo_id);

  function gravar(next: Config) {
    setC(next);
    const r = conexaoFluxoConfigSchema.safeParse(next);
    if (r.success) onChange(r.data);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="conexao-fluxo">{t("Ir para o fluxo")}</Label>
        <Select value={c.fluxo_id === NENHUM ? undefined : c.fluxo_id} onValueChange={(v) => gravar({ ...c, fluxo_id: v })}>
          <SelectTrigger id="conexao-fluxo">
            <SelectValue placeholder={t("Escolha um fluxo")} />
          </SelectTrigger>
          <SelectContent>
            {outros.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
                {f.status !== "active" ? ` (${t("não publicado")})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {c.fluxo_id === NENHUM && <p className="text-xs text-error-fg">{t("Escolha o fluxo de destino.")}</p>}
        {escolhido && escolhido.status !== "active" && (
          <p className="text-xs text-warning-fg">{t("Esse fluxo não está publicado: o contato não entra nele até você publicar.")}</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="conexao-voltar">{t("Voltar para este fluxo ao terminar")}</Label>
        <Switch id="conexao-voltar" checked={c.retornar} onCheckedChange={(v) => gravar({ ...c, retornar: v })} />
      </div>
      <p className="text-xs text-text-muted">
        {c.retornar
          ? t("Quando o outro fluxo chegar ao Fim, o contato continua pela saída deste bloco.")
          : t("Este fluxo termina aqui e o contato continua no outro.")}
      </p>
    </div>
  );
}
