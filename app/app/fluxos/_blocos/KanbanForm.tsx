"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { kanbanConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { useListaRemota } from "./useListaRemota";

/**
 * Bloco Kanban (fork jhoow, Fase C): põe o contato no funil (na etapa escolhida
 * ou na primeira), move o card dele para uma etapa, ou tira o card do quadro
 * (encerra como perdido, motivo "Removido pelo fluxo").
 */
type Config = ConfigOf<"kanban">;
type Acao = Config["acao"];
const NENHUM = "00000000-0000-4000-8000-000000000000";
const PRIMEIRA = "__primeira__";

const ROTULO_DA_ACAO: Record<Acao, string> = {
  adicionar: "Adicionar ao funil",
  mover: "Mover de etapa",
  remover: "Tirar do funil",
};

export function KanbanForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const [acao, setAcao] = useState<Acao>(config.acao);
  const [funil, setFunil] = useState(config.pipeline_id);
  const [etapa, setEtapa] = useState<string | null>("stage_id" in config ? (config.stage_id ?? null) : null);
  const { itens: funis } = useListaRemota<{ id: string; name: string }>("/api/v1/pipelines");
  const { itens: etapas } = useListaRemota<{ id: string; name: string; is_won: boolean; is_lost: boolean }>(
    funil !== NENHUM ? `/api/v1/pipelines/${funil}/stages` : null,
  );

  function gravar(next: { acao: Acao; funil: string; etapa: string | null }) {
    setAcao(next.acao);
    setFunil(next.funil);
    setEtapa(next.etapa);
    const candidato =
      next.acao === "remover"
        ? { acao: "remover", pipeline_id: next.funil }
        : { acao: next.acao, pipeline_id: next.funil, ...(next.etapa ? { stage_id: next.etapa } : {}) };
    const r = kanbanConfigSchema.safeParse(candidato);
    if (r.success) onChange(r.data);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="kanban-acao">{t("O que fazer")}</Label>
        <Select value={acao} onValueChange={(v) => gravar({ acao: v as Acao, funil, etapa })}>
          <SelectTrigger id="kanban-acao">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROTULO_DA_ACAO) as Acao[]).map((a) => (
              <SelectItem key={a} value={a}>
                {t(ROTULO_DA_ACAO[a])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="kanban-funil">{t("Funil")}</Label>
        <Select value={funil === NENHUM ? undefined : funil} onValueChange={(v) => gravar({ acao, funil: v, etapa: null })}>
          <SelectTrigger id="kanban-funil">
            <SelectValue placeholder={t("Escolha um funil")} />
          </SelectTrigger>
          <SelectContent>
            {funis.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {funil === NENHUM && <p className="text-xs text-error-fg">{t("Escolha o funil.")}</p>}
      </div>
      {acao !== "remover" && funil !== NENHUM && (
        <div className="space-y-2">
          <Label htmlFor="kanban-etapa">{t("Etapa")}</Label>
          <Select
            value={etapa ?? (acao === "adicionar" ? PRIMEIRA : undefined)}
            onValueChange={(v) => gravar({ acao, funil, etapa: v === PRIMEIRA ? null : v })}
          >
            <SelectTrigger id="kanban-etapa">
              <SelectValue placeholder={t("Escolha a etapa")} />
            </SelectTrigger>
            <SelectContent>
              {acao === "adicionar" && <SelectItem value={PRIMEIRA}>{t("A primeira etapa do funil")}</SelectItem>}
              {etapas
                .filter((e) => !e.is_won && !e.is_lost)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {acao === "mover" && !etapa && <p className="text-xs text-error-fg">{t("Escolha a etapa de destino.")}</p>}
        </div>
      )}
      {acao === "remover" && (
        <p className="text-xs text-text-muted">{t("O card aberto do contato neste funil é encerrado como perdido, com o motivo \"Removido pelo fluxo\".")}</p>
      )}
    </div>
  );
}
