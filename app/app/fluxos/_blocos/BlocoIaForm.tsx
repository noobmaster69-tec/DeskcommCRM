"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { blocoIaConfigSchema, PROVEDORES_DO_BLOCO_DE_IA } from "@/lib/followup/blocos-do-fluxo";
import { PROVEDORES_DO_BLOCO_DE_IA_NA_TELA } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { CampoDeTexto } from "./CampoDeTexto";
import { useCamposDaFicha } from "./useCamposDaFicha";
import { useListaRemota } from "./useListaRemota";

/**
 * Bloco de IA (fork jhoow, Fase D). A chave nunca entra no grafo: o bloco usa
 * uma credencial de IA › Credenciais (ou a ativa do provedor). Cada
 * "saída da IA" vira uma saída do bloco, que a IA escolhe ao responder.
 */
type Config = ConfigOf<"bloco_ia">;
type Provedor = (typeof PROVEDORES_DO_BLOCO_DE_IA)[number];

const ATIVA = "__ativa__";

interface Credencial {
  id: string;
  provider: string;
  label: string;
  is_active: boolean;
  validated_at: string | null;
}

function proximoId(existentes: readonly { id: string }[]): string {
  for (let i = 1; ; i++) if (!existentes.some((c) => c.id === `r${i}`)) return `r${i}`;
}

export function BlocoIaForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const t = useT();
  const { variaveis } = useCamposDaFicha();
  const { itens: credenciais } = useListaRemota<Credencial>("/api/v1/ai/credentials");
  const [c, setC] = useState<Config>(config);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(patch: Partial<Config>) {
    const next: Config = { ...c, ...patch };
    if (!next.credencial_id) delete next.credencial_id;
    setC(next);
    const r = blocoIaConfigSchema.safeParse(next);
    if (!r.success) {
      setErro(r.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(r.data);
  }

  const doProvedor = credenciais.filter((k) => k.provider === c.provedor && k.is_active && k.validated_at);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ia-provedor">{t("Provedor")}</Label>
        <Select value={c.provedor} onValueChange={(v) => gravar({ provedor: v as Provedor, credencial_id: undefined })}>
          <SelectTrigger id="ia-provedor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVEDORES_DO_BLOCO_DE_IA.map((p) => (
              <SelectItem key={p} value={p}>
                {PROVEDORES_DO_BLOCO_DE_IA_NA_TELA[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ia-credencial">{t("Chave")}</Label>
        <Select value={c.credencial_id ?? ATIVA} onValueChange={(v) => gravar({ credencial_id: v === ATIVA ? undefined : v })}>
          <SelectTrigger id="ia-credencial">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ATIVA}>{t("A chave ativa do provedor")}</SelectItem>
            {doProvedor.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {doProvedor.length === 0 && (
          <p className="text-xs text-text-muted">
            {t("Nenhuma chave deste provedor cadastrada. Cadastre em")}{" "}
            <Link href="/app/ai/credentials" className="text-link underline" target="_blank">
              {t("IA › Credenciais")}
            </Link>
            {t("; sem chave, o bloco segue pela saída \"Falhou\".")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ia-modelo">{t("Modelo")}</Label>
        <Input id="ia-modelo" value={c.modelo} maxLength={120} onChange={(e) => gravar({ modelo: e.target.value.trim() })} />
      </div>

      <div className="space-y-2">
        <Label>{t("Instruções")}</Label>
        <CampoDeTexto
          rotulo={t("Instruções")}
          valor={c.prompt}
          onChange={(prompt) => gravar({ prompt })}
          variaveis={variaveis}
          placeholder={t("Você atende a loja… Responda em uma frase.")}
          linhas={5}
          comFormatacao={false}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("Mensagem enviada à IA")}</Label>
        <CampoDeTexto
          rotulo={t("Mensagem enviada à IA")}
          valor={c.mensagem}
          onChange={(mensagem) => gravar({ mensagem })}
          variaveis={variaveis}
          linhas={2}
          comFormatacao={false}
        />
        <p className="text-xs text-text-muted">{t("Normalmente a última mensagem do lead: {ultima_mensagem}.")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ia-salvar">{t("Salvar a resposta no campo")}</Label>
        <Input id="ia-salvar" value={c.salvar_em} maxLength={60} onChange={(e) => gravar({ salvar_em: e.target.value.trim() })} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="ia-enviar">{t("Enviar a resposta ao lead")}</Label>
        <Switch id="ia-enviar" checked={c.enviar_resposta} onCheckedChange={(v) => gravar({ enviar_resposta: v })} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ia-contexto">{t("Levar a conversa recente")}</Label>
          <Switch
            id="ia-contexto"
            checked={c.contexto.ativo}
            onCheckedChange={(v) => gravar({ contexto: { ...c.contexto, ativo: v } })}
          />
        </div>
        {c.contexto.ativo && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={20}
              className="w-20"
              aria-label={t("Quantas mensagens")}
              value={c.contexto.interacoes}
              onChange={(e) =>
                gravar({ contexto: { ...c.contexto, interacoes: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) } })
              }
            />
            <span className="text-xs text-text-muted">{t("últimas mensagens")}</span>
          </div>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("Entender a mídia da última mensagem")}</legend>
        {(
          [
            ["imagem", t("Imagem")],
            ["pdf", "PDF"],
            ["audio", t("Áudio (pela transcrição)")],
          ] as const
        ).map(([k, rotulo]) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <Label htmlFor={`ia-entender-${k}`}>{rotulo}</Label>
            <Switch
              id={`ia-entender-${k}`}
              checked={c.entender[k]}
              onCheckedChange={(v) => gravar({ entender: { ...c.entender, [k]: v } })}
            />
          </div>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label>{t("Saídas da IA")}</Label>
        <p className="text-xs text-text-muted">
          {t("A IA escolhe por qual saída o contato segue. Sem nenhuma, o bloco tem uma saída só.")}
        </p>
        <ol className="space-y-2" aria-label={t("Saídas da IA")}>
          {c.condicionais.map((cond, i) => (
            <li key={cond.id} className="space-y-1.5 rounded-md border border-border bg-surface p-2" data-testid="saida-da-ia">
              <div className="flex gap-2">
                <Input
                  aria-label={`${t("Nome da saída")} ${i + 1}`}
                  value={cond.nome}
                  maxLength={60}
                  onChange={(e) =>
                    gravar({ condicionais: c.condicionais.map((x) => (x.id === cond.id ? { ...x, nome: e.target.value } : x)) })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("Remover saída")}
                  onClick={() => gravar({ condicionais: c.condicionais.filter((x) => x.id !== cond.id) })}
                >
                  ×
                </Button>
              </div>
              <Textarea
                aria-label={`${t("Quando seguir por esta saída")} ${i + 1}`}
                rows={2}
                maxLength={500}
                placeholder={t("Ex.: o cliente pergunta o preço ou quer pagar.")}
                value={cond.descricao}
                onChange={(e) =>
                  gravar({ condicionais: c.condicionais.map((x) => (x.id === cond.id ? { ...x, descricao: e.target.value } : x)) })
                }
              />
            </li>
          ))}
        </ol>
        {c.condicionais.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              gravar({
                condicionais: [
                  ...c.condicionais,
                  { id: proximoId(c.condicionais), nome: `${t("Saída")} ${c.condicionais.length + 1}`, descricao: t("Descreva quando seguir por aqui.") },
                ],
              })
            }
          >
            {t("Adicionar saída")}
          </Button>
        )}
      </div>

      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
