"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ImportarLista } from "@/components/campanhas/ImportarLista";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { useListas } from "@/hooks/campanhas/useListas";

/**
 * Operações › Listas (fork jhoow, 9021): as planilhas subidas aqui OU dentro de
 * uma campanha — a mesma lista. Na campanha, "Importar lista › Usar uma lista
 * salva" escolhe qualquer uma destas.
 */
export function ListasClient() {
  const t = useT();
  const qc = useQueryClient();
  const listas = useListas();
  const [nova, setNova] = useState(false);
  const [nome, setNome] = useState("");
  const [apagando, setApagando] = useState<string | null>(null);

  async function apagar(id: string) {
    try {
      await apiClient.delete(`/api/v1/listas/${id}`);
      toast.success(t("Lista apagada."));
      await qc.invalidateQueries({ queryKey: ["listas"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Não foi possível apagar a lista."));
    } finally {
      setApagando(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Listas")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("As planilhas de contatos da empresa. Use qualquer uma como público de uma campanha.")}
          </p>
        </div>
        <Button onClick={() => setNova((x) => !x)} data-testid="nova-lista">
          {nova ? t("Fechar") : t("Nova lista")}
        </Button>
      </header>

      {nova && (
        <Card className="space-y-4 p-4" data-testid="cartao-nova-lista">
          <div className="space-y-2">
            <Label htmlFor="nome-da-lista" className="block">
              {t("Nome da lista")}
            </Label>
            <Input
              id="nome-da-lista"
              placeholder={t("ex.: Advogados Lisboa — outubro")}
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <ImportarLista
            destino="lista"
            nomeDaLista={nome}
            onImportada={() => {
              setNome("");
              void qc.invalidateQueries({ queryKey: ["listas"] });
            }}
          />
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {listas.isLoading ? (
          <Skeleton className="m-4 h-24" />
        ) : (listas.data ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("Nenhuma lista ainda. Suba a primeira em “Nova lista”.")}</p>
        ) : (
          <table className="w-full text-sm" data-testid="tabela-de-listas">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">{t("Nome")}</th>
                <th className="px-4 py-2">{t("Contatos")}</th>
                <th className="px-4 py-2">{t("Campanha")}</th>
                <th className="px-4 py-2">{t("Criada em")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(listas.data ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0" data-testid={`lista-${l.id}`}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{l.nome}</span>
                    {l.arquivo && l.arquivo !== l.nome && <span className="block text-xs text-muted-foreground">{l.arquivo}</span>}
                  </td>
                  <td className="px-4 py-2">{l.contatos}</td>
                  <td className="px-4 py-2">
                    {l.campanha ? (
                      <Link href={`/app/campaigns/${l.campanha.id}`} className="text-accent-500 underline">
                        {l.campanha.nome || t("Campanha")}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(l.criada_em).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {apagando === l.id ? (
                      <span className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => void apagar(l.id)}>
                          {t("Confirmar")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setApagando(null)}>
                          {t("Voltar")}
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setApagando(l.id)}>
                        {t("Apagar")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
