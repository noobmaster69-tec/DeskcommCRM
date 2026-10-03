"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { aguardarRespostaConfigSchema, UNIDADES_DE_ESPERA } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { CampoDeTexto } from "./CampoDeTexto";
import { useCamposDaFicha } from "./useCamposDaFicha";

/**
 * Bloco Aguardar resposta (fork jhoow, Fase B). Duas saídas: "Respondeu" e
 * "Não respondeu" (o tempo máximo acabou). Opções: pergunta antes de esperar,
 * buffer (junta mensagens seguidas antes de seguir), salvar a resposta num campo
 * da ficha, reagir com emoji e responder citando.
 */
type Config = ConfigOf<"aguardar_resposta">;

const ROTULO_DA_UNIDADE: Record<(typeof UNIDADES_DE_ESPERA)[number], string> = {
  minutos: "Minutos",
  horas: "Horas",
  dias: "Dias",
};

export function AguardarRespostaForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const { campos, variaveis } = useCamposDaFicha();
  const [c, setC] = useState<Config>(config);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(patch: Partial<Config>) {
    const next = { ...c, ...patch } as Config;
    setC(next);
    const r = aguardarRespostaConfigSchema.safeParse(next);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }

  const tempo = c.tempo ?? { valor: 1, unidade: "dias" as const };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("Pergunta antes de esperar (opcional)")}</Label>
        <CampoDeTexto
          rotulo={t("Pergunta antes de esperar (opcional)")}
          valor={c.mensagem_antes ?? ""}
          onChange={(v) => gravar({ mensagem_antes: v || undefined })}
          variaveis={variaveis}
          placeholder={t("Qual é o seu nome?")}
          linhas={2}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="aguardar-sem-limite">{t("Aguardar indefinidamente")}</Label>
          <Switch
            id="aguardar-sem-limite"
            checked={c.sem_limite}
            onCheckedChange={(v) => gravar({ sem_limite: v, ...(v ? {} : { tempo }) })}
          />
        </div>
        {!c.sem_limite && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-24"
              aria-label={t("Tempo máximo")}
              value={tempo.valor}
              onChange={(e) => gravar({ tempo: { ...tempo, valor: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
            />
            <Select value={tempo.unidade} onValueChange={(v) => gravar({ tempo: { ...tempo, unidade: v as typeof tempo.unidade } })}>
              <SelectTrigger className="w-32" aria-label={t("Unidade")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES_DE_ESPERA.map((u) => (
                  <SelectItem key={u} value={u}>
                    {t(ROTULO_DA_UNIDADE[u])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <p className="text-xs text-text-muted">
          {c.sem_limite
            ? t("Sem tempo máximo, a saída \"Não respondeu\" nunca é usada.")
            : t("Se o tempo acabar sem resposta, o fluxo segue pela saída \"Não respondeu\".")}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="aguardar-buffer">{t("Juntar mensagens seguidas")}</Label>
          <Switch
            id="aguardar-buffer"
            checked={Boolean(c.buffer?.ativo)}
            onCheckedChange={(v) => gravar({ buffer: v ? { ativo: true, segundos: c.buffer?.segundos ?? 10 } : undefined })}
          />
        </div>
        {c.buffer?.ativo && (
          <Label className="flex items-center gap-2 text-sm font-normal">
            {t("Esperar")}
            <Input
              type="number"
              min={1}
              max={120}
              className="w-20"
              value={c.buffer.segundos}
              onChange={(e) => gravar({ buffer: { ativo: true, segundos: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
            />
            {t("segundos depois da primeira mensagem")}
          </Label>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="aguardar-salvar">{t("Salvar a resposta no campo (opcional)")}</Label>
        <Input
          id="aguardar-salvar"
          list="aguardar-campos"
          placeholder="ex.: nome_completo"
          value={c.salvar_em ?? ""}
          maxLength={60}
          onChange={(e) => {
            const v = e.target.value.toLowerCase().replace(/\s+/g, "_");
            gravar({ salvar_em: v || undefined });
          }}
        />
        <datalist id="aguardar-campos">
          {campos.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <p className="text-xs text-text-muted">{t("Letras minúsculas, números e _. Use depois como {campo} nos textos.")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="aguardar-reagir">{t("Reagir na mensagem do lead")}</Label>
          <Switch
            id="aguardar-reagir"
            checked={Boolean(c.reagir?.ativo)}
            onCheckedChange={(v) => gravar({ reagir: v ? { ativo: true, emoji: c.reagir?.emoji ?? "👍" } : undefined })}
          />
        </div>
        {c.reagir?.ativo && (
          <Input
            aria-label={t("Emoji da reação")}
            className="w-20 text-center text-lg"
            value={c.reagir.emoji ?? ""}
            maxLength={16}
            onChange={(e) => gravar({ reagir: { ativo: true, emoji: e.target.value || undefined } })}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="aguardar-citar">{t("Responder citando a mensagem do lead")}</Label>
        <Switch id="aguardar-citar" checked={c.responder_citando} onCheckedChange={(v) => gravar({ responder_citando: v })} />
      </div>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
