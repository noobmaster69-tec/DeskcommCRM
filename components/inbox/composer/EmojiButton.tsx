"use client";
import { Smile } from "@/components/inbox/icones";
import { BOTAO_DE_ICONE } from "@/components/inbox/estilo";
import { lazy, Suspense, useState } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy: o picker (+dados) só carrega quando o usuário abre — zero peso no bundle do inbox.
const Picker = lazy(() => import("@emoji-mart/react"));

interface Props {
  disabled?: boolean;
  onPick: (emoji: string) => void;
}

export function EmojiButton({ disabled, onPick }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={BOTAO_DE_ICONE}
          aria-label={t("Emoji")}
          title={t("Emoji")}
          disabled={disabled}
        >
          <Smile size={16} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-auto border-none p-0 shadow-lg">
        {open && (
          <Suspense fallback={<Skeleton className="h-[420px] w-[352px]" />}>
            <EmojiPickerLazy onPick={onPick} />
          </Suspense>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EmojiPickerLazy({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Picker
      data={async () => (await import("@emoji-mart/data")).default}
      locale="pt"
      previewPosition="none"
      onEmojiSelect={(e: { native: string }) => onPick(e.native)}
    />
  );
}
