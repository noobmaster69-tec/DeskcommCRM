/**
 * Como uma conversa se apresenta numa LISTA: as iniciais no lugar da foto e a
 * hora da última mensagem.
 *
 * Moravam dentro de `components/inbox/ConversationListItem.tsx`. Saíram para cá
 * quando o card do funil passou a mostrar a mesma foto e a mesma hora: duas
 * cópias divergem na primeira correção, e o mesmo contato apareceria "14:32" no
 * Inbox e "há 3 horas" no quadro.
 */
import type { Locale } from "date-fns";
import { format, formatDistanceToNowStrict } from "date-fns";

/** Duas letras para o lugar da foto: primeira e última palavra, ou o fallback. */
export function initials(name: string | null | undefined, fallback: string): string {
  const v = (name ?? "").trim();
  if (!v) return fallback.slice(0, 2).toUpperCase();
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

/** Hoje: `HH:mm`. Na semana: distância curta ("3 dias"). Antes disso: `dd/MM`. */
export function relativeTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return format(d, "HH:mm");
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return formatDistanceToNowStrict(d, { addSuffix: false, locale: locale });
  return format(d, "dd/MM");
}
