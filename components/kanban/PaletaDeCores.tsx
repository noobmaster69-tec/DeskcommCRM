"use client";
import { useT } from "@/hooks/i18n/useT";
import { CORES_DE_ETAPA, NOMES_DAS_CORES } from "@/lib/kanban/cores-de-etapa";
import { cn } from "@/lib/utils";

/**
 * As oito cores pastéis do Kommo mais "sem cor", como grupo de rádio. A MESMA
 * paleta serve à coluna (etapa) e ao funil — duas paletas divergiriam no
 * primeiro ajuste e o quadro teria dois tons de "azul".
 *
 * `prefixo` monta os `data-testid` (`<prefixo>-cor-<hex>` e `<prefixo>-cor-nenhuma`).
 */
export function PaletaDeCores({
  valor,
  onChange,
  prefixo,
}: {
  valor: string | null;
  onChange: (cor: string | null) => void;
  prefixo: string;
}) {
  const t = useT();
  const anel = "ring-2 ring-accent ring-offset-2 ring-offset-background";
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("Cor")}>
      <button
        type="button"
        role="radio"
        aria-checked={valor === null}
        aria-label={t("Sem cor")}
        title={t("Sem cor")}
        data-testid={`${prefixo}-cor-nenhuma`}
        onClick={() => onChange(null)}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-border text-[10px] text-text-muted",
          valor === null && anel,
        )}
      >
        ⌀
      </button>
      {CORES_DE_ETAPA.map((hex) => (
        <button
          key={hex}
          type="button"
          role="radio"
          aria-checked={valor?.toLowerCase() === hex}
          aria-label={t(NOMES_DAS_CORES[hex])}
          title={t(NOMES_DAS_CORES[hex])}
          data-testid={`${prefixo}-cor-${hex.slice(1)}`}
          onClick={() => onChange(hex)}
          style={{ backgroundColor: hex }}
          className={cn("h-7 w-7 rounded-full border border-black/10", valor?.toLowerCase() === hex && anel)}
        />
      ))}
    </div>
  );
}
