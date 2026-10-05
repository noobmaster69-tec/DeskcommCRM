"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrms, useEtapas, useFunis, useVariaveisDaOrganizacao } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";
import type {
  CondicaoDeCampo,
  FonteDoPublico as Fonte,
  OperadorDeCampo,
  ValoresDaCampanha,
} from "@/app/app/campaigns/_form/valores";
import { ImportarLista } from "./ImportarLista";

const MODOS: ReadonlyArray<{ valor: Fonte; rotulo: string; dica: string }> = [
  { valor: "crm", rotulo: "Do CRM", dica: "Contatos com negócio num funil, por etapa, data de entrada, etiquetas e variáveis." },
  { valor: "etiqueta", rotulo: "Por etiqueta", dica: "Contatos com alguma (ou todas) as etiquetas escolhidas." },
  { valor: "importacao", rotulo: "Importar lista", dica: "Uma planilha CSV ou XLSX vira a lista desta campanha." },
];

const OPERADORES: ReadonlyArray<{ valor: OperadorDeCampo; rotulo: string }> = [
  { valor: "igual", rotulo: "é igual a" },
  { valor: "contem", rotulo: "contém" },
  { valor: "preenchido", rotulo: "está preenchida" },
  { valor: "vazio", rotulo: "está vazia" },
];

const SELECT = "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm";

/**
 * FONTE DO PÚBLICO (fork jhoow, Campanhas › item 1): de onde a campanha tira
 * quem recebe — do CRM, por etiqueta ou de uma planilha importada. A consulta
 * avançada (modo 4) não entrou nesta rodada; ver RESUMO.md.
 */
export function FonteDoPublico({
  v,
  setV,
}: {
  v: ValoresDaCampanha;
  setV: (f: (atual: ValoresDaCampanha) => ValoresDaCampanha) => void;
}) {
  const t = useT();
  const mudar = <K extends keyof ValoresDaCampanha>(campo: K, valor: ValoresDaCampanha[K]) =>
    setV((a) => ({ ...a, [campo]: valor }));
  const crms = useCrms();
  const funis = useFunis(v.crmDoPublico || null);
  const etapas = useEtapas(v.funilDoPublico || null);
  const variaveis = useVariaveisDaOrganizacao();

  const mudarCampo = (i: number, p: Partial<CondicaoDeCampo>) =>
    setV((a) => ({ ...a, campos: a.campos.map((c, j) => (j === i ? { ...c, ...p } : c)) }));

  const etiquetas = (
    <>
      <div className="space-y-2">
        <Label htmlFor="com-tags">
          {v.fonte === "etiqueta" && v.todasAsTags ? t("Com todas estas etiquetas") : t("Com alguma destas etiquetas")}
        </Label>
        <Input
          id="com-tags"
          value={v.comAlgumaTag}
          onChange={(e) => mudar("comAlgumaTag", e.target.value)}
          placeholder={t("separe por vírgula")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sem-tags">{t("Sem nenhuma destas etiquetas")}</Label>
        <Input
          id="sem-tags"
          value={v.semTags}
          onChange={(e) => mudar("semTags", e.target.value)}
          placeholder={t("separe por vírgula")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="silencio">{t("Sem falar com a gente há (dias)")}</Label>
        <Input
          id="silencio"
          type="number"
          min={1}
          value={v.semInteracao}
          onChange={(e) => mudar("semInteracao", e.target.value)}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t("Fonte do público")} className="grid gap-2 sm:grid-cols-3">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={v.fonte === m.valor}
            onClick={() => mudar("fonte", m.valor)}
            className={`rounded-md border p-3 text-left text-sm transition-colors ${
              v.fonte === m.valor ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
            }`}
          >
            <span className="block font-medium">{t(m.rotulo)}</span>
            <span className="block text-xs text-muted-foreground">{t(m.dica)}</span>
          </button>
        ))}
      </div>

      {v.fonte === "crm" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pub-crm">{t("CRM")}</Label>
              <select
                id="pub-crm"
                className={SELECT}
                value={v.crmDoPublico}
                onChange={(e) => setV((a) => ({ ...a, crmDoPublico: e.target.value, funilDoPublico: "", etapasDoPublico: [] }))}
              >
                <option value="">{t("Todos os CRMs")}</option>
                {(crms.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pub-funil">{t("Com negócio no funil")}</Label>
              <select
                id="pub-funil"
                className={SELECT}
                value={v.funilDoPublico}
                onChange={(e) => setV((a) => ({ ...a, funilDoPublico: e.target.value, etapasDoPublico: [] }))}
              >
                <option value="">{t("Qualquer um")}</option>
                {(funis.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {v.funilDoPublico && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("Nas etapas (nenhuma marcada = todas)")}</legend>
              <div className="flex flex-wrap gap-3">
                {(etapas.data ?? []).map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={v.etapasDoPublico.includes(e.id)}
                      onChange={(x) =>
                        setV((a) => ({
                          ...a,
                          etapasDoPublico: x.target.checked
                            ? [...a.etapasDoPublico, e.id]
                            : a.etapasDoPublico.filter((id) => id !== e.id),
                        }))
                      }
                    />
                    {e.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entrou-de">{t("Entrou no funil a partir de")}</Label>
              <Input id="entrou-de" type="date" value={v.entrouDe} onChange={(e) => mudar("entrouDe", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entrou-ate">{t("Entrou no funil até")}</Label>
              <Input id="entrou-ate" type="date" value={v.entrouAte} onChange={(e) => mudar("entrouAte", e.target.value)} />
            </div>
            {etiquetas}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("Variáveis do contato")}</p>
            {v.campos.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <select
                  aria-label={t("Variável")}
                  className={SELECT}
                  value={c.chave}
                  onChange={(e) => mudarCampo(i, { chave: e.target.value })}
                >
                  <option value="">{t("Escolha a variável")}</option>
                  {(variaveis.data ?? []).map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("Condição")}
                  className={SELECT}
                  value={c.operador}
                  onChange={(e) => mudarCampo(i, { operador: e.target.value as OperadorDeCampo })}
                >
                  {OPERADORES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {t(o.rotulo)}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={t("Valor")}
                  value={c.valor}
                  disabled={c.operador === "preenchido" || c.operador === "vazio"}
                  onChange={(e) => mudarCampo(i, { valor: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setV((a) => ({ ...a, campos: a.campos.filter((_, j) => j !== i) }))}
                >
                  {t("Remover")}
                </Button>
              </div>
            ))}
            {v.campos.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={(variaveis.data ?? []).length === 0}
                onClick={() => setV((a) => ({ ...a, campos: [...a.campos, { chave: "", operador: "igual", valor: "" }] }))}
              >
                {t("Adicionar condição")}
              </Button>
            )}
          </div>
        </div>
      )}

      {v.fonte === "etiqueta" && (
        <div className="space-y-4">
          <div role="radiogroup" aria-label={t("Como combinar as etiquetas")} className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={!v.todasAsTags} onChange={() => mudar("todasAsTags", false)} />
              {t("Qualquer uma")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={v.todasAsTags} onChange={() => mudar("todasAsTags", true)} />
              {t("Todas")}
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">{etiquetas}</div>
        </div>
      )}

      {v.fonte === "importacao" && (
        <ImportarLista
          importada={v.listaImportada ? { id: v.listaImportada, resumo: v.resumoDaLista } : null}
          onImportada={(r) =>
            setV((a) => ({
              ...a,
              listaImportada: r.fonteId,
              resumoDaLista: r,
              // O teto acompanha a lista: importar 800 e mandar para 100 seria surpresa.
              limite: String(Math.min(5000, Math.max(Number(a.limite) || 0, r.criados + r.atualizados + r.mantidos))),
            }))
          }
          onTrocar={() => setV((a) => ({ ...a, listaImportada: "", resumoDaLista: null }))}
        />
      )}
    </div>
  );
}
