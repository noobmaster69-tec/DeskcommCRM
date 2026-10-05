/**
 * Fuso e ritmo aleatório da campanha (fork jhoow, Campanhas › item 7).
 */

/** Os fusos que a tela oferece primeiro; "Outro" abre a lista IANA completa. */
export const FUSOS_PRINCIPAIS = [
  { fuso: "America/Sao_Paulo", rotulo: "🇧🇷 Brasil" },
  { fuso: "Europe/Lisbon", rotulo: "🇵🇹 Portugal" },
  { fuso: "Europe/London", rotulo: "🇬🇧 Reino Unido" },
  { fuso: "Europe/Madrid", rotulo: "🇪🇸 Espanha" },
  { fuso: "Europe/Amsterdam", rotulo: "🇳🇱 Holanda" },
] as const;

/** O nome é um fuso IANA que o runtime conhece? */
export function fusoValido(fuso: string | null | undefined): fuso is string {
  if (!fuso || fuso.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/** Todos os fusos IANA (para o "Outro"). */
export function todosOsFusos(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : FUSOS_PRINCIPAIS.map((f) => f.fuso);
}

/**
 * DDI → fuso, só para países de UM fuso. Brasil, EUA, México, Canadá, Rússia,
 * Austrália (vários fusos) ficam de fora de propósito: chutar "São Paulo" para
 * um número de Manaus erraria a janela em uma hora — aí vale o da campanha.
 */
const FUSO_DO_DDI: ReadonlyArray<readonly [string, string]> = [
  ["351", "Europe/Lisbon"],
  ["353", "Europe/Dublin"],
  ["44", "Europe/London"],
  ["34", "Europe/Madrid"],
  ["31", "Europe/Amsterdam"],
  ["32", "Europe/Brussels"],
  ["33", "Europe/Paris"],
  ["39", "Europe/Rome"],
  ["41", "Europe/Zurich"],
  ["49", "Europe/Berlin"],
  ["54", "America/Argentina/Buenos_Aires"],
  ["56", "America/Santiago"],
  ["57", "America/Bogota"],
  ["58", "America/Caracas"],
  ["595", "America/Asuncion"],
  ["598", "America/Montevideo"],
  ["51", "America/Lima"],
  ["244", "Africa/Luanda"],
  ["258", "Africa/Maputo"],
];

/**
 * O fuso do CONTATO, quando dá para saber sem chutar: o campo `timezone` da
 * ficha (se for IANA válido) e, senão, o DDI de um país de fuso único. Senão,
 * o fuso da campanha.
 */
export function fusoDoContato(
  telefone: string | null | undefined,
  campos: Record<string, unknown> | null | undefined,
  padrao: string,
): string {
  const daFicha = campos && typeof campos.timezone === "string" ? campos.timezone.trim() : "";
  if (fusoValido(daFicha)) return daFicha;
  const digitos = (telefone ?? "").replace(/\D/g, "");
  for (const [ddi, fuso] of FUSO_DO_DDI) if (digitos.startsWith(ddi)) return fuso;
  return padrao;
}

/** O próximo envio: agora + um tempo SORTEADO entre min e max (segundos). */
export function proximoEnvioAleatorio(
  agora: Date,
  minSegundos: number,
  maxSegundos: number,
  sorteio: () => number = Math.random,
): Date {
  const min = Math.max(1, Math.min(minSegundos, maxSegundos));
  const max = Math.max(minSegundos, maxSegundos);
  const segundos = min + sorteio() * (max - min);
  return new Date(agora.getTime() + Math.round(segundos * 1000));
}

/** "14:32" no fuso pedido — a prévia da tela. */
export function horaAgoraNoFuso(agora: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
}
