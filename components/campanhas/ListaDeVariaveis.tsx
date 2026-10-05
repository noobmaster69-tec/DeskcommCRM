"use client";

import { useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";

interface Personalizada {
  key: string;
  label: string;
}

/**
 * As variáveis que o texto da campanha pode usar (fork jhoow, Campanhas › item 2):
 * as do SISTEMA e as da organização (Configurações › Variáveis). Clicar insere
 * `{chave}` no texto.
 */
export function ListaDeVariaveis({ onInserir }: { onInserir: (token: string) => void }) {
  const t = useT();
  const [personalizadas, setPersonalizadas] = useState<Personalizada[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch("/api/v1/variaveis")
      .then((r) => (r.ok ? (r.json() as Promise<{ data: { personalizadas: Personalizada[] } }>) : null))
      .then((j) => vivo && j && setPersonalizadas(j.data.personalizadas ?? []))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const chip = (chave: string, dica: string) => (
    <button
      key={chave}
      type="button"
      title={dica}
      className="rounded-md bg-surface-elevated px-1.5 py-0.5 font-mono text-xs hover:bg-accent-soft"
      onClick={() => onInserir(`{${chave}}`)}
      data-testid={`variavel-${chave}`}
    >
      {`{${chave}}`}
    </button>
  );

  return (
    <div className="space-y-2 text-sm text-muted-foreground" data-testid="lista-de-variaveis">
      <p>{t("Clique para inserir uma variável:")}</p>
      <div className="flex flex-wrap gap-1.5">{VARIAVEIS_DO_SISTEMA.map((v) => chip(v.chave, t(v.descricao)))}</div>
      {personalizadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{personalizadas.map((v) => chip(v.key, v.label))}</div>
      )}
      <p>
        {t(
          "Quem não tiver o dado que a mensagem usa fica de fora, com o motivo na lista — mensagem com buraco não sai. Crie variáveis em Configurações › Variáveis.",
        )}
      </p>
    </div>
  );
}
