"use client";
import { Draggable } from "@hello-pangea/dnd";
import type { MouseEvent } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useChatsFlutuantes } from "@/hooks/chat-flutuante/ChatsFlutuantesProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { estiloDasIniciais, initials, relativeTime } from "@/lib/contacts/apresentacao-na-lista";
import { phoneForDisplay, samePhone } from "@/lib/channels/phone-variants";
import { cn } from "@/lib/utils";
import { formatValorDoNegocio, MOEDA_PADRAO } from "@/lib/money";
import type { Lead } from "@/lib/types/leads";
import { resolveCardState, type CardInput } from "@/lib/kanban/card-state";
import { KanbanCardActions } from "./KanbanCardActions";
import { NextActionSlot } from "./NextActionSlot";
import { ReactivationSlot } from "./ReactivationSlot";

/** Os dois gestos de seleção que o card sabe relatar. */
export type GestoDeSelecao = "alterna" | "intervalo";

interface KanbanCardProps {
  /** O que o card mostra — explicitamente NÃO é a linha do banco. */
  card: CardInput;
  /** A linha do lead, só para o menu de ações (que muta o lead). */
  lead: Lead;
  index: number;
  pipelineId: string;
  isSelected?: boolean;
  /**
   * Há seleção viva no quadro. Só muda a VISIBILIDADE da caixa (que fora disso
   * aparece no hover/foco): quando o usuário já está selecionando, esconder as
   * caixas dos outros cards transforma "clicar em mais um" numa caça ao pixel.
   */
  isSelecting?: boolean;
  /**
   * Contador de pulsos deste card (evento REMOTO). Muda a cada evento novo — é
   * a MUDANÇA que remonta o overlay e reinicia a animação; um booleano deixaria
   * o segundo evento dentro da janela passar despercebido.
   */
  pulseCount?: number;
  /**
   * `alterna` = um card entra/sai da seleção. `intervalo` = daqui até a âncora
   * (shift). Quem resolve o intervalo é a COLUNA, que é a única que conhece a
   * ordem visível dos cards — o card só relata o gesto.
   */
  onSelect?: (leadId: string, gesto: GestoDeSelecao) => void;
  /** Abrir o dossiê. Separado de `onSelect`: são gestos e intenções diferentes. */
  onOpen?: (leadId: string) => void;
}

/** "Maria Silva" e " maria silva " são o mesmo nome — não se repete na linha. */
function mesmoNome(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

function formatValor(cents: number | null, currency: string | null): string | null {
  // A régua do negócio (×100 em qualquer moeda) e o locale da moeda moram em
  // `formatValorDoNegocio` — a mesma função do total da coluna, para o card e o
  // topo da coluna nunca escreverem o mesmo dinheiro de dois jeitos.
  if (cents == null) return null;
  return formatValorDoNegocio(cents, currency ?? MOEDA_PADRAO, { semCentavos: true });
}

/**
 * O card do Kanban, compacto no estilo Leona (~80px): avatar à esquerda; nome
 * e hora; telefone, valor e não lidas; a última mensagem em 2 linhas.
 *
 * Pedido do dono do produto (fork jhoow): o card denso de conversa venceu o
 * card de 5 faixas. Saíram dono, tempo na etapa, e-mail/links, score e o
 * atalho "Abrir no Inbox" — o clique no card já abre o chat. As alturas
 * continuam RESERVADAS (a prévia ocupa sempre 2 linhas), então o quadro segue
 * alinhado. A única faixa extra é a proposta do agente, que pede decisão.
 *
 * Cor do estado só na borda esquerda, e só quando o estado pede (Lei C).
 */
export function KanbanCard({
  card,
  lead,
  index,
  pipelineId,
  isSelected,
  isSelecting = false,
  pulseCount = 0,
  onSelect,
  onOpen,
}: KanbanCardProps) {
  const t = useT();
  const value = formatValor(card.valueCents, card.currency);
  const state = resolveCardState(card, t);
  const localeDaData = useLocaleDeData();
  const chats = useChatsFlutuantes();

  // A identidade estilo Kommo: foto, o nome que a pessoa pôs no WhatsApp e a
  // última mensagem. Tudo derivado do que o quadro já carrega (`withConversas`
  // e `withMarcadoresDoContato` na rota do board) — nenhuma leitura nova.
  const nomeDoWhatsapp = lead.contact_whatsapp_name ?? null;
  const telefone = lead.contact_phone ? phoneForDisplay(lead.contact_phone) : null;
  // Contato sem nome no WhatsApp ganha o próprio número como título do
  // negócio. Aí o número É o nome: vai para cima e não se repete embaixo.
  const tituloEhOTelefone = Boolean(
    lead.contact_phone && card.title.trim() && samePhone(card.title, lead.contact_phone),
  );
  const nome =
    nomeDoWhatsapp ||
    (tituloEhOTelefone ? telefone : card.title.trim()) ||
    telefone ||
    t("Sem nome");
  const telefoneEmbaixo = nome === telefone ? null : telefone;
  const previa = lead.conversa?.preview?.trim() || null;
  const hora = relativeTime(lead.conversa?.last_message_at ?? null, localeDaData);
  const naoLidas = lead.conversa?.unread ?? 0;
  // Sem conversa (negócio criado à mão), a linha de baixo é o título do
  // negócio — quando ele diz algo além do nome que já está em cima.
  const linhaDeBaixo =
    previa ?? (nomeDoWhatsapp && !mesmoNome(nomeDoWhatsapp, card.title) ? card.title : "");

  // Clique ABRE o dossiê; ctrl/cmd+clique SELECIONA; shift+clique estende até a
  // âncora. "Clicar abre" é a convenção mais forte, e seleção múltipla é recurso
  // de poder, que tolera modificador. O arrasto continua funcionando porque o
  // dnd distingue clique de arrasto por movimento, não por handler.
  //
  // A CAIXA abaixo existe porque modificador não se descobre: até ela, a única
  // porta para o lote era saber que ctrl+clique fazia algo — e um recurso que
  // só quem já sabe encontra não é recurso, é folclore.
  //
  // ⚠️ UMA função, dois pontos de entrada — e a duplicação que existia aqui
  // custou o recurso inteiro no alvo mais óbvio. O TÍTULO é um `<button>` com
  // `stopPropagation()` (ver abaixo), então o clique nele NUNCA chega a este
  // handler; e o `onClick` do título ignorava os modificadores e abria o dossiê
  // sempre. Medido pela tela em 2026-09-04, com 6 cards e a âncora no 2º:
  //
  //   shift+clique no TÍTULO do 5º  → 1 marcado, 1 diálogo aberto (o dossiê)
  //   shift+clique no CORPO  do 5º  → 4 marcados, 0 diálogos
  //
  // O título é o maior e mais natural alvo do card. Quem lê "Segurando Shift,
  // um clique seleciona tudo entre o card anterior e o que você clicou" e clica
  // no card clica no nome dele — e recebia o dossiê.
  const decidirClique = (e: {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }): void => {
    if (e.shiftKey) {
      onSelect?.(card.id, "intervalo");
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      onSelect?.(card.id, "alterna");
      return;
    }
    // Com conversa, o clique abre o CHAT flutuante (pedido do dono do produto);
    // o dossiê passa para o "Ver negócio" do menu ⋮ e do cabeçalho do chat.
    // Sem conversa (negócio criado à mão) ou fora do provedor, segue o dossiê.
    if (chats && lead.conversa) {
      chats.abrirChat(lead.conversa.id, { leadId: lead.id, pipelineId });
      return;
    }
    onOpen?.(card.id);
  };
  const handleClick = (e: MouseEvent<HTMLDivElement>) => decidirClique(e);

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          // O dnd marca o handle como role="button"; com o menu de ações dentro,
          // isso vira nested-interactive no axe. "group" mantém o foco e o
          // teclado do dnd (tabIndex e handlers continuam vindo do spread) sem
          // aninhar dois controles — nada de aria-hidden nem de suprimir regra.
          role="group"
          aria-label={`${t("Lead")}: ${card.title}`}
          onClick={handleClick}
          // Tags saem do card (Lei A): ficam a um hover, sem ocupar altura.
          title={card.tags.length > 0 ? `Tags: ${card.tags.join(", ")}` : undefined}
          className={cn(
            "group relative overflow-hidden rounded-md border border-border bg-surface",
            "py-2 pl-2.5 pr-1.5 shadow-xs transition-colors",
            "hover:border-border-strong",
            snapshot.isDragging && "rotate-1 shadow-md ring-1 ring-accent/40",
            isSelected && "ring-2 ring-accent",
          )}
        >
          {/* key = contador: cada evento remoto monta um overlay NOVO, e é isso
              que reinicia a animação. Fica no elemento interno — pôr no wrapper
              remontaria o draggable e quebraria o arrasto. */}
          {pulseCount > 0 && (
            <span
              key={pulseCount}
              aria-hidden
              // Observável de propósito: é assim que o teste prova que o
              // overlay REMONTOU (contador novo) em vez de ter sobrado do
              // evento anterior — e "sobrou" era exatamente o defeito.
              data-pulse={pulseCount}
              className="card-pulse pointer-events-none absolute inset-0"
            />
          )}
          {/* Borda de estado — 2px, a única cor do card. */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-0.5",
              state.border === "accent" && "bg-accent",
              state.border === "warning" && "bg-warning",
              state.border === "neutral" && "bg-transparent",
            )}
          />

          {/* A caixa de seleção FLUTUA sobre o canto do avatar: não reserva
              largura (o card compacto não tem onde) e, por ser absoluta, não
              empurra nada quando aparece — o quadro não treme com o mouse.
              Some por opacidade, nunca por `hidden`; `focus:opacity-100`
              porque caixa invisível e tabulável seria armadilha de teclado. */}
          <input
            type="checkbox"
            checked={Boolean(isSelected)}
            aria-label={`${t("Selecionar")}: ${card.title}`}
            onClick={(e) => {
              // O card inteiro tem onClick: sem parar a propagação, marcar a
              // caixa abriria o chat (ou o dossiê) por cima.
              e.stopPropagation();
              onSelect?.(card.id, e.shiftKey ? "intervalo" : "alterna");
            }}
            onChange={() => {
              /* estado vem de `isSelected`; quem decide é o onClick acima */
            }}
            className={cn(
              "absolute left-1 top-1 z-10 h-4 w-4 cursor-pointer accent-accent transition-opacity",
              "focus:opacity-100 focus-visible:outline-2 focus-visible:outline-accent",
              isSelected || isSelecting ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          />

          {/* Estilo Leona: avatar à esquerda; à direita, nome + hora, telefone
              + não lidas, e a última mensagem. Altura reservada (a prévia
              ocupa sempre 2 linhas): o card não cresce nem encolhe com o texto,
              e o quadro fica alinhado. */}
          <div className="flex items-start gap-2.5">
            <Avatar className="mt-0.5 h-10 w-10 shrink-0">
              {/* A MESMA foto do Inbox, pela mesma rota. Só monta a <img>
                  quando há arquivo — senão o quadro pediria a rota para todo
                  card e levaria 404 na maioria (ver ConversationListItem). */}
              {lead.contact_has_avatar && lead.contact_id ? (
                <AvatarImage
                  src={`/api/v1/contacts/${lead.contact_id}/avatar`}
                  alt=""
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback
                className="text-xs font-semibold"
                style={estiloDasIniciais(lead.contact_id ?? card.id)}
              >
                {initials(nome, telefone ?? "?")}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex h-5 items-center gap-1.5">
                {card.canonicalTag && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    title={card.canonicalTag}
                    // role="img": um span nu não aceita aria-label (aria-prohibited-attr).
                    role="img"
                    aria-label={`${t("Tag")}: ${card.canonicalTag}`}
                  />
                )}
                {/* O NOME é o elemento ativável, não o card inteiro: o card é
                    `role="group"` (o dnd marca o handle como button, e com o
                    menu dentro isso vira nested-interactive no axe). O botão
                    atende mouse, teclado e leitor de tela. */}
                <h3 className="min-w-0 flex-1 text-sm leading-5 text-text">
                  <button
                    type="button"
                    onClick={(e) => {
                      // `stopPropagation`: sem ele o handler do card rodaria de
                      // novo e o gesto contaria duas vezes (ctrl+clique marcaria
                      // e desmarcaria no mesmo instante). Por isso a DECISÃO é
                      // tomada aqui também.
                      e.stopPropagation();
                      decidirClique(e);
                    }}
                    className={cn(
                      "block w-full truncate text-left hover:underline",
                      naoLidas > 0 ? "font-semibold" : "font-medium",
                    )}
                  >
                    {nome}
                  </button>
                </h3>
                {hora && (
                  <span
                    className={cn(
                      "shrink-0 text-[11px] tabular-nums",
                      naoLidas > 0 ? "font-semibold text-text" : "text-text-muted",
                    )}
                  >
                    {hora}
                  </span>
                )}
                <KanbanCardActions
                  lead={lead}
                  pipelineId={pipelineId}
                  onVerNegocio={onOpen ? () => onOpen(card.id) : undefined}
                />
              </div>

              <div className="flex h-4 items-center gap-2 text-[11px] leading-4 text-text-muted">
                <span className="min-w-0 flex-1 truncate tabular-nums">{telefoneEmbaixo ?? ""}</span>
                {value && <span className="shrink-0 font-medium tabular-nums text-text">{value}</span>}
                {naoLidas > 0 && (
                  // O número, não um ponto: "3 sem ler" e "12 sem ler" pedem
                  // urgências diferentes, e um ponto colapsa as duas.
                  <span
                    className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums"
                    aria-label={`${naoLidas} ${t("sem ler")}`}
                  >
                    {naoLidas > 99 ? "99+" : naoLidas}
                  </span>
                )}
              </div>

              <p
                className={cn(
                  "mt-0.5 line-clamp-2 h-8 text-xs leading-4",
                  naoLidas > 0 ? "text-text" : "text-text-muted",
                )}
              >
                {linhaDeBaixo}
              </p>
            </div>
          </div>

          {/* A proposta do agente é a ÚNICA linha que sobrevive à compactação:
              é onde a decisão do humano entra (aprovar/recusar). Só aparece
              quando há o que decidir — aí o card cresce, de propósito. */}
          {state.slot.type === "awaiting" && (
            <div className="mt-1.5 flex h-6 items-center gap-2 text-xs">
              <NextActionSlot
                label={state.slot.label}
                leadId={card.id}
                approvedSeq={lead.next_action?.seq ?? -1}
                pipelineId={pipelineId}
              />
            </div>
          )}
          {state.slot.type === "reactivation" && (
            <div className="mt-1.5 flex h-6 items-center gap-2 text-xs">
              <ReactivationSlot
                leadId={card.id}
                proposalId={state.slot.proposalId}
                expiresAt={state.slot.expiresAt}
                pipelineId={pipelineId}
              />
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
