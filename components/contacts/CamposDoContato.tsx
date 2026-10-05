"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { CampoDaFicha, GrupoDaFicha, ValorDoCampo } from "@/lib/contacts/ficha-de-campos";
import { cn } from "@/lib/utils";

const SELECT = "h-8 w-full rounded-md border border-border bg-surface px-2 text-sm";

export function useCamposDoContato(contactId: string | null) {
  return useQuery({
    queryKey: ["contato-campos", contactId],
    queryFn: async () =>
      (await apiClient.get<{ data: { contato_id: string; grupos: GrupoDaFicha[] } }>(`/api/v1/contacts/${contactId}/campos`)).data,
    enabled: !!contactId,
    staleTime: 15_000,
  });
}

function vazio(v: ValorDoCampo): boolean {
  return v === null || v === "";
}

function textoDoValor(c: CampoDaFicha, t: (s: string) => string): string {
  if (vazio(c.valor)) return "";
  if (c.tipo === "booleano") return c.valor === true ? t("Sim") : t("Não");
  if (c.tipo === "datahora" && typeof c.valor === "string") {
    const d = new Date(c.valor);
    return Number.isNaN(d.getTime()) ? c.valor : d.toLocaleString();
  }
  if (c.tipo === "data" && typeof c.valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.valor)) {
    const [a, m, d] = c.valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return String(c.valor);
}

/** Um campo em edição — o controle segue o TIPO (definição compartilhada da empresa). */
function Controle({
  c,
  valor,
  onChange,
  idBase,
}: {
  c: CampoDaFicha;
  valor: string;
  onChange: (v: string) => void;
  idBase: string;
}) {
  const t = useT();
  const id = `${idBase}-${c.chave}`;
  if (c.tipo === "booleano")
    return (
      <select id={id} className={SELECT} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">{t("Sim")}</option>
        <option value="false">{t("Não")}</option>
      </select>
    );
  if (c.tipo === "selecao" || c.opcoes.length > 0)
    return (
      <select id={id} className={SELECT} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {c.opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {valor && !c.opcoes.includes(valor) && <option value={valor}>{valor}</option>}
      </select>
    );
  return (
    <Input
      id={id}
      className="h-8"
      type={c.tipo === "data" ? "date" : c.tipo === "email" ? "email" : "text"}
      inputMode={c.tipo === "numero" ? "decimal" : undefined}
      value={valor}
      placeholder={c.aceitaManual && c.efetivo ? c.efetivo : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function paraEdicao(c: CampoDaFicha): string {
  if (vazio(c.valor)) return "";
  if (c.tipo === "booleano") return c.valor === true ? "true" : "false";
  return String(c.valor);
}

function Grupo({
  contactId,
  grupo,
  podeEditar,
  aberto,
  onAlternar,
}: {
  contactId: string;
  grupo: GrupoDaFicha;
  podeEditar: boolean;
  aberto: boolean;
  onAlternar: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const preenchidos = grupo.campos.filter((c) => !vazio(c.valor) || (c.origem === "calculado" && c.efetivo)).length;
  const editaveis = grupo.campos.filter((c) => !c.somenteLeitura);

  const salvar = useMutation({
    mutationFn: async (valores: Record<string, ValorDoCampo>) =>
      apiClient.patch(`/api/v1/contacts/${contactId}/campos`, { valores }),
    onSuccess: async () => {
      setEditando(false);
      setErros({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contato-campos", contactId] }),
        qc.invalidateQueries({ queryKey: ["contact", contactId] }),
      ]);
      toast.success(t("Campos salvos."));
    },
    onError: (err) => {
      const lista = (err instanceof ApiError ? (err.details?.campos as Array<{ chave: string; mensagem: string }> | undefined) : undefined) ?? [];
      if (lista.length > 0) setErros(Object.fromEntries(lista.map((e) => [e.chave, e.mensagem])));
      else toast.error(err instanceof Error ? err.message : t("Não foi possível salvar os campos."));
    },
  });

  function comecar() {
    setRascunho(Object.fromEntries(editaveis.map((c) => [c.chave, paraEdicao(c)])));
    setErros({});
    setEditando(true);
    if (!aberto) onAlternar();
  }

  function enviar() {
    const valores: Record<string, ValorDoCampo> = {};
    for (const c of editaveis) {
      const novo = rascunho[c.chave] ?? "";
      if (novo === paraEdicao(c)) continue; // só o que mudou: o resto fica como está
      valores[c.chave] = novo === "" ? null : c.tipo === "booleano" ? novo === "true" : novo;
    }
    if (Object.keys(valores).length === 0) {
      setEditando(false);
      return;
    }
    salvar.mutate(valores);
  }

  return (
    <div className="rounded-md border border-border" data-testid={`grupo-${grupo.id}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
          aria-expanded={aberto}
          onClick={onAlternar}
        >
          <span aria-hidden className={cn("inline-block transition-transform", aberto && "rotate-90")}>
            ›
          </span>
          <span className="truncate">{grupo.rotulo}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {preenchidos}/{grupo.campos.length}
          </span>
        </button>
        {podeEditar && editaveis.length > 0 && !editando && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={comecar}>
            {t("Editar")}
          </Button>
        )}
      </div>
      {aberto && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {grupo.campos.map((c) => {
            const emEdicao = editando && !c.somenteLeitura;
            const valorTxt = textoDoValor(c, t);
            return (
              <div key={c.chave} className="space-y-1" data-testid={`campo-${c.chave}`}>
                <label htmlFor={`f-${grupo.id}-${c.chave}`} className="block text-xs text-muted-foreground">
                  {c.rotulo} <span className="font-mono text-[10px] opacity-70">{`{${c.chave}}`}</span>
                </label>
                {emEdicao ? (
                  <>
                    <Controle
                      c={c}
                      idBase={`f-${grupo.id}`}
                      valor={rascunho[c.chave] ?? ""}
                      onChange={(v) => setRascunho((r) => ({ ...r, [c.chave]: v }))}
                    />
                    {c.dica && <p className="text-[11px] text-muted-foreground">{c.dica}</p>}
                    {erros[c.chave] && <p className="text-xs text-error-fg">{erros[c.chave]}</p>}
                  </>
                ) : (
                  <p className="wrap-anywhere text-sm">
                    {valorTxt ||
                      (c.efetivo ? (
                        <span className="text-muted-foreground">
                          {c.efetivo} <span className="text-[11px]">({t("automático")})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ))}
                  </p>
                )}
              </div>
            );
          })}
          {editando && (
            <div className="flex gap-2 pt-1">
              <Button type="button" size="sm" disabled={salvar.isPending} onClick={enviar} data-testid={`salvar-${grupo.id}`}>
                {salvar.isPending ? t("Salvando…") : t("Salvar")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)}>
                {t("Cancelar")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CAMPOS DO CONTATO (fork jhoow): "Dados do contato" e "Campos personalizados",
 * em grupos recolhíveis com edição simples. A MESMA ficha no Inbox e na página
 * do contato; campo novo (Configurações › Variáveis) aparece sozinho.
 */
export function CamposDoContato({ contactId, podeEditar }: { contactId: string; podeEditar: boolean }) {
  const t = useT();
  const q = useCamposDoContato(contactId);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ contato: true });

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  // Resposta sem grupos (API antiga ou dublê de teste) = nada a mostrar, nunca quebra o painel.
  const todos = Array.isArray(q.data?.grupos) ? q.data.grupos : null;
  if (!q.isError && !todos) return null;
  if (q.isError || !todos)
    return (
      <p className="text-xs text-error-fg">
        {t("Não foi possível carregar os campos do contato.")}{" "}
        <button type="button" className="underline" onClick={() => q.refetch()}>
          {t("Tentar novamente")}
        </button>
      </p>
    );

  const secoes: Array<{ id: "dados" | "personalizados"; titulo: string }> = [
    { id: "dados", titulo: t("Dados do contato") },
    { id: "personalizados", titulo: t("Campos personalizados") },
  ];
  return (
    <div className="space-y-4" data-testid="campos-do-contato">
      {secoes.map((s) => {
        const grupos = todos.filter((g) => g.secao === s.id);
        if (grupos.length === 0) return null;
        return (
          <section key={s.id} className="space-y-2">
            <h3 className="text-xs font-semibold text-text">{s.titulo}</h3>
            {grupos.map((g) => (
              <Grupo
                key={g.id}
                contactId={contactId}
                grupo={g}
                podeEditar={podeEditar}
                aberto={abertos[g.id] ?? false}
                onAlternar={() => setAbertos((a) => ({ ...a, [g.id]: !(a[g.id] ?? false) }))}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
