/**
 * A cor do avatar do CRM quando ninguém escolheu (fork jhoow, card
 * reorganizado): derivada do NOME, sempre a mesma para o mesmo nome, da paleta
 * rosa · roxo · azul · verde · laranja · ciano. `avatar_bg_color` gravado
 * (modal Editar CRM) manda sobre ela.
 */
export const PALETA_DO_AVATAR = ["#ec4899", "#8b5cf6", "#3b82f6", "#22c55e", "#f97316", "#06b6d4"] as const;

export function corDoAvatar(nome: string, escolhida?: string | null): string {
  if (escolhida) return escolhida;
  let h = 0;
  for (const ch of nome.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETA_DO_AVATAR[h % PALETA_DO_AVATAR.length]!;
}
