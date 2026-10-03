"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { distribuidorConfigSchema } from "@/lib/followup/blocos-do-fluxo";
import { useT } from "@/hooks/i18n/useT";
import { Plus, Trash } from "@/lib/ui/icons";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";

/**
 * Bloco Distribuidor (fork jhoow, Fase C): reparte os contatos entre as saídas,
 * em rodízio. "Fixo por contato" manda quem já passou de volta pela MESMA saída.
 * O id da saída é estável: renomear não muda para onde a ligação aponta.
 */
type Config = ConfigOf<"distribuidor">;

export function DistribuidorForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const [c, setC] = useState<Config>(config);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(next: Config) {
    setC(next);
    const r = distribuidorConfigSchema.safeParse(next);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }
  const novoId = () => {
    let n = c.saidas.length + 1;
    while (c.saidas.some((s) => s.id === `s${n}`)) n++;
    return `s${n}`;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="distribuidor-modo">{t("Como repartir")}</Label>
        <Select value={c.modo} onValueChange={(v) => gravar({ ...c, modo: v as Config["modo"] })}>
          <SelectTrigger id="distribuidor-modo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixo_por_contato">{t("Rodízio, e quem volta segue pela mesma saída")}</SelectItem>
            <SelectItem value="proximo">{t("Rodízio sempre")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("Saídas")}</Label>
        <ul className="space-y-1.5">
          {c.saidas.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <Input
                aria-label={`${t("Saída")} ${i + 1}`}
                value={s.nome}
                maxLength={40}
                onChange={(e) => gravar({ ...c, saidas: c.saidas.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)) })}
              />
              <button
                type="button"
                className="rounded p-1 text-error-fg hover:bg-surface-elevated disabled:opacity-30"
                disabled={c.saidas.length <= 2}
                aria-label={t("Remover saída")}
                onClick={() => gravar({ ...c, saidas: c.saidas.filter((_, k) => k !== i) })}
              >
                <Trash size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={c.saidas.length >= 10}
          onClick={() => gravar({ ...c, saidas: [...c.saidas, { id: novoId(), nome: `${t("Saída")} ${c.saidas.length + 1}` }] })}
        >
          <Plus size={12} className="mr-1" aria-hidden />
          {t("Adicionar saída")}
        </Button>
      </div>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
