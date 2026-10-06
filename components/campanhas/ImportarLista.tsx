"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useEtapas, useFunis, useVariaveisDaOrganizacao } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";
import { decodificarCsv, parseCsv } from "@/lib/contacts/csv";
import {
  DESTINOS_DO_CATALOGO,
  DESTINOS_FIXOS,
  MAX_LINHAS_IMPORTADAS,
  POLITICAS_DE_DUPLICATA,
  type DestinoDaColuna,
  type PoliticaDeDuplicata,
  lerLinhas,
  sugerirDestino,
} from "@/lib/campanhas/importacao";
import { lerXlsx } from "@/lib/campanhas/xlsx";
import { COLUNAS_DO_MODELO, destinoDoModelo } from "@/lib/campanhas/import-xlsx";
import { NOMES_RESERVADOS } from "@/lib/variables/sistema";
import { campoDoCatalogo } from "@/lib/variables/campos-do-contato";

export interface ResumoDaLista {
  /** `null` no import de Contatos (não grava audiência). */
  fonteId: string | null;
  total: number;
  criados: number;
  atualizados: number;
  mantidos: number;
  pulados: number;
  invalidos: number;
  cards: number;
}

const MAX_BYTES = 10 * 1024 * 1024;

const ROTULO_DA_POLITICA: Record<PoliticaDeDuplicata, { titulo: string; dica: string }> = {
  pular: { titulo: "Pular", dica: "Quem já é contato fica fora desta lista." },
  atualizar: { titulo: "Atualizar", dica: "Entra na lista e recebe o nome e as variáveis da planilha (célula vazia não apaga nada)." },
  manter: {
    titulo: "Manter como está",
    dica: "Entra na lista com o cadastro que já existe. Não se cria um contato duplicado: o mesmo número é a mesma pessoa no WhatsApp.",
  },
};

const ERRO_DE_LEITURA = {
  grande: "O arquivo passa de 10 MB.",
  binario: "Não consegui ler este arquivo. Envie um CSV ou XLSX.",
  vazio: "A planilha não tem linhas de dados.",
  muitas: "A planilha passa de 5.000 linhas — divida em arquivos menores.",
} as const;
type ErroDeLeitura = keyof typeof ERRO_DE_LEITURA;

/**
 * IMPORTAR LISTA (fork jhoow, Campanhas › item 1, modo 3): a planilha vira a
 * audiência da campanha. Lida AQUI (prévia, mapeamento, telefones inválidos em
 * vermelho, duplicados), gravada no servidor — que guarda o arquivo original
 * para auditoria e devolve a lista (`campaign_audience_sources`).
 */
export function ImportarLista({
  importada = null,
  onImportada,
  onTrocar,
  destino = "campanha",
}: {
  importada?: { id: string; resumo: ResumoDaLista | null } | null;
  onImportada?: (r: ResumoDaLista) => void;
  onTrocar?: () => void;
  /** "contatos": a página de Contatos — atualiza a base, sem audiência de campanha. */
  destino?: "campanha" | "contatos";
}) {
  const t = useT();
  const [concluida, setConcluida] = useState<ResumoDaLista | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tabela, setTabela] = useState<string[][] | null>(null);
  const [erro, setErro] = useState<ErroDeLeitura | null>(null);
  const [destinos, setDestinos] = useState<DestinoDaColuna[]>([]);
  const [politica, setPolitica] = useState<PoliticaDeDuplicata>(destino === "contatos" ? "atualizar" : "manter");
  const [criarCards, setCriarCards] = useState(false);
  const [funil, setFunil] = useState("");
  const [etapa, setEtapa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null);
  /** O mapeamento foi confirmado ("Avançar") — aí vêm a prévia e as opções. */
  const [avancou, setAvancou] = useState(false);
  /** Telefones (E.164) que JÁ são contatos do CRM — amarelo na prévia. */
  const [noCrm, setNoCrm] = useState<Set<string>>(new Set());
  const variaveis = useVariaveisDaOrganizacao();
  // As da organização que NÃO são campos do catálogo (esses aparecem no grupo próprio).
  const personalizadas = useMemo(() => (variaveis.data ?? []).filter((p) => !campoDoCatalogo(p.key)), [variaveis.data]);
  const funis = useFunis();
  const etapas = useEtapas(funil || null);

  const existentes = useMemo(() => personalizadas.map((p) => p.key), [personalizadas]);

  async function escolher(f: File | null) {
    setArquivo(f);
    setAvancou(false);
    setNoCrm(new Set());
    setTabela(null);
    setErro(null);
    setErroDoEnvio(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setErro("grande");
    const bytes = new Uint8Array(await f.arrayBuffer());
    let linhas: string[][];
    if (/\.xlsx$/i.test(f.name)) {
      try {
        linhas = lerXlsx(bytes);
      } catch {
        return setErro("binario");
      }
    } else {
      const d = decodificarCsv(bytes);
      if ("erro" in d) return setErro("binario");
      linhas = parseCsv(d.texto);
    }
    linhas = linhas.filter((l) => l.some((c) => c.trim() !== ""));
    if (linhas.length < 2) return setErro("vazio");
    if (linhas.length - 1 > MAX_LINHAS_IMPORTADAS) return setErro("muitas");
    setTabela(linhas);
    setDestinos(linhas[0]!.map((c) => sugerirDestino(c, existentes)));
  }

  const cabecalho = tabela?.[0] ?? [];
  const dados = useMemo(() => tabela?.slice(1) ?? [], [tabela]);
  const leitura = useMemo(
    () => (tabela ? lerLinhas(cabecalho, dados, destinos) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabela, destinos],
  );
  const invalidas = new Map(leitura?.invalidas.map((x) => [x.linha, x.motivo]));
  const repetidas = new Set(leitura?.duplicadas.map((x) => x.linha));
  const telefoneDaLinha = new Map(leitura?.validas.map((x) => [x.linha, x.telefone]));
  const jaNoCrm = (leitura?.validas ?? []).filter((x) => x.telefone && noCrm.has(x.telefone)).length;
  const temTelefone = destinos.includes("numero_contato");
  const reconhecidas = cabecalho.filter((c) => destinoDoModelo(c) !== null);

  /** Confirma o mapeamento e pergunta ao CRM quem já existe (amarelo na prévia). */
  async function avancar() {
    setAvancou(true);
    const telefones = (leitura?.validas ?? []).map((x) => x.telefone).filter((x): x is string => !!x);
    if (telefones.length === 0) return;
    try {
      const r = await fetch("/api/v1/contacts/existentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefones }),
      });
      const j = (await r.json().catch(() => null)) as { data?: { existentes: string[] } } | null;
      setNoCrm(new Set(j?.data?.existentes ?? []));
    } catch {
      setNoCrm(new Set());
    }
  }

  // Variáveis que a planilha cria (as personalizadas que ainda não existem).
  const novas = destinos.flatMap((d, i) => {
    if (!d.startsWith("var:")) return [];
    const key = d.slice(4);
    if (existentes.includes(key) || NOMES_RESERVADOS.has(key) || campoDoCatalogo(key)) return [];
    return [{ key, label: (cabecalho[i] ?? key).slice(0, 80) || key, type: "texto" as const }];
  });

  async function importar() {
    if (!leitura || !arquivo) return;
    setEnviando(true);
    setErroDoEnvio(null);
    const form = new FormData();
    form.append(
      "dados",
      JSON.stringify({
        linhas: leitura.validas,
        politica,
        criar_cards: criarCards && funil ? { pipeline_id: funil, stage_id: etapa || null } : null,
        novas_variaveis: [...new Map(novas.map((n) => [n.key, n])).values()],
        mapeamento: Object.fromEntries(cabecalho.map((c, i) => [c, destinos[i] ?? "ignorar"])),
        nome_do_arquivo: arquivo.name.slice(0, 200),
      }),
    );
    form.append("arquivo", arquivo);
    try {
      const rota = destino === "contatos" ? "/api/v1/contacts/import/mapeado" : "/api/v1/campaigns/audiences/import";
      const res = await fetch(rota, { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { data?: ResumoDaLista; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) {
        setErroDoEnvio(json?.error?.message ?? t("Não foi possível importar a lista."));
        return;
      }
      if (destino === "contatos") setConcluida(json.data);
      onImportada?.(json.data);
      setTabela(null);
      setArquivo(null);
    } catch {
      setErroDoEnvio(t("Não foi possível importar a lista."));
    } finally {
      setEnviando(false);
    }
  }

  if (destino === "contatos" && concluida) {
    const r = concluida;
    return (
      <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="lista-importada">
        <p className="font-medium">{t("Planilha importada")}</p>
        <p className="text-muted-foreground">
          {r.criados} {t("criados")} · {r.atualizados} {t("atualizados")} · {r.mantidos} {t("mantidos")} · {r.pulados}{" "}
          {t("pulados")} · {r.invalidos} {t("inválidos")}
          {r.cards > 0 ? ` · ${r.cards} ${t("cards no funil")}` : ""}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setConcluida(null)}>
          {t("Importar outra planilha")}
        </Button>
      </div>
    );
  }

  if (importada) {
    const r = importada.resumo;
    return (
      <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="lista-importada">
        <p className="font-medium">{t("Lista importada")}</p>
        {r ? (
          <p className="text-muted-foreground">
            {r.criados + r.atualizados + r.mantidos} {t("contatos na lista")} · {r.criados} {t("criados")} ·{" "}
            {r.atualizados} {t("atualizados")} · {r.mantidos} {t("mantidos")} · {r.pulados} {t("pulados")} ·{" "}
            {r.invalidos} {t("inválidos")}
            {r.cards > 0 ? ` · ${r.cards} ${t("cards no funil")}` : ""}
          </p>
        ) : (
          <p className="text-muted-foreground">{t("Use “Ver quantas pessoas” para conferir quem recebe.")}</p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => onTrocar?.()}>
          {t("Trocar lista")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="arquivo-da-lista" className="block">
          {t("Planilha (CSV ou XLSX, até 5.000 linhas)")}
        </Label>
        <input
          id="arquivo-da-lista"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full text-sm"
          onChange={(e) => void escolher(e.target.files?.[0] ?? null)}
        />
        {erro && <p className="text-sm text-destructive">{t(ERRO_DE_LEITURA[erro])}</p>}
        <a
          href="/api/v1/campaigns/import-template"
          download="modelo-importacao-contatos.xlsx"
          className="inline-block text-xs text-accent-500 underline"
          data-testid="baixar-modelo"
        >
          {t("Baixar modelo de planilha")}
        </a>
      </div>

      {tabela && leitura && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("O que cada coluna é")}</p>
            {reconhecidas.length > 0 && (
              <div className="space-y-1 rounded-md border border-border p-2" data-testid="colunas-do-modelo">
                <p className="text-xs font-medium text-success-fg">
                  ✅ {reconhecidas.length} {t("de")} {COLUNAS_DO_MODELO.length} {t("colunas do modelo reconhecidas — mapeadas sozinhas")}
                </p>
                <ul className="flex flex-wrap gap-1.5 text-xs">
                  {reconhecidas.map((c) => (
                    <li key={c} className="rounded-md bg-surface-elevated px-1.5 py-0.5" data-testid={`modelo-${c.trim().toLowerCase()}`}>
                      ✅ <span className="font-mono">{c}</span> → {t(COLUNAS_DO_MODELO.find((x) => x.coluna === c.trim().toLowerCase())!.rotulo)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cabecalho.some((c) => destinoDoModelo(c) === null) && reconhecidas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                ⚠️ {t("Colunas fora do modelo — crie como variável personalizada ou ignore:")}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {cabecalho.map((c, i) => destinoDoModelo(c) !== null ? null : (
                <div key={`${c}-${i}`} className="space-y-1">
                  <Label htmlFor={`col-${i}`} className="block truncate text-xs text-muted-foreground">
                    {c || `${t("Coluna")} ${i + 1}`}
                  </Label>
                  <select
                    id={`col-${i}`}
                    className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                    value={destinos[i] ?? "ignorar"}
                    onChange={(e) =>
                      setDestinos((d) => d.map((x, j) => (j === i ? (e.target.value as DestinoDaColuna) : x)))
                    }
                  >
                    {DESTINOS_FIXOS.map((d) => (
                      <option key={d.valor} value={d.valor}>
                        {t(d.rotulo)}
                      </option>
                    ))}
                    <optgroup label={t("Campos do contato")}>
                      {DESTINOS_DO_CATALOGO.map((d) => (
                        <option key={d.valor} value={d.valor}>
                          {t(d.rotulo)}
                        </option>
                      ))}
                    </optgroup>
                    {personalizadas.map((p) => (
                      <option key={p.key} value={`var:${p.key}`}>
                        {t("Variável")}: {p.label}
                      </option>
                    ))}
                    {(() => {
                      const sugerida = sugerirDestino(c, existentes);
                      return sugerida.startsWith("var:") && !existentes.includes(sugerida.slice(4)) && !campoDoCatalogo(sugerida.slice(4)) ? (
                        <option value={sugerida}>
                          {t("Nova variável")}: {`{${sugerida.slice(4)}}`}
                        </option>
                      ) : null;
                    })()}
                  </select>
                </div>
              ))}
            </div>
            {!temTelefone && (
              <p className="text-sm text-destructive">{t("Escolha qual coluna é o número do contato.")}</p>
            )}
            {novas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Variáveis novas que serão criadas")}: {novas.map((n) => `{${n.key}}`).join(", ")}
              </p>
            )}
            {!avancou && (
              <Button type="button" variant="outline" disabled={!temTelefone} onClick={() => void avancar()} data-testid="avancar-mapeamento">
                {t("Avançar")}
              </Button>
            )}
          </div>

          {avancou && (
            <>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">{t("Situação")}</th>
                  {cabecalho.map((c, i) => (
                    <th key={i} className="px-2 py-1 text-left">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.slice(0, 10).map((l, i) => {
                  const n = i + 1;
                  const motivo = invalidas.get(n);
                  const tel = telefoneDaLinha.get(n);
                  const doCrm = !!tel && noCrm.has(tel);
                  const amarelo = repetidas.has(n) || doCrm;
                  return (
                  <tr
                    key={i}
                    data-testid={`previa-linha-${n}`}
                    className={motivo ? "bg-destructive/10 text-destructive" : amarelo ? "bg-warning-bg text-warning-fg" : ""}
                  >
                    <td className="px-2 py-1">{n}</td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {motivo ? t(motivo) : repetidas.has(n) ? t("Repetido na planilha") : doCrm ? t("Já é contato do CRM") : "✓"}
                    </td>
                    {cabecalho.map((_, c) => (
                      <td key={c} className="max-w-48 truncate px-2 py-1">
                        {l[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 text-sm" data-testid="resumo-da-planilha">
            <p>
              <strong>{leitura.validas.length}</strong> {t("linhas válidas de")} {dados.length}
            </p>
            {leitura.invalidas.length > 0 && (
              <p className="text-destructive">
                {leitura.invalidas.length} {t("fora da lista")}:{" "}
                {leitura.invalidas
                  .slice(0, 15)
                  .map((x) => `${t("linha")} ${x.linha} — ${t(x.motivo)}${x.valor ? ` (${x.valor})` : ""}`)
                  .join("; ")}
                {leitura.invalidas.length > 15 ? "…" : ""}
              </p>
            )}
            {jaNoCrm > 0 && (
              <p className="text-warning-fg">
                {jaNoCrm} {t("já são contatos do CRM — escolha abaixo o que fazer com eles")}
              </p>
            )}
            {(leitura.vazias ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                {leitura.vazias} {t("linhas vazias ignoradas")}
              </p>
            )}
            {leitura.duplicadas.length > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                {leitura.duplicadas.length} {t("telefones repetidos na planilha — fica só a primeira linha")}
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Se o telefone já for um contato do CRM")}</legend>
            {POLITICAS_DE_DUPLICATA.map((p) => (
              <label key={p} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="politica-de-duplicata"
                  checked={politica === p}
                  onChange={() => setPolitica(p)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{t(ROTULO_DA_POLITICA[p].titulo)}</span>{" "}
                  <span className="text-muted-foreground">— {t(ROTULO_DA_POLITICA[p].dica)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={criarCards} onChange={(e) => setCriarCards(e.target.checked)} />
              {t("Criar também um card no funil para cada contato")}
            </label>
            <p className="text-xs text-muted-foreground">
              {t("O contato é criado sempre — a campanha só envia para contatos. O card é opcional.")}
            </p>
            {criarCards && (
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  aria-label={t("Funil")}
                  className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  value={funil}
                  onChange={(e) => {
                    setFunil(e.target.value);
                    setEtapa("");
                  }}
                >
                  <option value="">{t("Escolha o funil")}</option>
                  {(funis.data ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("Etapa")}
                  className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  value={etapa}
                  onChange={(e) => setEtapa(e.target.value)}
                  disabled={!funil}
                >
                  <option value="">{t("Primeira etapa do funil")}</option>
                  {(etapas.data ?? [])
                    .filter((e) => !e.is_won && !e.is_lost)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {erroDoEnvio && <p className="text-sm text-destructive">{erroDoEnvio}</p>}
          <Button
            type="button"
            disabled={enviando || !temTelefone || leitura.validas.length === 0 || (criarCards && !funil)}
            onClick={() => void importar()}
          >
            {enviando ? t("Importando…") : `${t("Importar")} ${leitura.validas.length} ${t("contatos")}`}
          </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
