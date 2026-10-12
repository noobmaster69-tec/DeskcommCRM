import { generateText, type LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { modeloLeveDaEmpresa } from "@/lib/ai/modelo-leve-da-empresa";
import { computeCost } from "@/lib/ai/cost";
import { logInvocation, type InvocationKind } from "@/lib/ai/log-invocation";
import { logger } from "@/lib/logger";

/**
 * A chamada de modelo da tradução automática (fork jhoow, 9022).
 *
 * Usa a credencial da EMPRESA (IA › Credenciais) pelo mesmo caminho do resumo
 * e da tradução de fluxo — Anthropic primeiro, OpenAI depois (`modeloLeveDaEmpresa`).
 * Nenhum provedor novo é cadastrado. Teto de 10s por tentativa, UMA nova
 * tentativa; esgotado, devolve `null` e a tela mostra o fallback.
 *
 * Toda chamada (ok ou erro) entra em `llm_calls` com o propósito — é dali que
 * Configurações › Uso conta "Mensagens traduzidas este mês" e o custo.
 */

export const TETO_POR_TENTATIVA_MS = 10_000;

export interface ChamadaDeTraducao {
  organizationId: string;
  kind: Extract<InvocationKind, "message_translate" | "locale_detect">;
  system: string;
  prompt: string;
  conversationId?: string | null;
  messageId?: string | null;
}

export interface Dependencias {
  modelo?: (admin: SupabaseClient, org: string) => Promise<LanguageModel | null>;
  gerar?: typeof generateText;
  registrar?: typeof logInvocation;
  custo?: typeof computeCost;
}

export async function chamarModeloDeTraducao(
  admin: SupabaseClient,
  c: ChamadaDeTraducao,
  deps: Dependencias = {},
): Promise<string | null> {
  const modelo = await (deps.modelo ?? modeloLeveDaEmpresa)(admin, c.organizationId);
  if (!modelo) return null;
  const gerar = deps.gerar ?? generateText;
  const registrar = deps.registrar ?? logInvocation;
  const nomeDoModelo = typeof modelo === "string" ? modelo : (modelo as { modelId?: string }).modelId ?? "desconhecido";

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const inicio = Date.now();
    try {
      const r = await gerar({
        model: modelo,
        abortSignal: AbortSignal.timeout(TETO_POR_TENTATIVA_MS),
        system: c.system,
        prompt: c.prompt,
        maxRetries: 0,
      });
      const entrada = r.usage?.inputTokens ?? 0;
      const saida = r.usage?.outputTokens ?? 0;
      let custo: number | null = null;
      try {
        custo = await (deps.custo ?? computeCost)({ model: nomeDoModelo, promptTokens: entrada, completionTokens: saida });
      } catch {
        custo = null;
      }
      registrar({
        organization_id: c.organizationId,
        agent_id: null,
        conversation_id: c.conversationId ?? null,
        message_id: c.messageId ?? null,
        invocation_kind: c.kind,
        model: nomeDoModelo,
        prompt_tokens: entrada,
        completion_tokens: saida,
        latency_ms: Date.now() - inicio,
        cost_cents: custo,
      });
      const texto = r.text.trim();
      if (texto) return texto;
    } catch (err) {
      registrar({
        organization_id: c.organizationId,
        agent_id: null,
        conversation_id: c.conversationId ?? null,
        message_id: c.messageId ?? null,
        invocation_kind: c.kind,
        model: nomeDoModelo,
        prompt_tokens: 0,
        completion_tokens: 0,
        latency_ms: Date.now() - inicio,
        cost_cents: null,
        error_payload: { message: err instanceof Error ? err.message : String(err), tentativa },
      });
      logger.warn("[traducao] chamada ao modelo falhou", {
        kind: c.kind,
        tentativa,
        motivo: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
