/**
 * O menu lateral PESSOAL (fork jhoow, P6): telas e grupos que a própria pessoa
 * escondeu, por organização (`user_organizations.menu_oculto`, migration 9001).
 *
 * É a ÚLTIMA camada do menu e só ESCONDE. Papel, módulos, capacidades, a
 * escolha da empresa e a do admin para o vínculo já decidiram o que a pessoa
 * PODE ver (`sidebarGroups`); daqui sai um subconjunto disso. Valor que não
 * casa com nada (tela que deixou de existir) é ignorado em silêncio.
 *
 * Esconder do menu não é tirar acesso: a rota e o ⌘K continuam de pé.
 */
import { z } from "zod";

/** Prefixo dos itens que escondem um GRUPO inteiro (`grupo:ia`). */
export const PREFIXO_DE_GRUPO = "grupo:";

export const LIMITE_DO_MENU_OCULTO = 200;

export const menuOcultoSchema = z
  .array(z.string().min(1).max(200))
  .max(LIMITE_DO_MENU_OCULTO)
  .transform((itens) => [...new Set(itens)]);

/** Lê o que veio do banco (ou do navegador) sem nunca lançar: lixo vira `[]`. */
export function lerMenuOculto(bruto: unknown): string[] {
  const r = menuOcultoSchema.safeParse(bruto);
  return r.success ? r.data : [];
}

export function chaveDeGrupo(id: string): string {
  return `${PREFIXO_DE_GRUPO}${id}`;
}

/**
 * Aplica a preferência sobre o que o menu já ia mostrar. Grupo escondido some
 * inteiro; grupo cujos itens foram todos escondidos também some (cabeçalho
 * órfão é o defeito que `sidebarGroups` já evita).
 */
export function aplicarMenuOculto<G extends { group: { id: string }; items: { href: string }[] }>(
  grupos: G[],
  oculto: readonly string[] | undefined,
): G[] {
  if (!oculto || oculto.length === 0) return grupos;
  const esconde = new Set(oculto);
  return grupos
    .filter((g) => !esconde.has(chaveDeGrupo(g.group.id)))
    .map((g) => ({ ...g, items: g.items.filter((i) => !esconde.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}

/** Chave do espelho no navegador — o fallback quando o servidor não respondeu. */
export function chaveDoMenuOculto(userId: string, orgId: string | null): string {
  return `menu-oculto:${userId}:${orgId ?? "sem-org"}`;
}
