"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

/**
 * O Início de um FLUXO (fork jhoow, Fase C): como ele começa sozinho. Grava em
 * `graph.settings` (gatilhos, gatilho_exato, entrada_primeiro_contato) — vale
 * depois de PUBLICAR, porque a entrada lê a versão no ar.
 */
type Settings = NonNullable<FlowGraph["settings"]>;

export function EntradaDoFluxo({
  settings,
  onSettingsChange,
}: {
  settings?: FlowGraph["settings"];
  onSettingsChange?: (settings: FlowGraph["settings"]) => void;
}) {
  const t = useT();
  const atual: Settings = { max_tentativas_pergunta: settings?.max_tentativas_pergunta ?? 3, ...settings };
  const [palavras, setPalavras] = useState((settings?.gatilhos ?? []).join(", "));
  const gravar = (patch: Partial<Settings>) => onSettingsChange?.({ ...atual, ...patch });

  return (
    <div className="space-y-4" data-testid="entrada-do-fluxo">
      <p className="text-sm text-text-muted">
        {t("O fluxo pode começar sozinho pela mensagem do cliente, ou por \"Disparar fluxo\" no Inbox. Enquanto o contato está no fluxo, o agente de IA não responde a ele.")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="fluxo-gatilhos">{t("Palavras-gatilho (separe por vírgula)")}</Label>
        <Input
          id="fluxo-gatilhos"
          placeholder={t("preço, catálogo, quero comprar")}
          value={palavras}
          onChange={(e) => {
            setPalavras(e.target.value);
            const lista = e.target.value
              .split(",")
              .map((g) => g.trim())
              .filter((g) => g.length > 0 && g.length <= 60)
              .slice(0, 30);
            const { gatilhos: _anterior, ...resto } = atual;
            onSettingsChange?.(lista.length > 0 ? { ...resto, gatilhos: lista } : resto);
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="fluxo-gatilho-exato">{t("Só quando a mensagem for exatamente a palavra")}</Label>
        <Switch
          id="fluxo-gatilho-exato"
          checked={atual.gatilho_exato === true}
          onCheckedChange={(v) => gravar({ gatilho_exato: v })}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="fluxo-primeiro-contato">{t("Começar na primeira mensagem de um contato novo")}</Label>
        <Switch
          id="fluxo-primeiro-contato"
          checked={atual.entrada_primeiro_contato === true}
          onCheckedChange={(v) => gravar({ entrada_primeiro_contato: v })}
        />
      </div>
      <p className="text-xs text-text-muted">
        {t("Vale depois de publicar. Não começa em conversa que está com um atendente, nem com o automático pausado. Se duas palavras de fluxos diferentes casarem, ganha o fluxo com mais palavras na mensagem.")}
      </p>
    </div>
  );
}
