"use client";

import type { ReactNode } from "react";

import type { FlowNode } from "@/lib/followup/graph-schema";
import type { ItemDaMensagem } from "@/lib/followup/blocos-do-fluxo";
import { EVENTOS_DO_PIXEL_NA_TELA } from "@/lib/followup/vocabulario";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { useEtapasDoFluxo } from "@/app/app/ai/followups/[id]/_components/EtapasDoFluxo";
import { ROTULO_DO_CAMPO, ROTULO_DO_OPERADOR } from "@/app/app/fluxos/_blocos/CondicionalForm";

import { useCanvasDoFluxo } from "./canvas-do-fluxo";

type ConfigDe<T extends FlowNode["type"]> = Extract<FlowNode, { type: T }>["config"];
type Traduzir = (texto: string) => string;

/** Quantas linhas da Mensagem aparecem antes do "+ N itens" (pedido: 4). */
export const MAX_ITENS_NA_PREVIA = 4;

const UNIDADE_CURTA: Record<string, string> = { segundos: "s", minutos: "min", horas: "h", dias: "dias" };

export function Pilula({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div
      className={cn("truncate rounded-md bg-surface-elevated px-2 py-1 text-xs text-text", className)}
      title={title ?? (typeof children === "string" ? children : undefined)}
    >
      {children}
    </div>
  );
}

/** Uma linha da prévia da Mensagem (imagem 7): ícone + o essencial do item. */
export function linhaDoItem(item: ItemDaMensagem, t: Traduzir): string {
  switch (item.tipo) {
    case "texto":
      return `📝 ${item.texto}`;
    case "intervalo":
      return item.modo === "fixo"
        ? `⏱️ ${t("Delay")}: ${item.segundos}s`
        : `⏱️ ${t("Delay")}: ${item.min_segundos}-${item.max_segundos}s`;
    case "imagem":
      return `🖼️ ${item.legenda || item.midia.nome_arquivo || t("Imagem")}`;
    case "video":
      return `🎥 ${item.legenda || item.midia.nome_arquivo || t("Vídeo")}`;
    case "audio":
      return `🎤 ${item.midia.nome_arquivo || t("Áudio")}`;
    case "arquivo":
      return `📎 ${item.midia.nome_arquivo || t("Arquivo")}`;
    case "sticker":
      return `🏷️ ${t("Figurinha")}`;
    case "contato":
      return `👤 ${item.nome}`;
  }
}

/** As linhas visíveis e quantas ficaram de fora (o "+ N itens"). */
export function itensDaPrevia<T>(itens: readonly T[]): { visiveis: T[]; resto: number } {
  return { visiveis: itens.slice(0, MAX_ITENS_NA_PREVIA), resto: Math.max(0, itens.length - MAX_ITENS_NA_PREVIA) };
}

function valorDaCondicao(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(", ");
  if (valor === undefined || valor === null || valor === "") return "";
  return String(valor);
}

/** O rodapé do cartão (Etiquetas: o que o bloco faz com o cliente). */
export function rodapeDoBloco(tipo: FlowNode["type"], config: FlowNode["config"], t: Traduzir): string | null {
  if (tipo === "etiquetas") {
    const c = config as ConfigDe<"etiquetas">;
    return c.operacao === "remover" ? t("Remover etiquetas") : t("Adicionar etiquetas ao cliente");
  }
  return null;
}

/**
 * O CORPO do cartão de cada bloco (fork jhoow, item 5) — a prévia do Leona.
 * `null` = cartão só com cabeçalho (Fim, Início, e o Distribuidor, cujo corpo
 * SÃO as linhas de saída com a contagem).
 */
export function PreviaDoBloco({ tipo, config }: { tipo: FlowNode["type"]; config: FlowNode["config"] }) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const { nomeDoFunil, nomeDoFluxo } = useCanvasDoFluxo();

  switch (tipo) {
    case "mensagem": {
      const c = config as ConfigDe<"mensagem">;
      const { visiveis, resto } = itensDaPrevia(c.itens);
      return (
        <>
          {visiveis.map((item) => (
            <Pilula key={item.id} className={item.tipo === "texto" ? "line-clamp-2 whitespace-normal break-words" : undefined}>
              {linhaDoItem(item, t)}
            </Pilula>
          ))}
          {resto > 0 && <p className="text-xs text-text-muted">+ {resto} {resto === 1 ? t("item") : t("itens")}</p>}
        </>
      );
    }
    case "etiquetas": {
      const c = config as ConfigDe<"etiquetas">;
      return (
        <div className="flex flex-wrap gap-1">
          {c.etiquetas.map((e) => (
            <span key={e} className="max-w-full truncate rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300" title={e}>
              {e}
            </span>
          ))}
        </div>
      );
    }
    case "kanban": {
      const c = config as ConfigDe<"kanban">;
      const acao = c.acao === "adicionar" ? t("Adicionar card:") : c.acao === "mover" ? t("Mover card:") : t("Remover card:");
      const funil = nomeDoFunil(c.pipeline_id) ?? t("Funil");
      const etapa = "stage_id" in c && c.stage_id ? (nomes.etapa?.(c.stage_id) ?? "").split(" · ")[0] : "";
      return (
        <>
          <p className="text-xs text-text-muted">{acao}</p>
          <Pilula className="bg-violet-400/15 text-violet-200">+ {etapa ? `${funil} / ${etapa}` : funil}</Pilula>
        </>
      );
    }
    case "condicional": {
      const c = config as ConfigDe<"condicional">;
      const { visiveis, resto } = itensDaPrevia(c.condicoes);
      return (
        <>
          <p className="text-xs font-medium text-text-muted">{c.regra === "todas" ? t("SE todas") : t("SE qualquer")}</p>
          {visiveis.map((cond) => {
            const campo = cond.campo.tipo === "campo_custom" ? cond.campo.chave : t(ROTULO_DO_CAMPO[cond.campo.tipo]);
            const valor = valorDaCondicao(cond.valor);
            return <Pilula key={cond.id}>{`${campo} ${t(ROTULO_DO_OPERADOR[cond.operador])}${valor ? ` ${valor}` : ""}`}</Pilula>;
          })}
          {resto > 0 && <p className="text-xs text-text-muted">+ {resto} {t("condições")}</p>}
        </>
      );
    }
    case "aguardar_resposta": {
      const c = config as ConfigDe<"aguardar_resposta">;
      return (
        <>
          <p className="text-xs text-text">{t("Aguardar pela resposta do cliente")}</p>
          <Pilula>
            {c.sem_limite || !c.tempo
              ? t("Sem limite de tempo")
              : `${t("Após")} ${c.tempo.valor} ${t(UNIDADE_CURTA[c.tempo.unidade] ?? c.tempo.unidade)}`}
          </Pilula>
        </>
      );
    }
    case "notificacao": {
      const c = config as ConfigDe<"notificacao">;
      return (
        <>
          <Pilula>{`📞 +${c.ddi} ${c.numero}`}</Pilula>
          <p className="line-clamp-3 break-words text-xs text-text-muted">{c.mensagem}</p>
        </>
      );
    }
    case "conexao_fluxo": {
      const c = config as ConfigDe<"conexao_fluxo">;
      return (
        <>
          <p className="text-xs text-text-muted">{t("Ir para o fluxo:")}</p>
          <Pilula className="bg-red-500/15 text-red-200">{nomeDoFluxo(c.fluxo_id) ?? t("Escolha o fluxo")}</Pilula>
          {c.retornar && <p className="text-[11px] text-text-muted">{t("e volta quando ele terminar")}</p>}
        </>
      );
    }
    case "pixel": {
      const c = config as ConfigDe<"pixel">;
      return (
        <>
          <Pilula>{`🎯 ${t(EVENTOS_DO_PIXEL_NA_TELA[c.evento])}`}</Pilula>
          {c.valor && <Pilula>{`${t("Valor")}: ${c.valor} ${c.moeda}`}</Pilula>}
        </>
      );
    }
    case "intervalo": {
      const c = config as ConfigDe<"intervalo">;
      if (c.modo === "duracao")
        return <Pilula>{`⏳ ${t("Aguardar")} ${c.valor} ${t(UNIDADE_CURTA[c.unidade] ?? c.unidade)}`}</Pilula>;
      if (c.modo === "data") return <Pilula>{`📅 ${t("Até")} ${c.quando}`}</Pilula>;
      return <Pilula>{`🕒 ${c.janelas.length} ${t("janelas de horário")}`}</Pilula>;
    }
    case "bloco_ia": {
      const c = config as ConfigDe<"bloco_ia">;
      return (
        <>
          <Pilula>{`🤖 ${c.provedor} · ${c.modelo}`}</Pilula>
          {c.prompt ? (
            <p className="line-clamp-3 break-words text-xs text-text-muted">{c.prompt}</p>
          ) : (
            <p className="text-xs italic text-text-muted">{t("Sem prompt")}</p>
          )}
        </>
      );
    }
    default:
      return null;
  }
}
