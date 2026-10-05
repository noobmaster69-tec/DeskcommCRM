"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVariaveisDaOrganizacao } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";

/**
 * O IDIOMA DA CAMPANHA (fork jhoow, 9019). As opções são as que a empresa
 * configurou no campo `idioma_conversa` (ou `idioma_prospeccao`) em
 * Configurações › Variáveis, tipo seleção — a tela não inventa idiomas. Sem
 * essa configuração, campo livre (ex.: pt-PT).
 */
export function IdiomaDaCampanha({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const t = useT();
  const org = useVariaveisDaOrganizacao();
  const def = (org.data ?? []).find((v) => (v.key === "idioma_conversa" || v.key === "idioma_prospeccao") && (v.options?.length ?? 0) > 0);
  const opcoes = def?.options ?? [];
  return (
    <div className="space-y-2" data-testid="idioma-da-campanha">
      <Label htmlFor="idioma-campanha">{t("Idioma da campanha")}</Label>
      {opcoes.length > 0 ? (
        <select
          id="idioma-campanha"
          className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("Sem idioma próprio (o do contato)")}</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {valor && !opcoes.includes(valor) && <option value={valor}>{valor}</option>}
        </select>
      ) : (
        <Input id="idioma-campanha" value={valor} placeholder="pt-PT" onChange={(e) => onChange(e.target.value)} />
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          "Inicia o idioma da prospecção e da conversa de quem ainda não tem um — a IA e os blocos respondem nele. Conversa já estabelecida em outro idioma continua nele.",
        )}
      </p>
    </div>
  );
}
