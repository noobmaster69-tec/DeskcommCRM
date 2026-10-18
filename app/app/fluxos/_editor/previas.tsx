"use client";

import type { ReactNode } from "react";
import {
  Contact,
  File,
  Image as ImageIcon,
  Mic,
  Sticker,
  Tag,
  Text,
  Timer,
  Video,
  type LucideIcon,
} from "lucide-react";

import type { FlowNode } from "@/lib/followup/graph-schema";
import { DIGITANDO_PADRAO, temDigitando, type ItemDaMensagem } from "@/lib/followup/blocos-do-fluxo";
import { EVENTOS_DO_PIXEL_NA_TELA } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import { useEtapasDoFluxo } from "@/app/app/ai/followups/[id]/_components/EtapasDoFluxo";
import { ROTULO_DO_CAMPO, ROTULO_DO_OPERADOR } from "@/app/app/fluxos/_blocos/CondicionalForm";

import { useCanvasDoFluxo } from "./canvas-do-fluxo";

type ConfigDe<T extends FlowNode["type"]> = Extract<FlowNode, { type: T }>["config"];
type Traduzir = (texto: string) => string;

/** Quantas linhas da Mensagem aparecem antes do "+ N itens" (pedido: 4). */
export const MAX_ITENS_NA_PREVIA = 4;

const UNIDADE_CURTA: Record<string, string> = { segundos: "s", minutos: "min", horas: "h", dias: "dias" };

/** `{variavel}` — o que o motor interpola. */
const VARIAVEL = /(\{[^{}\s]+\})/g;

/** Texto com as variáveis destacadas (Geist Mono, --c-light). */
export function ComVariaveis({ texto }: { texto: string }) {
  const partes = texto.split(VARIAVEL);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="fx-var">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Linha de texto: ícone 14px + até 2 linhas com reticências. */
export function LinhaDeTexto({ texto, icone: Icone = Text }: { texto: string; icone?: LucideIcon }) {
  return (
    <div className="fx-row" title={texto}>
      <Icone size={14} aria-hidden />
      <p className="fx-row__text">
        <ComVariaveis texto={texto} />
      </p>
    </div>
  );
}

/** Rótulo em caixa alta + valor (Notificação, Kanban, Conexão…). */
export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="fx-row fx-field">
      <span className="fx-field__label">{rotulo}</span>
      <span className="fx-field__value">{children}</span>
    </div>
  );
}

/** Linha sem caixa, 12px, com relógio (delay/meta). */
export function Meta({ children, icone: Icone = Timer }: { children: ReactNode; icone?: LucideIcon }) {
  return (
    <p className="fx-meta">
      <Icone size={13} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

const MIDIA: Record<string, { Icone: LucideIcon; rotulo: string }> = {
  imagem: { Icone: ImageIcon, rotulo: "Imagem" },
  video: { Icone: Video, rotulo: "Vídeo" },
  audio: { Icone: Mic, rotulo: "Áudio" },
  arquivo: { Icone: File, rotulo: "Arquivo" },
  sticker: { Icone: Sticker, rotulo: "Figurinha" },
};

function LinhaDeMidia({ item, t }: { item: Extract<ItemDaMensagem, { midia: unknown }>; t: Traduzir }) {
  const { Icone, rotulo } = MIDIA[item.tipo]!;
  const nome = ("legenda" in item && item.legenda) || item.midia.nome_arquivo || t(rotulo);
  const miniatura = item.tipo === "imagem" && item.midia.url ? item.midia.url : null;
  return (
    <div className="fx-row fx-media" title={nome}>
      <span className="fx-media__thumb">
        {miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element -- link externo do usuário, sem otimização do Next
          <img src={miniatura} alt="" loading="lazy" />
        ) : (
          <Icone size={16} aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="fx-media__name block">{nome}</span>
        <span className="fx-media__type block">{t(rotulo)}</span>
      </span>
    </div>
  );
}

/** O texto de um item da Mensagem, sem ícone (busca, título, testes). */
export function linhaDoItem(item: ItemDaMensagem, t: Traduzir): string {
  switch (item.tipo) {
    case "texto":
      return item.texto;
    case "intervalo":
      return item.modo === "fixo"
        ? `${t("Pausa")} ${item.segundos} s`
        : `${t("Pausa")} ${item.min_segundos}–${item.max_segundos} s`;
    case "contato":
      return item.nome;
    default:
      return ("legenda" in item && item.legenda) || item.midia.nome_arquivo || t(MIDIA[item.tipo]!.rotulo);
  }
}

/** "Digitando 6–15 s": do menor ao maior "digitando" dos itens da Mensagem. */
export function faixaDoDigitando(itens: readonly ItemDaMensagem[]): string | null {
  const comDigitando = itens.filter(temDigitando);
  if (comDigitando.length === 0) return null;
  const minimos = comDigitando.map((i) => i.typing_delay_seconds ?? DIGITANDO_PADRAO[i.tipo]);
  const maximos = comDigitando.map((i, k) => Math.max(minimos[k]!, i.typing_delay_random_max ?? minimos[k]!));
  const de = Math.min(...minimos);
  const ate = Math.max(...maximos);
  return de === ate ? `${de} s` : `${de}–${ate} s`;
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

/** O que o bloco Etiquetas faz com o cliente (rótulo do campo do cartão). */
export function rodapeDoBloco(tipo: FlowNode["type"], config: FlowNode["config"], t: Traduzir): string | null {
  if (tipo === "etiquetas") {
    const c = config as ConfigDe<"etiquetas">;
    return c.operacao === "remover" ? t("Remover etiquetas") : t("Adicionar etiquetas ao cliente");
  }
  return null;
}

/**
 * O CORPO do cartão de cada bloco. `null` = cartão só com cabeçalho (Fim,
 * Início, e o Distribuidor, cujo corpo SÃO as linhas de saída).
 * Nenhum emoji: ícone lucide em linha tingida, variáveis destacadas.
 */
export function PreviaDoBloco({ tipo, config }: { tipo: FlowNode["type"]; config: FlowNode["config"] }) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const { nomeDoFunil, nomeDoFluxo } = useCanvasDoFluxo();

  switch (tipo) {
    case "mensagem": {
      const c = config as ConfigDe<"mensagem">;
      const { visiveis, resto } = itensDaPrevia(c.itens);
      const digitando = faixaDoDigitando(c.itens);
      return (
        <>
          {visiveis.map((item) => {
            if (item.tipo === "texto") return <LinhaDeTexto key={item.id} texto={item.texto} />;
            if (item.tipo === "intervalo") return <Meta key={item.id}>{linhaDoItem(item, t)}</Meta>;
            if (item.tipo === "contato")
              return (
                <div key={item.id} className="fx-row fx-media">
                  <span className="fx-media__thumb">
                    <Contact size={16} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="fx-media__name block">{item.nome}</span>
                    <span className="fx-media__type block">{item.telefone}</span>
                  </span>
                </div>
              );
            return <LinhaDeMidia key={item.id} item={item} t={t} />;
          })}
          {resto > 0 && <p className="fx-meta">+ {resto} {resto === 1 ? t("item") : t("itens")}</p>}
          {digitando && <Meta>{`${t("Digitando")} ${digitando}`}</Meta>}
        </>
      );
    }
    case "etiquetas": {
      const c = config as ConfigDe<"etiquetas">;
      return (
        <div className="fx-row fx-field">
          <span className="fx-field__label">
            {c.operacao === "remover" ? t("Remover do contato") : t("Adicionar ao contato")}
          </span>
          <div className="fx-chips mt-1">
            {c.etiquetas.map((e) => (
              <span key={e} className="fx-chip" title={e}>
                <Tag size={11} aria-hidden />
                {e}
              </span>
            ))}
          </div>
        </div>
      );
    }
    case "kanban": {
      const c = config as ConfigDe<"kanban">;
      const acao = c.acao === "adicionar" ? t("Adicionar card") : c.acao === "mover" ? t("Mover card") : t("Remover card");
      const funil = nomeDoFunil(c.pipeline_id) ?? t("Funil");
      const etapa = "stage_id" in c && c.stage_id ? (nomes.etapa?.(c.stage_id) ?? "").split(" · ")[0] : "";
      return <Campo rotulo={acao}>{etapa ? `${funil} · ${etapa}` : funil}</Campo>;
    }
    case "condicional": {
      const c = config as ConfigDe<"condicional">;
      const { visiveis, resto } = itensDaPrevia(c.condicoes);
      return (
        <>
          <p className="fx-field__label px-0.5">{c.regra === "todas" ? t("SE todas") : t("SE qualquer")}</p>
          {visiveis.map((cond) => {
            const campo = cond.campo.tipo === "campo_custom" ? cond.campo.chave : t(ROTULO_DO_CAMPO[cond.campo.tipo]);
            const valor = valorDaCondicao(cond.valor);
            return (
              <LinhaDeTexto key={cond.id} texto={`${campo} ${t(ROTULO_DO_OPERADOR[cond.operador])}${valor ? ` ${valor}` : ""}`} />
            );
          })}
          {resto > 0 && <p className="fx-meta">+ {resto} {t("condições")}</p>}
        </>
      );
    }
    case "aguardar_resposta": {
      const c = config as ConfigDe<"aguardar_resposta">;
      return (
        <>
          <LinhaDeTexto texto={t("Aguardar pela resposta do cliente")} />
          <Meta>
            {c.sem_limite || !c.tempo
              ? t("Sem limite de tempo")
              : `${t("Após")} ${c.tempo.valor} ${t(UNIDADE_CURTA[c.tempo.unidade] ?? c.tempo.unidade)}`}
          </Meta>
        </>
      );
    }
    case "notificacao": {
      const c = config as ConfigDe<"notificacao">;
      return (
        <>
          <Campo rotulo={t("Notificar")}>{`+${c.ddi} ${c.numero}`}</Campo>
          {c.mensagem && <LinhaDeTexto texto={c.mensagem} />}
        </>
      );
    }
    case "conexao_fluxo": {
      const c = config as ConfigDe<"conexao_fluxo">;
      return (
        <>
          <Campo rotulo={t("Ir para o fluxo")}>{nomeDoFluxo(c.fluxo_id) ?? t("Escolha o fluxo")}</Campo>
          {c.retornar && <Meta>{t("e volta quando ele terminar")}</Meta>}
        </>
      );
    }
    case "pixel": {
      const c = config as ConfigDe<"pixel">;
      return (
        <>
          <Campo rotulo={t("Evento")}>{t(EVENTOS_DO_PIXEL_NA_TELA[c.evento])}</Campo>
          {c.valor && <Campo rotulo={t("Valor")}>{`${c.valor} ${c.moeda}`}</Campo>}
        </>
      );
    }
    case "intervalo": {
      const c = config as ConfigDe<"intervalo">;
      if (c.modo === "duracao")
        return <Campo rotulo={t("Aguardar")}>{`${c.valor} ${t(UNIDADE_CURTA[c.unidade] ?? c.unidade)}`}</Campo>;
      if (c.modo === "data") return <Campo rotulo={t("Até")}>{c.quando}</Campo>;
      return <Campo rotulo={t("Horários")}>{`${c.janelas.length} ${t("janelas de horário")}`}</Campo>;
    }
    case "bloco_ia": {
      const c = config as ConfigDe<"bloco_ia">;
      return (
        <>
          <Campo rotulo={t("Modelo")}>{`${c.provedor} · ${c.modelo}`}</Campo>
          {c.prompt ? <LinhaDeTexto texto={c.prompt} /> : <Meta>{t("Sem prompt")}</Meta>}
        </>
      );
    }
    default:
      return null;
  }
}
