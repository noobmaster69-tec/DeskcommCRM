"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { useIdiomasDaConversa, useMudarIdiomasDaConversa } from "@/hooks/inbox/useIdiomasDaConversa";
import { IDIOMAS_OFERECIDOS, nomeDaLingua, nomeDoIdioma } from "@/lib/translation/idiomas";
import { Languages } from "./icones";

const ORIGEM: Record<string, string> = {
  manual: "escolhido manualmente",
  ddi: "detectado por DDI",
  detected: "detectado pelo texto",
};

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * "🌐 Inglês ⇄ Português" — o par de idiomas da conversa (fork jhoow, item 5).
 * Só aparece quando o cliente fala outra língua. O menu troca o idioma do
 * cliente (vira manual e re-traduz), o meu, e as chaves de entrada/saída.
 * O MESMO componente no cabeçalho do Inbox e no do drawer do funil.
 */
export function SeloDeIdiomas({ conversationId }: { conversationId: string }) {
  const t = useT();
  const q = useIdiomasDaConversa(conversationId);
  const mudar = useMudarIdiomasDaConversa(conversationId);
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<{ contato: string; meu: string; entrada: boolean; saida: boolean } | null>(null);
  const d = q.data;
  if (!d?.contato?.locale || !d.idiomas_diferentes || !d.traducao) return null;

  const r = rascunho ?? { contato: d.contato.locale, meu: d.meu_idioma, entrada: d.traducao.entrada, saida: d.traducao.saida };
  const select =
    "h-8 w-full rounded-[8px] border border-ibx-border bg-ibx-field px-2 text-[13px] text-ibx-text focus-visible:outline-2 focus-visible:outline-ibx-accent";

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setRascunho(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border border-ibx-border px-2.5 text-[12px] font-medium text-ibx-text-2 transition-colors hover:border-ibx-border-hover hover:text-ibx-text focus-visible:outline-2 focus-visible:outline-ibx-accent"
          data-testid="selo-de-idiomas"
          title={t("Tradução automática desta conversa")}
        >
          <Languages size={14} aria-hidden />
          {maiuscula(t(nomeDaLingua(d.contato.locale)))} ⇄ {maiuscula(t(nomeDaLingua(d.meu_idioma)))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3 font-inbox">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ibx-text">{t("Idioma do cliente")}</span>
          <select
            className={select}
            value={r.contato}
            onChange={(e) => setRascunho({ ...r, contato: e.target.value })}
          >
            {[...new Set([r.contato, ...IDIOMAS_OFERECIDOS])].map((l) => (
              <option key={l} value={l}>
                {t(nomeDoIdioma(l))}
              </option>
            ))}
          </select>
          {d.contato.source && <span className="block text-[11px] text-ibx-muted">{t(ORIGEM[d.contato.source] ?? "")}</span>}
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-ibx-text">{t("Meu idioma")}</span>
          <select className={select} value={r.meu} onChange={(e) => setRascunho({ ...r, meu: e.target.value })}>
            {[...new Set([r.meu, ...IDIOMAS_OFERECIDOS])].map((l) => (
              <option key={l} value={l}>
                {t(nomeDoIdioma(l))}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ibx-text">{t("Traduzir mensagens recebidas")}</span>
          <Switch
            checked={r.entrada}
            onCheckedChange={(v) => setRascunho({ ...r, entrada: v })}
            aria-label={t("Traduzir mensagens recebidas")}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ibx-text">{t("Traduzir minhas respostas")}</span>
          <Switch
            checked={r.saida}
            onCheckedChange={(v) => setRascunho({ ...r, saida: v })}
            aria-label={t("Traduzir minhas respostas")}
          />
        </div>
        <button
          type="button"
          disabled={mudar.isPending}
          className="h-8 w-full rounded-[10px] bg-ibx-accent text-[13px] font-semibold text-white hover:bg-ibx-accent-hover disabled:opacity-60"
          onClick={() =>
            mudar.mutate(
              {
                ...(r.contato !== d.contato.locale ? { contato_locale: r.contato } : {}),
                ...(r.meu !== d.meu_idioma ? { meu_idioma: r.meu } : {}),
                entrada: r.entrada,
                saida: r.saida,
              },
              {
                onSuccess: () => {
                  setAberto(false);
                  setRascunho(null);
                },
                onError: () => toast.error(t("Não foi possível salvar o idioma.")),
              },
            )
          }
        >
          {mudar.isPending ? t("Salvando…") : t("Salvar")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
