"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVariaveisDaOrganizacao } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { CAMPOS_DO_CONTATO, campoDoCatalogo } from "@/lib/variables/campos-do-contato";
import { VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";

/**
 * O SELETOR DE VARIÁVEIS (fork jhoow): as do sistema, os campos do contato (o
 * catálogo da ficha) e as da empresa. Clicar insere `{chave}` no texto.
 */
export function ListaDeVariaveis({ onInserir }: { onInserir: (token: string) => void }) {
  const t = useT();
  const org = useVariaveisDaOrganizacao();
  const daEmpresa = (org.data ?? []).filter((v) => !campoDoCatalogo(v.key));
  const padrao = CAMPOS_DO_CONTATO.filter((c) => c.origem === "padrao");

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
      <p className="text-xs font-medium">{t("Do contato e do envio")}</p>
      <div className="flex flex-wrap gap-1.5">{VARIAVEIS_DO_SISTEMA.map((v) => chip(v.chave, t(v.descricao)))}</div>
      <p className="text-xs font-medium">{t("Campos do contato")}</p>
      <div className="flex flex-wrap gap-1.5">{padrao.map((c) => chip(c.chave, t(c.rotulo)))}</div>
      {daEmpresa.length > 0 && (
        <>
          <p className="text-xs font-medium">{t("Da empresa")}</p>
          <div className="flex flex-wrap gap-1.5">{daEmpresa.map((v) => chip(v.key, v.label))}</div>
        </>
      )}
      <p>
        {t(
          "Quem não tiver o dado que a mensagem usa fica de fora, com o motivo na lista — mensagem com buraco não sai. Para um texto alternativo, use a barra: {nome_saudacao|tudo bem}. Crie variáveis em Configurações › Variáveis.",
        )}
      </p>
    </div>
  );
}

interface Previa {
  texto: string;
  faltando: string[];
  desconhecidas: string[];
  fuso: string;
  idioma: string | null;
}

/**
 * PRÉVIA POR CONTATO (fork jhoow): a mensagem como UM contato real a receberia
 * agora — os dados dele, o fuso e o idioma dele. O que faltar aparece.
 */
export function PreviaPorContato({ texto, idioma, fuso }: { texto: string; idioma?: string | null; fuso?: string | null }) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [contato, setContato] = useState<{ id: string; nome: string } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const contatos = useContactList({ search: busca || undefined, limit: 8 });
  const lista = contatos.data?.pages.flatMap((p) => p.data) ?? [];

  async function ver(id: string) {
    setCarregando(true);
    try {
      const r = await apiClient.post<{ data: Previa }>("/api/v1/variaveis/previa", {
        texto,
        contact_id: id,
        idioma: idioma ?? null,
        fuso: fuso ?? null,
      });
      setPrevia(r.data);
    } catch {
      setPrevia(null);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="previa-por-contato">
      <p className="text-sm font-medium">{t("Prévia para um contato")}</p>
      {!contato ? (
        <>
          <Input
            aria-label={t("Buscar contato")}
            placeholder={t("Buscar contato por nome ou telefone")}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-surface-elevated"
                    onClick={() => {
                      const nome = c.name ?? c.display_name ?? c.phone_number ?? c.id;
                      setContato({ id: c.id, nome });
                      void ver(c.id);
                    }}
                  >
                    {c.name ?? c.display_name ?? "—"} <span className="text-muted-foreground">{c.phone_number}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{contato.nome}</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" disabled={carregando} onClick={() => void ver(contato.id)}>
                {t("Atualizar")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setContato(null);
                  setPrevia(null);
                }}
              >
                {t("Trocar")}
              </Button>
            </div>
          </div>
          {previa && (
            <>
              <p className="whitespace-pre-wrap wrap-anywhere rounded-md bg-surface-elevated p-2 text-sm" data-testid="previa-texto">
                {previa.texto}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Fuso")}: {previa.fuso}
                {previa.idioma ? ` · ${t("Idioma")}: ${previa.idioma}` : ""}
              </p>
              {(previa.faltando.length > 0 || previa.desconhecidas.length > 0) && (
                <p className="text-xs text-error-fg" data-testid="previa-faltando">
                  {previa.faltando.length > 0 && `${t("Sem valor para este contato")}: ${previa.faltando.map((x) => `{${x}}`).join(", ")}. `}
                  {previa.desconhecidas.length > 0 && `${t("Variável desconhecida")}: ${previa.desconhecidas.map((x) => `{${x}}`).join(", ")}.`}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
