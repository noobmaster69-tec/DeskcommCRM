"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { condicionalConfigSchema, OPERADORES_DA_CONDICAO } from "@/lib/followup/blocos-do-fluxo";
import type { CondicaoDoFluxo } from "@/lib/fluxos/condicao";
import { useT } from "@/hooks/i18n/useT";
import { Plus, Trash } from "@/lib/ui/icons";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { useCamposDaFicha } from "./useCamposDaFicha";

/**
 * Bloco Condicional (fork jhoow, Fase C): saídas "Sim" e "Não". Cada regra
 * compara um campo (etiqueta, dia, hora, data, janela de 24h, status, atendente,
 * nome, número, e-mail, campo da ficha) com um valor; "todas" = E, "qualquer" = OU.
 * Vários valores separados por vírgula valem como "qualquer um deles".
 */
type Config = ConfigOf<"condicional">;
type TipoDoCampo = CondicaoDoFluxo["campo"]["tipo"];
type Operador = (typeof OPERADORES_DA_CONDICAO)[number];

const ROTULO_DO_CAMPO: Record<TipoDoCampo, string> = {
  etiqueta: "Etiqueta",
  dia_semana: "Dia da semana",
  hora: "Hora",
  data: "Data",
  janela_24h: "Janela de 24h",
  status_atendimento: "Status do atendimento",
  atendente: "Atendente",
  nome: "Nome",
  numero: "Número",
  email: "E-mail",
  campo_custom: "Campo da ficha",
};
const ROTULO_DO_OPERADOR: Record<Operador, string> = {
  igual: "é igual a",
  diferente: "é diferente de",
  contem: "contém",
  nao_contem: "não contém",
  maior: "é maior que",
  menor: "é menor que",
  entre: "está entre",
  vazio: "está vazio",
  nao_vazio: "não está vazio",
};
const DICA_DO_CAMPO: Partial<Record<TipoDoCampo, string>> = {
  dia_semana: "segunda, terça… ou 0 (domingo) a 6",
  hora: "HH:MM",
  data: "AAAA-MM-DD",
  janela_24h: "aberta ou fechada",
  status_atendimento: "open, pending, closed",
};

const semValor = (op: Operador) => op === "vazio" || op === "nao_vazio";

function valorEmTexto(v: CondicaoDoFluxo["valor"]): string {
  if (v === undefined) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function valorDoTexto(texto: string): CondicaoDoFluxo["valor"] {
  const partes = texto
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length > 1 ? partes : (partes[0] ?? "");
}

export function CondicionalForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const { campos } = useCamposDaFicha();
  const [regra, setRegra] = useState(config.regra);
  const [condicoes, setCondicoes] = useState<CondicaoDoFluxo[]>(config.condicoes);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(next: { regra: Config["regra"]; condicoes: CondicaoDoFluxo[] }) {
    setRegra(next.regra);
    setCondicoes(next.condicoes);
    const r = condicionalConfigSchema.safeParse(next);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }
  const trocar = (i: number, c: CondicaoDoFluxo) => gravar({ regra, condicoes: condicoes.map((x, k) => (k === i ? c : x)) });
  const novoId = () => {
    let n = condicoes.length + 1;
    while (condicoes.some((c) => c.id === `c${n}`)) n++;
    return `c${n}`;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="condicional-regra">{t("Seguir por Sim quando")}</Label>
        <Select value={regra} onValueChange={(v) => gravar({ regra: v as Config["regra"], condicoes })}>
          <SelectTrigger id="condicional-regra">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">{t("todas as regras valem")}</SelectItem>
            <SelectItem value="qualquer">{t("qualquer regra vale")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ol className="space-y-2" aria-label={t("Regras")}>
        {condicoes.map((c, i) => (
          <li key={c.id} className="space-y-1.5 rounded-md border border-border bg-surface p-2" data-testid="regra-condicional">
            <div className="flex items-center gap-1.5">
              <Select
                value={c.campo.tipo}
                onValueChange={(v) =>
                  trocar(i, { ...c, campo: v === "campo_custom" ? { tipo: "campo_custom", chave: campos[0] ?? "campo" } : ({ tipo: v } as CondicaoDoFluxo["campo"]) })
                }
              >
                <SelectTrigger className="flex-1" aria-label={t("Campo")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROTULO_DO_CAMPO) as TipoDoCampo[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(ROTULO_DO_CAMPO[k])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                className="rounded-sm p-1 text-error-fg hover:bg-surface-elevated disabled:opacity-30"
                disabled={condicoes.length === 1}
                aria-label={t("Remover regra")}
                onClick={() => gravar({ regra, condicoes: condicoes.filter((_, k) => k !== i) })}
              >
                <Trash size={12} aria-hidden />
              </button>
            </div>
            {c.campo.tipo === "campo_custom" && (
              <>
                <Input
                  aria-label={t("Nome do campo")}
                  list={`campos-${c.id}`}
                  value={c.campo.chave}
                  maxLength={60}
                  onChange={(e) => trocar(i, { ...c, campo: { tipo: "campo_custom", chave: e.target.value.trim() } })}
                />
                <datalist id={`campos-${c.id}`}>
                  {campos.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </>
            )}
            <Select
              value={c.operador}
              onValueChange={(v) => {
                const operador = v as Operador;
                const { valor, valor_ate, ...resto } = c;
                trocar(i, {
                  ...resto,
                  operador,
                  ...(semValor(operador) ? {} : { valor: valor ?? "" }),
                  ...(operador === "entre" && valor_ate !== undefined ? { valor_ate } : {}),
                });
              }}
            >
              <SelectTrigger aria-label={t("Operador")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERADORES_DA_CONDICAO.map((op) => (
                  <SelectItem key={op} value={op}>
                    {t(ROTULO_DO_OPERADOR[op])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!semValor(c.operador) && (
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label={t("Valor")}
                  placeholder={DICA_DO_CAMPO[c.campo.tipo] ? t(DICA_DO_CAMPO[c.campo.tipo]!) : t("valor ou {campo}")}
                  value={valorEmTexto(c.valor)}
                  onChange={(e) => trocar(i, { ...c, valor: valorDoTexto(e.target.value) })}
                />
                {c.operador === "entre" && (
                  <>
                    <span className="text-xs text-text-muted">{t("e")}</span>
                    <Input
                      aria-label={t("Até")}
                      value={c.valor_ate === undefined ? "" : String(c.valor_ate)}
                      onChange={(e) => trocar(i, { ...c, valor_ate: e.target.value })}
                    />
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={condicoes.length >= 20}
        onClick={() =>
          gravar({ regra, condicoes: [...condicoes, { id: novoId(), campo: { tipo: "etiqueta" }, operador: "contem", valor: "" }] })
        }
      >
        <Plus size={12} className="mr-1" aria-hidden />
        {t("Adicionar regra")}
      </Button>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
