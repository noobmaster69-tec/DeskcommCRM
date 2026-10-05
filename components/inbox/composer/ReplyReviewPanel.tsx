"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import type { SugestaoDoAgente } from "./useSugestaoDoAgente";

/**
 * O cartão de REVISÃO da sugestão do agente. Antes era uma caixa fixa
 * "Assistência do agente" com um botão só, ocupando o rodapé da conversa o
 * tempo todo; agora (fork jhoow, composer compacto) só aparece quando há uma
 * sugestão para revisar ou um aviso do que aconteceu com ela. O gatilho
 * "Sugerir resposta" é a pílula da linha de ações rápidas.
 */
export function ReplyReviewPanel({ sugestao, disabled }: { sugestao: SugestaoDoAgente; disabled?: boolean }) {
  const t = useT();
  const { draft, body, busy, decide, edits, setEdits, feedback, setFeedback, notice, statuses } = sugestao;
  const avisoVisivel =
    notice &&
    (!draft ||
      (notice.draftId === draft.id &&
        (notice.kind === "error" || ["approved", "sending", "sent", "dismissed"].includes(draft.status))));
  if (!draft && !avisoVisivel) return null;
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3" data-testid="sugestao-do-agente-area">
      {draft && (
        <div className="space-y-2" data-testid="sugestao-do-agente">
          <p className="text-sm font-medium">{t(statuses[draft.status] ?? "Sugestão do agente")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Aprovar envia somente este texto. Não altera dados, agenda ou a autonomia do agente.",
            )}
          </p>
          {body && (
            <Textarea
              aria-label={t("Resposta sugerida")}
              value={body}
              onChange={(e) => setEdits({ ...edits, [draft.id]: e.target.value })}
              disabled={disabled || busy || draft.status !== "pending"}
              rows={3}
            />
          )}
          {draft.proposals.length > 0 && (
            <details className="text-xs">
              <summary>{t("Ações propostas: precisam de autorização separada")}</summary>
              <p>{t("Abra a ação correspondente no CRM ou na agenda para confirmar.")}</p>
              <ul>
                {draft.proposals.map((p, i) => (
                  <li key={i}>{p.tool}</li>
                ))}
              </ul>
            </details>
          )}
          {draft.status === "pending" && (
            <>
              <Input
                aria-label={t("Feedback para a próxima sugestão")}
                placeholder={t("Feedback para a próxima sugestão")}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={1000}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled || busy || !body.trim()}
                  onClick={() => decide("approve")}
                >
                  {t("Aprovar e enviar")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || busy}
                  onClick={() => decide("reject")}
                >
                  {t("Rejeitar")}
                </Button>
              </div>
            </>
          )}
          {draft.status === "failed" && (
            <p className="text-xs">
              {t("Confira a configuração do agente e tente gerar novamente.")}
            </p>
          )}
        </div>
      )}
      {/*
        A confirmação da rejeição ("o feedback será usado na próxima sugestão")
        estava amarrada a `draft` existir. Agora a rejeitada some da tela — que é
        o conserto —, e sem esta mudança a confirmação sumiria junto com ela: a
        pessoa clicaria em Rejeitar e a tela apenas esvaziaria, sem dizer nada.
        Quando ainda há sugestão, o aviso continua amarrado a ela.
      */}
      {avisoVisivel && notice && (
          <p role="status" className="text-xs">
            {notice.message}
          </p>
        )}
        </div>
  );
}
