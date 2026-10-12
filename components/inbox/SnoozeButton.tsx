"use client";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock } from "@/lib/ui/icons";
import { AlarmClock } from "./icones";
import { BOTAO_DO_GRUPO } from "./estilo";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";

interface Props {
  conversationId: string;
  snoozeUntil: string | null;
  disabled?: boolean;
  /** Só o ícone (cabeçalho do Inbox): o rótulo vira dica e nome acessível. */
  compacto?: boolean;
}

const DURATIONS: Array<{ hours: 1 | 3 | 24; label: string }> = [
  { hours: 1, label: "Em 1 hora" },
  { hours: 3, label: "Em 3 horas" },
  { hours: 24, label: "Em 24 horas" },
];

function isSnoozeActive(snoozeUntil: string | null): boolean {
  return snoozeUntil != null && new Date(snoozeUntil).getTime() > Date.now();
}

export function SnoozeButton({ conversationId, snoozeUntil, disabled, compacto }: Props) {
  const t = useT();
  const { snooze, cancel } = useSnoozeConversation();
  const isActive = isSnoozeActive(snoozeUntil);
  const isPending = snooze.isPending || cancel.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compacto ? (
          <button
            type="button"
            disabled={disabled || isPending}
            className={BOTAO_DO_GRUPO}
            aria-label={isActive ? t("Lembrete ativo") : t("Lembrar")}
            title={isActive ? t("Lembrete ativo") : t("Lembrar")}
          >
            <AlarmClock size={16} aria-hidden />
            {isActive && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ibx-accent" aria-hidden />}
          </button>
        ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || isPending}
          className="flex items-center gap-1"
        >
          <Clock size={12} weight="regular" aria-hidden />
          {isActive ? t("Lembrete ativo") : t("Lembrar")}
        </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isActive ? (
          <DropdownMenuItem
            onClick={() => cancel.mutate({ conversation_id: conversationId })}
          >
            {t("Cancelar lembrete")}
          </DropdownMenuItem>
        ) : (
          DURATIONS.map((d) => (
            <DropdownMenuItem
              key={d.hours}
              onClick={() =>
                snooze.mutate({ conversation_id: conversationId, duration_hours: d.hours })
              }
            >
              {t(d.label)}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
