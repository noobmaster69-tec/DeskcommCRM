import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * DISPAROS (fork jhoow, item 12 — a tela /app/disparos, migration 9011): o que
 * faz um fluxo começar, num lugar só, como no Leona.
 *
 *  - Palavras-chave: condições sobre o texto da mensagem que chegou, ligadas
 *    por "qualquer" (or) ou "todas" (and), cada uma apontando um fluxo.
 *  - Gatilhos globais: boas-vindas (primeira mensagem de contato novo), conversa
 *    finalizada, resposta padrão (nada mais casou; uma vez a cada N horas por
 *    contato) e atendimento finalizado (fechada com um atendente humano).
 *
 * Este módulo é a regra pura (formato, casamento) e a leitura. Quem dispara é
 * `lib/fluxos/entrada.ts` (mensagem que chega) e a rota de fechar conversa.
 */

export const OPERADORES_DO_DISPARO = ["igual", "contem", "diferente", "nao_contem", "comeca", "termina"] as const;
export type OperadorDoDisparo = (typeof OPERADORES_DO_DISPARO)[number];

export const ROTULO_DO_OPERADOR_DO_DISPARO: Record<OperadorDoDisparo, string> = {
  igual: "É igual",
  contem: "Contém",
  diferente: "É diferente",
  nao_contem: "Não contém",
  comeca: "Começa com",
  termina: "Termina com",
};

export const condicaoDoDisparoSchema = z.strictObject({
  operador: z.enum(OPERADORES_DO_DISPARO),
  valor: z.string().trim().min(1).max(200),
});
export type CondicaoDoDisparo = z.infer<typeof condicaoDoDisparoSchema>;

export const palavraChaveSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  fluxo_id: z.string().uuid().nullable(),
  logic_operator: z.enum(["and", "or"]),
  conditions: z.array(condicaoDoDisparoSchema).min(1).max(20),
  active: z.boolean(),
});
export type PalavraChave = z.infer<typeof palavraChaveSchema>;

export const globaisSchema = z.strictObject({
  welcome_fluxo_id: z.string().uuid().nullable(),
  conversation_closed_fluxo_id: z.string().uuid().nullable(),
  default_response_fluxo_id: z.string().uuid().nullable(),
  default_response_hours: z.number().int().min(1).max(720),
  attendance_closed_fluxo_id: z.string().uuid().nullable(),
});
export type GatilhosGlobais = z.infer<typeof globaisSchema>;

export const GLOBAIS_VAZIOS: GatilhosGlobais = {
  welcome_fluxo_id: null,
  conversation_closed_fluxo_id: null,
  default_response_fluxo_id: null,
  default_response_hours: 24,
  attendance_closed_fluxo_id: null,
};

export const salvarDisparosSchema = z.strictObject({
  palavras: z
    .array(palavraChaveSchema)
    .max(100)
    .refine((l) => new Set(l.map((p) => p.id)).size === l.length, { message: "palavra-chave repetida" }),
  globais: globaisSchema,
});
export type Disparos = z.infer<typeof salvarDisparosSchema>;

/** O badge "Sem fluxos" da seção de gatilhos globais: nenhum dos quatro escolhido. */
export function semGatilhoGlobal(g: GatilhosGlobais): boolean {
  return !g.welcome_fluxo_id && !g.conversation_closed_fluxo_id && !g.default_response_fluxo_id && !g.attendance_closed_fluxo_id;
}

/** Sem acento, sem caixa, sem pontuação nas pontas, espaços colapsados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^[\s.,!?¡¿;:"'()*_~-]+|[\s.,!?¡¿;:"'()*_~-]+$/g, "")
    .replace(/\s+/g, " ");
}

export function casaCondicao(texto: string, c: CondicaoDoDisparo): boolean {
  const t = normalizarTexto(texto);
  const v = normalizarTexto(c.valor);
  if (v === "") return false;
  switch (c.operador) {
    case "igual":
      return t === v;
    case "diferente":
      return t !== v;
    case "contem":
      return t.includes(v);
    case "nao_contem":
      return !t.includes(v);
    case "comeca":
      return t.startsWith(v);
    case "termina":
      return t.endsWith(v);
  }
}

export function casaPalavraChave(texto: string, p: Pick<PalavraChave, "logic_operator" | "conditions">): boolean {
  if (p.conditions.length === 0) return false;
  return p.logic_operator === "and"
    ? p.conditions.every((c) => casaCondicao(texto, c))
    : p.conditions.some((c) => casaCondicao(texto, c));
}

/** A primeira palavra-chave ATIVA, com fluxo, que casa com o texto — na ordem da tela. */
export function escolherPalavraChave(palavras: readonly PalavraChave[], texto: string): PalavraChave | null {
  if (texto.trim() === "") return null;
  return palavras.find((p) => p.active && p.fluxo_id && casaPalavraChave(texto, p)) ?? null;
}

/** Lê a configuração da organização (palavras na ordem da tela e os globais). */
export async function lerDisparos(db: SupabaseClient, org: string): Promise<Disparos> {
  const [{ data: palavras, error: e1 }, { data: globais, error: e2 }] = await Promise.all([
    db
      .from("crm_fluxo_triggers")
      .select("id, name, fluxo_id, logic_operator, conditions, active")
      .eq("organization_id", org)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    db
      .from("crm_fluxo_global_triggers")
      .select(
        "welcome_fluxo_id, conversation_closed_fluxo_id, default_response_fluxo_id, default_response_hours, attendance_closed_fluxo_id",
      )
      .eq("organization_id", org)
      .maybeSingle(),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  // Linha gravada com formato velho/torto não derruba a leitura: a condição
  // inválida some, e a palavra sem condição nenhuma não casa nada.
  const lidas: PalavraChave[] = (palavras ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    fluxo_id: (p.fluxo_id as string | null) ?? null,
    logic_operator: p.logic_operator === "and" ? "and" : "or",
    conditions: (Array.isArray(p.conditions) ? p.conditions : []).flatMap((c: unknown) => {
      const ok = condicaoDoDisparoSchema.safeParse(c);
      return ok.success ? [ok.data] : [];
    }),
    active: p.active !== false,
  }));
  return { palavras: lidas, globais: globais ? { ...GLOBAIS_VAZIOS, ...(globais as GatilhosGlobais) } : GLOBAIS_VAZIOS };
}

/**
 * O contato já entrou no fluxo da resposta padrão nas últimas `horas`? É o
 * "no máximo uma vez a cada N horas" — sem isso, cada mensagem sem gatilho
 * mandaria a resposta padrão de novo.
 */
export async function respostaPadraoRecente(
  admin: SupabaseClient,
  org: string,
  contactId: string,
  fluxoId: string,
  horas: number,
  agora = new Date(),
): Promise<boolean> {
  const desde = new Date(agora.getTime() - horas * 3_600_000).toISOString();
  const { count, error } = await admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .eq("pointer_id", fluxoId)
    .gte("created_at", desde);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
