"use client";
/**
 * O formulário de campanha — o MESMO para criar e editar (fork jhoow).
 *
 * ═══ Por que SEÇÕES e não um wizard de cinco passos ═══
 *
 * O PRD recomenda o wizard; a ordem das perguntas aqui é a mesma dele
 * (Informações → Público → Mensagem → Entrega), mas numa página só. Criar uma
 * campanha cria um RASCUNHO, e preparar/testar/iniciar são ações da tela de
 * detalhe, cada uma com sua confirmação. A prévia do público fica ao lado do
 * filtro: o número que o operador precisa ver é "quantas pessoas isto pega".
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePreviaDaAudiencia } from "@/hooks/campanhas/useCampanhas";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import { useAgentesPublicados, useEtapas, useFunis } from "@/hooks/campanhas/useDestinoDaCampanha";
import { ListaDeVariaveis } from "@/components/campanhas/ListaDeVariaveis";
import { CamposDeRitmo } from "@/components/campanhas/CamposDeRitmo";
import { useListaRemota } from "@/app/app/fluxos/_blocos/useListaRemota";

import {
  corpoDaCampanha,
  filtroDoFormulario,
  podeSalvar as valoresSalvaveis,
  temCriterio as valoresComCriterio,
  type ValoresDaCampanha,
} from "./valores";

interface Props {
  titulo: string;
  subtitulo: string;
  inicial: ValoresDaCampanha;
  salvando: boolean;
  rotuloDoSalvar: string;
  onSalvar: (corpo: Record<string, unknown>) => void;
  onCancelar: () => void;
}

export function FormularioDaCampanha({ titulo, subtitulo, inicial, salvando, rotuloDoSalvar, onSalvar, onCancelar }: Props) {
  const t = useT();
  const canais = useChannelSessions();
  const previa = usePreviaDaAudiencia();
  const [v, setV] = useState<ValoresDaCampanha>(inicial);
  const mudar = <K extends keyof ValoresDaCampanha>(campo: K, valor: ValoresDaCampanha[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));
  const {
    nome, canal, baseLegal, liaRef, comAlgumaTag, semTags, semInteracao, limite, texto,
    extras, funil, etapa, agente,
    funilDoPublico, etapaDoPublico,
  } = v;
  const setNome = (x: string) => mudar("nome", x);
  const setCanal = (x: string) => mudar("canal", x);
  const setBaseLegal = (x: ValoresDaCampanha["baseLegal"]) => mudar("baseLegal", x);
  const setLiaRef = (x: string) => mudar("liaRef", x);
  const setComAlgumaTag = (x: string) => mudar("comAlgumaTag", x);
  const setSemTags = (x: string) => mudar("semTags", x);
  const setSemInteracao = (x: string) => mudar("semInteracao", x);
  const setLimite = (x: string) => mudar("limite", x);
  const setTexto = (x: string | ((atual: string) => string)) =>
    setV((atual) => ({ ...atual, texto: typeof x === "function" ? x(atual.texto) : x }));
  const setExtras = (f: (atual: string[]) => string[]) => setV((atual) => ({ ...atual, extras: f(atual.extras) }));
  const setFunil = (x: string) => mudar("funil", x);
  const setEtapa = (x: string) => mudar("etapa", x);
  const setAgente = (x: string) => mudar("agente", x);
  const setFunilDoPublico = (x: string) => mudar("funilDoPublico", x);
  const setEtapaDoPublico = (x: string) => mudar("etapaDoPublico", x);

  const funis = useFunis();
  const etapas = useEtapas(funil || null);
  const etapasDoPublico = useEtapas(funilDoPublico || null);
  const agentes = useAgentesPublicados();
  // Os fluxos da organização (Fluxos), para o modo "Iniciar um fluxo".
  const { itens: fluxos } = useListaRemota<{ id: string; name: string; status: string }>(
    "/api/v1/ai/followup-flows?surface=fluxo",
  );

  const filtro = filtroDoFormulario(v);
  const temCriterio = valoresComCriterio(v);
  const podeSalvar = valoresSalvaveis(v);

  function salvar() {
    onSalvar(corpoDaCampanha(v));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </header>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">{t("Informações")}</h2>
        <div className="space-y-2">
          <Label htmlFor="nome">{t("Nome da campanha")}</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t("Ex.: Reativação de clientes parados")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="canal">{t("Enviar pelo número")}</Label>
          <select
            id="canal"
            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
          >
            <option value="">{t("Escolha um número")}</option>
            {(canais.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {channelLabel(c, t)}
              </option>
            ))}
          </select>
          {canais.data?.length === 0 && (
            <p className="text-sm text-warning-fg">
              {t("Nenhum número conectado. Conecte um em Conexões antes de criar a campanha.")}
            </p>
          )}
        </div>

        {(canais.data ?? []).length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Falar também por estes números")}</legend>
            <p className="text-sm text-muted-foreground">
              {t(
                "A campanha reveza entre os números marcados, escolhendo a cada envio o que tem mais folga no teto do dia. Quem já conversa com você por um deles recebe por esse mesmo, para não chegar de um número desconhecido.",
              )}
            </p>
            {(canais.data ?? [])
              .filter((c) => c.id !== canal)
              .map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={extras.includes(c.id)}
                    onChange={(e) =>
                      setExtras((atual) =>
                        e.target.checked ? [...atual, c.id] : atual.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {channelLabel(c, t)}
                </label>
              ))}
            {extras.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Atenção: o intervalo e os tetos da CAMPANHA somam todos os números. Para o rodízio aumentar o volume, deixe o ritmo da campanha em branco e cada número usa o dele.",
                )}
              </p>
            )}
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("Base legal do envio")}</legend>
          <p className="text-sm text-muted-foreground">
            {t(
              "Quem recebe pode perguntar por que recebeu, e a resposta precisa existir antes do envio.",
            )}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="base-legal"
              value="consent"
              checked={baseLegal === "consent"}
              onChange={() => setBaseLegal("consent")}
            />
            {t("Consentimento — estas pessoas pediram para receber")}
          </label>
          {baseLegal === "consent" && (
            <p className="pl-6 text-xs text-muted-foreground" data-testid="hint-consentimento">
              {t(
                "Esta opção impede o envio para contatos sem consentimento registrado no perfil. A prévia mostra quantos ficam de fora por isso.",
              )}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="base-legal"
              value="legitimate_interest"
              checked={baseLegal === "legitimate_interest"}
              onChange={() => setBaseLegal("legitimate_interest")}
            />
            {t("Interesse legítimo — com avaliação (LIA) registrada")}
          </label>
          {baseLegal === "legitimate_interest" && (
            <div className="space-y-2">
              <Label htmlFor="lia">{t("Referência da avaliação (LIA)")}</Label>
              <Input
                id="lia"
                value={liaRef}
                onChange={(e) => setLiaRef(e.target.value)}
                placeholder={t("Ex.: LIA-2026-01")}
              />
            </div>
          )}
        </fieldset>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">{t("Público")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Escolha pelo menos um critério — uma lista sem recorte ninguém confere antes de apertar.")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="com-tags">{t("Com alguma destas etiquetas")}</Label>
            <Input
              id="com-tags"
              value={comAlgumaTag}
              onChange={(e) => setComAlgumaTag(e.target.value)}
              placeholder={t("separe por vírgula")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sem-tags">{t("Sem nenhuma destas etiquetas")}</Label>
            <Input
              id="sem-tags"
              value={semTags}
              onChange={(e) => setSemTags(e.target.value)}
              placeholder={t("separe por vírgula")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="silencio">{t("Sem falar com a gente há (dias)")}</Label>
            <Input
              id="silencio"
              type="number"
              min={1}
              value={semInteracao}
              onChange={(e) => setSemInteracao(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pub-funil">{t("Com negócio no funil")}</Label>
            <select
              id="pub-funil"
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={funilDoPublico}
              onChange={(e) => {
                setFunilDoPublico(e.target.value);
                setEtapaDoPublico("");
              }}
            >
              <option value="">{t("Qualquer um")}</option>
              {(funis.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pub-etapa">{t("Na etapa")}</Label>
            <select
              id="pub-etapa"
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={etapaDoPublico}
              onChange={(e) => setEtapaDoPublico(e.target.value)}
              disabled={!funilDoPublico}
            >
              <option value="">{t("Qualquer etapa")}</option>
              {(etapasDoPublico.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="limite">{t("Máximo de contatos nesta campanha")}</Label>
            <Input
              id="limite"
              type="number"
              min={1}
              max={5000}
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!temCriterio || previa.isPending}
            onClick={() =>
              previa.mutate({
                audience_filter: filtro,
                message_body: v.modo === "flow" ? "" : texto,
                base_legal: baseLegal,
              })
            }
          >
            {previa.isPending ? t("Contando…") : t("Ver quantas pessoas")}
          </Button>
          {previa.data && (
            <p className="text-sm">
              <strong>{previa.data.elegiveis}</strong> {t("podem receber")}
              {previa.data.excluidos > 0
                ? ` · ${previa.data.excluidos} ${t("ficam de fora")}`
                : ""}
            </p>
          )}
        </div>
        {previa.data && previa.data.excluidos > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {Object.entries(previa.data.motivos).map(([motivo, quantos]) => (
              <li key={motivo}>
                {quantos} — {t(previa.data!.legenda[motivo] ?? motivo)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">{t("O que enviar")}</h2>
        <fieldset className="flex flex-wrap gap-4" data-testid="modo-da-campanha">
          <legend className="sr-only">{t("O que enviar")}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="modo" checked={v.modo === "text"} onChange={() => mudar("modo", "text")} />
            {t("Texto simples")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="modo" checked={v.modo === "flow"} onChange={() => mudar("modo", "flow")} />
            {t("Iniciar um fluxo")}
          </label>
        </fieldset>
        {v.modo === "flow" ? (
          <div className="space-y-2">
            <Label htmlFor="fluxo">{t("Fluxo")}</Label>
            <select
              id="fluxo"
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={v.fluxo}
              onChange={(e) => mudar("fluxo", e.target.value)}
              data-testid="fluxo-da-campanha"
            >
              <option value="">{t("Escolha um fluxo publicado")}</option>
              {fluxos
                .filter((f) => f.status === "active" || f.id === v.fluxo)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.status === "active" ? f.name : `${f.name} (${t("não publicado")})`}
                  </option>
                ))}
            </select>
            <p className="text-sm text-muted-foreground">
              {t(
                "Cada contato entra no fluxo no Início, no ritmo da campanha. Daí em diante quem conduz é o fluxo — mensagens, esperas e decisões. Quem já está em outro fluxo fica de fora.",
              )}
            </p>
          </div>
        ) : (
          <>
            <Textarea
              rows={6}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t("Escreva como você falaria com uma pessoa só.")}
              aria-label={t("Texto da mensagem")}
            />
            <ListaDeVariaveis onInserir={(token) => setTexto((atual) => `${atual}${token}`)} />
          </>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">{t("Quem responder")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Em branco, tudo segue como hoje: o card nasce no funil do número e quem atende é o agente publicado nele.")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="funil">{t("Vira card no funil")}</Label>
            <select
              id="funil"
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={funil}
              onChange={(e) => {
                setFunil(e.target.value);
                setEtapa("");
              }}
            >
              <option value="">{t("Funil do número (padrão)")}</option>
              {(funis.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="etapa">{t("Na etapa")}</Label>
            <select
              id="etapa"
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="agente">{t("Quem atende a resposta")}</Label>
          <select
            id="agente"
            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            value={agente}
            onChange={(e) => setAgente(e.target.value)}
          >
            <option value="">{t("Agente publicado no número (padrão)")}</option>
            {(agentes.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            {t("Vale só para conversas que nascem desta campanha: quem já falava com você continua com quem o atendia. Quem aborda precisa saber dizer de onde veio o contato — essa resposta tem de estar no material do agente escolhido.")}
          </p>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">{t("Ritmo desta campanha")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Em branco, vale o ritmo do número (Conexões › Proteção de envio). O que você puser aqui só pode deixar mais devagar.",
          )}
        </p>
        <CamposDeRitmo v={v} onChange={(campo, valor) => mudar(campo, valor)} prefixo="ritmo" />
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancelar}>
          {t("Cancelar")}
        </Button>
        <Button disabled={!podeSalvar || salvando} onClick={salvar} data-testid="salvar-campanha">
          {salvando ? t("Salvando…") : rotuloDoSalvar}
        </Button>
      </div>
    </div>
  );
}

