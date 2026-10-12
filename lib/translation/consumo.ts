import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Mensagens traduzidas este mês: N · Custo estimado: $X.XX" (Configurações ›
 * Uso). Conta as chamadas de tradução que deram certo em `llm_calls` desde o
 * dia 1º do mês (UTC); o custo soma as de detecção de idioma também, que são
 * parte do mesmo serviço.
 */
export interface ConsumoDaTraducao {
  mensagens: number;
  custoEmDolares: number;
}

export function inicioDoMes(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

export async function consumoDaTraducao(admin: SupabaseClient, org: string, agora = new Date()): Promise<ConsumoDaTraducao> {
  const { data } = await admin
    .from("llm_calls")
    .select("purpose, status, cost_cents")
    .eq("organization_id", org)
    .in("purpose", ["message_translate", "locale_detect"])
    .gte("created_at", inicioDoMes(agora))
    .limit(50_000);
  const linhas = (data ?? []) as Array<{ purpose: string; status: string; cost_cents: number | string | null }>;
  return {
    mensagens: linhas.filter((l) => l.purpose === "message_translate" && l.status === "ok").length,
    custoEmDolares: linhas.reduce((s, l) => s + (Number(l.cost_cents) || 0), 0) / 100,
  };
}

export function textoDoConsumo(c: ConsumoDaTraducao, t: (x: string) => string = (x) => x): string {
  return `${t("Mensagens traduzidas este mês")}: ${c.mensagens} · ${t("Custo estimado")}: $${c.custoEmDolares.toFixed(2)}`;
}
