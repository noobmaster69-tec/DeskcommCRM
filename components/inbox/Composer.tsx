"use client";
import { useT } from "@/hooks/i18n/useT";
import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { PaperPlaneTilt, Sparkle } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { AttachMenu } from "@/components/inbox/composer/AttachMenu";
import { AttachmentPreviewDialog } from "@/components/inbox/composer/AttachmentPreviewDialog";
import { ContactPickerDialog } from "@/components/inbox/composer/ContactPickerDialog";
import { AudioRecorder } from "@/components/inbox/composer/AudioRecorder";
import { ReplyReviewPanel } from "@/components/inbox/composer/ReplyReviewPanel";
import { useSugestaoDoAgente } from "@/components/inbox/composer/useSugestaoDoAgente";
import { SeletorDeModo } from "@/components/inbox/composer/SeletorDeModo";
import { ResumirConversa } from "@/components/inbox/composer/ResumirConversa";
import { alturaDoCampo, ALTURA_MINIMA_PX } from "@/lib/inbox/altura-do-campo";
import { EmojiButton } from "@/components/inbox/composer/EmojiButton";
import { resolveSlash, TemplateMenu } from "@/components/inbox/composer/TemplateMenu";
import { useCreateNote } from "@/hooks/inbox/useCreateNote";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { X } from "lucide-react";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { useUploadMedia, type DestinoDoUpload } from "@/hooks/inbox/useUploadMedia";
import { imagemDoClipboard } from "@/lib/inbox/clipboard-image";
import { interpolateTemplate } from "@/lib/inbox/template-vars";
import {
  type AvisoDeRascunho,
  type MotivoDeRecusa,
} from "@/lib/inbox/rascunho-sugerido";
import { apiClient } from "@/lib/api/client";
import { useMarcarComoLidas } from "@/hooks/inbox/useMarcarComoLidas";
import { cn } from "@/lib/utils";

export interface ComposerHandle {
  focus: () => void;
}

/**
 * O que a tela diz quando o rascunho NÃO vale mais (issue #1611: "a conversa
 * abre sem texto e com aviso").
 *
 * Os quatro motivos são frases separadas de propósito: o atendente precisa
 * saber se o texto expirou, se alguém já usou ou se o link era de outra
 * conversa — e a única coisa que os quatro têm em comum (a conversa abriu sem
 * ele) é justamente o que ele não deve presumir sozinho.
 */
function avisoDeRascunhoIndisponivel(motivo: MotivoDeRecusa, t: (texto: string) => string): string {
  switch (motivo) {
    case "outra_conversa":
      return t("O texto sugerido pertence a outra conversa. A conversa abriu sem ele.");
    case "usado":
      return t("O texto sugerido já foi usado. A conversa abriu sem ele.");
    case "expirado":
      return t("O texto sugerido expirou. A conversa abriu sem ele.");
    case "nao_encontrado":
    default:
      return t("O texto sugerido não foi encontrado. A conversa abriu sem ele.");
  }
}

interface Props {
  conversationId: string;
  initialDraft?: string;
  initialMode?: "reply" | "note";
  onDraftChange?: (text: string, mode: "reply" | "note") => void;
  active?: boolean;
  disabled?: boolean;
  /** Set true when contact is blocked / anonymized — explanation shown. */
  blockedReason?: string | null;
  /**
   * Janela de 24h fechada: barra a RESPOSTA, e só ela.
   *
   * Separado de `blockedReason` porque a nota interna nunca chega ao cliente —
   * a regra da plataforma não a alcança, e barrá-la tira do atendente
   * justamente o lugar onde ele registra por que a conversa esfriou. A primeira
   * versão deste bloqueio usava `blockedReason` e levou a nota junto.
   */
  janelaFechada?: string | null;
  /**
   * A mensagem que esta resposta CITA, quando o atendente escolheu responder
   * "em cima" de uma. `null` = envio solto, o caso comum.
   *
   * Vem de fora e não daqui porque quem escolhe é a lista de mensagens: o
   * composer só precisa mostrar o que foi escolhido e mandá-lo junto.
   */
  respondendo?: { id: string; body: string | null; direction: string } | null;
  /** Desfaz a escolha — o `x` da faixa de citação. */
  onCancelarResposta?: () => void;
  /** Nome do contato da conversa, para interpolar {{nome}}/{{primeiro_nome}} do template escolhido. */
  contactName?: string | null;
  /** Contato da conversa — excluído do seletor de cartão compartilhado. */
  currentContactId?: string | null;
  /**
   * Texto sugerido por integração (issue #1611). O texto em si já vem em
   * `initialDraft` (é ele que preenche o campo); aqui vêm o AVISO de origem e o
   * `draft_id` que o consumo usa depois do clique.
   */
  rascunho?: AvisoDeRascunho | null;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  {
    conversationId,
    initialDraft = "",
    initialMode = "reply",
    active = true,
    onDraftChange,
    disabled,
    blockedReason,
    janelaFechada,
    contactName,
    currentContactId,
    respondendo,
    onCancelarResposta,
    rascunho = null,
  },
  ref,
) {
  const t = useT();
  const [text, setText] = useState(initialDraft);
  // O aviso some no primeiro ENVIO: depois do clique o rascunho foi usado, e
  // deixar a faixa prometendo texto que já saiu seria mentira de tela.
  const [rascunhoUsado, setRascunhoUsado] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /**
   * O modo em que o arquivo foi ESCOLHIDO, congelado na escolha — e não o modo
   * em que o diálogo está aberto agora.
   *
   * Sem isto, um anexo escolhido em "Nota interna" que o operador troque para
   * "Responder" antes de clicar Enviar sairia pela rota de MENSAGEM: o arquivo
   * subiria em `whatsapp-media` e iria para o cliente. É exatamente o defeito
   * que a F3 da #1863 existe para não ter — e um dropdown de dois botões não
   * pode ser a única coisa entre um print interno e o celular da pessoa.
   */
  const [pendingEm, setPendingEm] = useState<"reply" | "note">("reply");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [mode, setMode] = useState<"reply" | "note">(initialMode);
  useEffect(() => {
    onDraftChange?.(text, mode);
  }, [text, mode, onDraftChange]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const send = useSendMessage();
  const upload = useUploadMedia();
  const createNote = useCreateNote();
  const templates = useMessageTemplates();
  const slash = resolveSlash(text);
  // "/ Respostas rápidas" (pílula) abre a MESMA lista do "/" digitado, sem
  // mexer no que já está escrito.
  const [menuForcado, setMenuForcado] = useState(false);
  const menuOpen = mode === "reply" && ((slash.open && !menuDismissed) || menuForcado);
  const sugestao = useSugestaoDoAgente(conversationId);
  // Fork jhoow: abrir a conversa e começar a responder deixam as mensagens do contato lidas.
  const marcarLidas = useMarcarComoLidas(conversationId);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
  }));

  // send/createNote fora do disable: o texto some na hora do envio; travar o campo
  // até a API voltar impedia digitar a próxima mensagem com o campo ainda cheio.
  const isDisabled = disabled || !!blockedReason || upload.isPending;
  // A janela só alcança o que SAI. Em modo nota o composer segue liberado: a
  // nota interna nunca chega ao cliente, e é onde o atendente registra por que
  // a conversa esfriou — barrá-la tira exatamente o que ainda dá para fazer.
  const respostaBarrada = isDisabled || (mode === "reply" && !!janelaFechada);

  /** Escolhe o arquivo e MARCA o modo da escolha (ver `pendingEm`). */
  function escolherArquivo(file: File) {
    setPendingFile(file);
    setPendingEm(mode);
  }

  // Campo estilo WhatsApp: 1 linha → cresce até 4 → depois rola por dentro.
  function autoresize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const { altura, rola } = alturaDoCampo(ta.scrollHeight);
    ta.style.height = `${altura}px`;
    ta.style.overflowY = rola ? "auto" : "hidden";
  }
  useEffect(() => {
    autoresize();
  }, [text]);

  function handleSubmit() {
    const body = text.trim();
    if (!body || (mode === "note" ? isDisabled : respostaBarrada)) return;

    setText("");
    requestAnimationFrame(() => autoresize());

    const restoreOnError = () => {
      // Se a pessoa já começou a próxima resposta, preserve os dois textos.
      setText((current) => (current ? `${body}\n${current}` : body));
      requestAnimationFrame(() => autoresize());
    };

    if (mode === "note") {
      createNote.mutate({ conversation_id: conversationId, body }, { onError: restoreOnError });
      return;
    }
    send.mutate(
      {
        conversation_id: conversationId,
        body,
        type: "text",
        ...(respondendo ? { reply_to_message_id: respondendo.id } : {}),
      },
      {
        onSuccess: () => {
          // A citação vale para UMA mensagem. Mantê-la depois do envio faria a
          // próxima frase sair citando algo que o atendente já respondeu.
          onCancelarResposta?.();
          consumirRascunhoEnviado();
          requestAnimationFrame(() => autoresize());
        },
        // Do upstream, e fica: sem isto o texto some quando o envio falha, e
        // quem escreveu um parágrafo o perde sem ter como recuperá-lo.
        onError: restoreOnError,
      },
    );
  }

  /**
   * Marca o rascunho como usado — só depois do ENVIO humano dar certo.
   *
   * Fire-and-forget de propósito: o texto já saiu, e a falha do consumo não pode
   * virar erro de envio. O aviso some na mesma hora (estado local), porque a
   * proposta é de uso único: repetir a dica depois do clique seria encher a tela
   * de alguém que já leu.
   */
  function consumirRascunhoEnviado(): void {
    const leitura = rascunho?.leitura;
    if (rascunhoUsado || leitura?.estado !== "sugerido") return;
    setRascunhoUsado(true);
    void apiClient
      .post(`/api/v1/conversations/${conversationId}/drafts/consume`, {
        draft_id: leitura.draftId,
      })
      .catch(() => {
        /* silêncio: ver docstring */
      });
  }

  function applyTemplate(t: MessageTemplate) {
    const filled = interpolateTemplate(t.body, { name: contactName ?? null });
    setText(filled);
    setMenuDismissed(true);
    setMenuForcado(false);
    const ta = taRef.current;
    if (!ta) return;
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = filled.length;
      autoresize();
    });
  }

  /**
   * Ctrl/Cmd+V com imagem no clipboard cai no MESMO caminho do menu "+":
   * abre o preview com legenda e envia por ali. Nada de atalho paralelo — a
   * validação, o toast de erro e o retry já vivem lá.
   *
   * As DUAS guardas antes de olhar o clipboard não são zelo: com um anexo já em
   * preview a colagem substituiria em silêncio o que o operador escolheu, e
   * desabilitado é desabilitado. Em qualquer um desses casos o Ctrl+V precisa
   * continuar sendo o Ctrl+V de sempre.
   *
   * O MODO saiu da guarda (#1863, F3): "Nota interna" passou a aceitar anexo,
   * e a imagem colada ali vira exatamente o mesmo preview de sempre — com o
   * modo congelado na escolha (`escolherArquivo`), para ela não escapar para o
   * cliente se o operador trocar de aba no meio. `respostaBarrada` já cobre os
   * dois modos: em nota ele é só `isDisabled` (a janela fechada barra a
   * RESPOSTA, e só ela — a nota continua sendo o lugar onde se registra por que
   * a conversa esfriou).
   */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (respostaBarrada || pendingFile) return;
    const imagem = imagemDoClipboard(e.clipboardData, new Date());
    if (!imagem) return; // colagem de texto segue o caminho normal do browser
    e.preventDefault();
    escolherArquivo(imagem);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && menuOpen) {
      setMenuDismissed(true);
      setMenuForcado(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (menuOpen) return; // deixa o Enter pro menu; não envia /query como mensagem
      handleSubmit();
    }
  }

  if (blockedReason) {
    return (
      <div className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
        {blockedReason}
      </div>
    );
  }

  return (
    <>
      <div className="relative border-t border-border bg-background px-3 pb-3 pt-2">
        <TemplateMenu
          open={menuOpen}
          query={menuForcado && !slash.open ? "" : slash.query}
          templates={templates.data ?? []}
          onPick={applyTemplate}
          onClose={() => {
            setMenuDismissed(true);
            setMenuForcado(false);
          }}
        />
        {/* O AVISO DO RASCUNHO SUGERIDO (issue #1611) — acima dos modos, sempre
            que a resposta está liberada. Nada aqui envia: a faixa só diz de onde
            veio o texto que já está no campo (e, quando o rascunho não vale
            mais, por que o campo está vazio). */}
        {rascunho && !rascunhoUsado && mode === "reply" && (
          <div
            data-testid="aviso-rascunho"
            className="mb-1.5 flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1.5 text-xs"
          >
            <p className="min-w-0 flex-1 text-muted-foreground">
              {rascunho.leitura.estado === "sugerido" ? (
                <>
                  {t("Texto sugerido por")}{" "}
                  <span className="font-medium text-foreground">{rascunho.leitura.origem}</span>.{" "}
                  {t("Revise antes de enviar.")}
                </>
              ) : (
                avisoDeRascunhoIndisponivel(rascunho.leitura.motivo, t)
              )}
            </p>
          </div>
        )}
        {/* AÇÕES RÁPIDAS (fork jhoow, composer compacto): o que era a caixa
            "Assistência do agente" virou UMA linha de pílulas. O cartão de
            revisão da sugestão só aparece quando há sugestão. */}
        <section aria-label={t("Assistência do agente")} className="mb-2 space-y-2">
          {mode === "reply" && <ReplyReviewPanel sugestao={sugestao} disabled={isDisabled} />}
          {/* UMA linha só, sem quebrar (pedido do Jhoow, 5 out): pílulas de 32px,
              texto pequeno, e "Sugerir resposta" vira só a estrela — o nome
              continua no aria-label e no title. */}
          <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden" data-testid="acoes-rapidas">
            {mode === "reply" && (
              <button
                type="button"
                onClick={() => void sugestao.generate()}
                disabled={isDisabled || sugestao.busy}
                aria-busy={sugestao.busy || undefined}
                aria-label={t(sugestao.busy ? "Preparando…" : "Sugerir resposta")}
                title={t(sugestao.busy ? "Preparando…" : "Sugerir resposta")}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-text transition-colors hover:bg-accent-soft/80 disabled:opacity-50"
              >
                <Sparkle size={16} weight="fill" aria-hidden className={sugestao.busy ? "animate-pulse text-violet-400" : "text-violet-400"} />
              </button>
            )}
            <ResumirConversa conversationId={conversationId} disabled={isDisabled} />
            {mode === "reply" && (
              <button
                type="button"
                onClick={() => {
                  setMenuDismissed(false);
                  setMenuForcado(true);
                  taRef.current?.focus();
                }}
                disabled={respostaBarrada}
                className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-transparent px-3 text-xs text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                <span aria-hidden className="text-text-muted">/</span>
                {t("Respostas rápidas")}
              </button>
            )}
          </div>
        </section>
        {/*
          A FAIXA DA CITAÇÃO — o que o atendente escolheu responder.

          Fica ACIMA do campo, como no WhatsApp, e não dentro dele: o texto
          citado pode ter várias linhas, e empurrá-lo para dentro do campo faria
          o que se digita disputar espaço com o que se cita.

          `line-clamp-2` porque o objetivo é reconhecer qual mensagem é, não
          relê-la — ela está logo acima, no fio.
        */}
        {respondendo && mode === "reply" && (
          <div className="mb-1 flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-primary">
                {respondendo.direction === "outbound" ? t("Você") : t("Cliente")}
              </div>
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {respondendo.body?.trim() || t("(sem texto)")}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelarResposta}
              aria-label={t("Cancelar resposta")}
              className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl border border-border bg-surface px-2 pb-2 pt-1 transition-colors",
            mode === "note" && "border-warning/60 bg-warning-bg",
          )}
          data-modo={mode}
        >
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (mode === "reply") marcarLidas();
              if (!resolveSlash(e.target.value).open) setMenuDismissed(false);
              setMenuForcado(false);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder={
              mode === "note"
                ? t("Nota interna visível só pra equipe...")
                : t("Escreva uma mensagem ou digite / para atalhos")
            }
            title={
              mode === "note"
                ? t("Enter salva a nota · Shift+Enter quebra linha")
                : t("Enter envia · Shift+Enter quebra linha")
            }
            style={{ height: ALTURA_MINIMA_PX }}
            className={cn(
              "block w-full resize-none overflow-hidden bg-transparent px-2 py-[10px] text-sm leading-5",
              "transition-[height] duration-150 ease-in-out",
              "placeholder:text-muted-foreground focus:outline-hidden",
            )}
            disabled={mode === "note" ? isDisabled : respostaBarrada}
            aria-label={t("Mensagem")}
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <SeletorDeModo modo={mode} onMudar={setMode} disabled={isDisabled} />
            <div className="flex items-center gap-1">
              {/* O clipe existe nos DOIS modos desde a F3 da #1863: em "Nota
                  interna" ele oferece foto/vídeo e documento (a nota aceita
                  anexo); Contato some — cartão de contato é MENSAGEM. */}
              <AttachMenu
                disabled={respostaBarrada}
                onPick={escolherArquivo}
                onPickContact={mode === "reply" ? () => setContactPickerOpen(true) : undefined}
              />
              <EmojiButton
                disabled={isDisabled}
                onPick={(emoji) => {
                  const ta = taRef.current;
                  if (!ta) {
                    setText((t) => t + emoji);
                    return;
                  }
                  const start = ta.selectionStart ?? text.length;
                  const end = ta.selectionEnd ?? text.length;
                  const next = text.slice(0, start) + emoji + text.slice(end);
                  setText(next);
                  requestAnimationFrame(() => {
                    ta.focus();
                    ta.selectionStart = ta.selectionEnd = start + emoji.length;
                    autoresize();
                  });
                }}
              />
              {text.trim() || mode === "note" ? (
                <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  onClick={handleSubmit}
                  disabled={(mode === "note" ? isDisabled : respostaBarrada) || !text.trim()}
                  aria-label={t("Enviar")}
                >
                  <PaperPlaneTilt size={16} weight="fill" aria-hidden />
                </Button>
              ) : (
                active && <AudioRecorder conversationId={conversationId} disabled={respostaBarrada} />
              )}
            </div>
          </div>
        </div>
      </div>
      <AttachmentPreviewDialog
        file={pendingFile}
        sending={upload.isPending || send.isPending || createNote.isPending}
        onCancel={() => setPendingFile(null)}
        onSend={async (caption) => {
          if (!pendingFile) return;
          // A BIFURCAÇÃO (#1863, F3) — e ela é decidida pelo modo CONGELADO NA
          // ESCOLHA (`pendingEm`), não pelo modo de agora.
          //
          //   reply  → upload em `whatsapp-media` + `useSendMessage`: exatamente
          //            o que era antes, byte por byte. Nada aqui mudou para o
          //            cliente.
          //   note   → upload em `internal-media` + `useCreateNote`, com o trio
          //            como `anexo`. Não existe passo de envio: a nota não é
          //            mensagem, não tem `type`, não tem destino no WhatsApp.
          //
          // O `try/catch` continua cobrindo SÓ o upload (falha de gravação da
          // nota é tratada pelo onError do próprio hook, e o diálogo fica aberto
          // nos dois casos).
          const destino: DestinoDoUpload = pendingEm === "note" ? "nota" : "mensagem";
          try {
            const uploaded = await upload.mutateAsync({ conversationId, file: pendingFile, destino });
            if (destino === "nota") {
              createNote.mutate(
                {
                  conversation_id: conversationId,
                  body: caption,
                  anexo: {
                    storage_path: uploaded.storage_path,
                    media_mime: uploaded.media_mime,
                    media_size_bytes: uploaded.media_size_bytes,
                  },
                },
                { onSuccess: () => setPendingFile(null) },
              );
              return;
            }
            send.mutate(
              {
                conversation_id: conversationId,
                type: uploaded.kind,
                body: caption || undefined,
                media_storage_path: uploaded.storage_path,
                media_mime: uploaded.media_mime,
                media_size_bytes: uploaded.media_size_bytes,
              },
              { onSuccess: () => setPendingFile(null) },
            );
          } catch {
            // toast já disparado pelo onError de useUploadMedia; dialog fica aberto p/ retry
            return;
          }
        }}
      />
      <ContactPickerDialog
        open={contactPickerOpen}
        onOpenChange={setContactPickerOpen}
        excludeContactId={currentContactId}
        sending={send.isPending}
        onPick={(payload) => {
          send.mutate(
            {
              conversation_id: conversationId,
              type: "contact",
              metadata: payload.contactId
                ? { shared_contact_id: payload.contactId }
                : {
                    shared_contact: {
                      name: payload.name,
                      phone_number: payload.phone_number,
                    },
                  },
            },
            { onSuccess: () => setContactPickerOpen(false) },
          );
        }}
      />
    </>
  );
});
