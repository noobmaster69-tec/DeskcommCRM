"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { PontoDaEtiqueta } from "@/components/tags/PontoDaEtiqueta";
import { Input } from "@/components/ui/input";
import { X, Plus } from "@/lib/ui/icons";
import {
  useUpdateConversationTags,
  useConversationTagVocabulary,
} from "@/hooks/inbox/useConversationTags";

interface Props {
  conversationId: string;
  orgId: string;
  tags: string[];
}

/** G3-05: aplica/remove tags de atendimento na conversa, com sugestão canônica. */
export function ConversationTagsEditor({ conversationId, orgId, tags }: Props) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const mutation = useUpdateConversationTags();
  const { data: vocabulary } = useConversationTagVocabulary(orgId);

  // Normalização espelha o Zod do PATCH (trim+lowercase); dedup no set.
  function apply(next: string[]) {
    mutation.mutate({ conversation_id: conversationId, tags: next });
  }

  function add(raw: string) {
    const tag = raw.trim().toLowerCase().slice(0, 40);
    if (!tag || tags.includes(tag) || tags.length >= 20) return;
    apply([...tags, tag]);
    setDraft("");
  }

  function remove(tag: string) {
    apply(tags.filter((v) => v !== tag));
  }

  const [adicionando, setAdicionando] = useState(false);
  const termo = draft.trim().toLowerCase();
  // Autocompletar: o vocabulário da organização filtrado pelo que se digita.
  const suggestions = (vocabulary ?? [])
    .filter((v) => !tags.includes(v) && (termo === "" || v.includes(termo)))
    .slice(0, 6);
  const cheio = tags.length >= 20;

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ibx-muted">
        {t("Tags da conversa")}
      </h3>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <ChipDeEtiqueta key={tag} tag={tag} className="h-6 gap-1 rounded-full px-2 text-[12px]">
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={mutation.isPending}
              aria-label={`${t("Remover tag")} ${tag}`}
              className="rounded-sm hover:text-ibx-danger"
            >
              <X size={10} weight="bold" aria-hidden />
            </button>
          </ChipDeEtiqueta>
        ))}
        {adicionando ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Escape") {
                setDraft("");
                setAdicionando(false);
              }
            }}
            onBlur={() => {
              // Dá tempo do clique numa sugestão chegar antes de fechar.
              setTimeout(() => setAdicionando(false), 150);
            }}
            placeholder={t("Nova tag…")}
            maxLength={40}
            disabled={mutation.isPending || cheio}
            className="h-6 w-32 rounded-full border-ibx-border bg-ibx-field px-2.5 text-[12px] shadow-none"
            aria-label={t("Adicionar tag à conversa")}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            disabled={mutation.isPending || cheio}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-ibx-border-hover px-2.5 text-[12px] text-ibx-muted transition-colors hover:border-solid hover:text-ibx-text focus-visible:outline-2 focus-visible:outline-ibx-accent disabled:opacity-50"
          >
            <Plus size={11} weight="bold" aria-hidden />
            {t("Adicionar tag")}
          </button>
        )}
      </div>

      {adicionando && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1" role="listbox" aria-label={t("Sugestões de tag")}>
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
              disabled={mutation.isPending || cheio}
              className="inline-flex items-center gap-1 rounded-full bg-ibx-chip px-2 py-0.5 text-[11px] text-ibx-text-2 hover:bg-ibx-chip-strong hover:text-ibx-text disabled:opacity-50"
            >
              <PontoDaEtiqueta tag={tag} />
              {tag}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
