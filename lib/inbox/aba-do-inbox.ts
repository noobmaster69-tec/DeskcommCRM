/**
 * Em que aba o Inbox abre — e a memória da última aba escolhida.
 *
 * Pedido do dono do produto (fork jhoow): o Inbox abria na "Fila", e quem entra
 * quer ver as últimas mensagens — inclusive as que ele mesmo mandou. O padrão
 * passa a ser "Todas", e a última aba escolhida fica lembrada por usuário e
 * organização no navegador.
 *
 * A ordem de quem manda: `?filter=` na URL (deep link, sempre honrado) → a aba
 * gravada → o padrão. "Todas" só é padrão para quem a VÊ: `agent` com
 * visibilidade restrita não tem essa aba na tela (`visibleInboxTabs`), e abrir
 * numa aba invisível deixaria a pessoa sem saber onde está — para ele o padrão
 * segue sendo a Fila.
 */
import type { VisibilityMode, Role } from "@/lib/auth/types";
import { visibleInboxTabs, type InboxTab } from "@/components/inbox/InboxFilters";

const ABAS: readonly InboxTab[] = ["unassigned", "mine", "all", "closed", "archived", "ai"];

export function ehAbaDoInbox(v: unknown): v is InboxTab {
  return typeof v === "string" && (ABAS as readonly string[]).includes(v);
}

/** A aba de quem não escolheu nada: "Todas", se ela existe na tela da pessoa. */
export function abaPadraoDoInbox(role: Role | null | undefined, mode: VisibilityMode | undefined): InboxTab {
  if (!role) return "all";
  return visibleInboxTabs(role, mode).includes("all") ? "all" : "unassigned";
}

export function chaveDaAbaDoInbox(userId: string, orgId: string | null): string {
  return `inbox-aba:${userId}:${orgId ?? "sem-org"}`;
}

/**
 * A aba gravada, se ainda vale: valor conhecido E visível para a pessoa hoje
 * (o papel pode ter mudado desde que ela gravou). Qualquer outra coisa é `null`.
 */
export function lerAbaGravada(bruto: string | null, visiveis: readonly InboxTab[]): InboxTab | null {
  return ehAbaDoInbox(bruto) && visiveis.includes(bruto) ? bruto : null;
}
