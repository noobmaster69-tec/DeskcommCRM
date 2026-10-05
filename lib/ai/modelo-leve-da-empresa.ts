import type { SupabaseClient } from "@supabase/supabase-js";
import type { LanguageModel } from "ai";
import { loadCredential } from "@/lib/ai/credentials";
import { instanciar } from "@/lib/ai/gateway-binding";

/**
 * Tarefas pequenas de texto que a TELA pede (fork jhoow): traduzir um fluxo,
 * resumir uma conversa. Usa a credencial da EMPRESA (IA › Credenciais) — nenhuma
 * chave da instalação é gasta com conteúdo de cliente — e um modelo leve.
 */

/** Modelo leve por provedor, quando a credencial não lista os modelos dela. */
const MODELO_LEVE: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
  requesty: "openai/gpt-4o-mini",
};
const PREFERENCIA = ["anthropic", "openai", "google", "openrouter", "deepseek", "requesty", "custom"];

/**
 * O modelo LEVE da empresa (traduzir fluxo, resumir conversa): a credencial ativa e validada mais
 * preferida (Anthropic > OpenAI > Google > …). `null` = nenhuma cadastrada —
 * a tela pede para configurar um provedor em Credenciais.
 */
export async function modeloLeveDaEmpresa(admin: SupabaseClient, org: string): Promise<LanguageModel | null> {
  const { data } = await admin
    .from("ai_provider_credentials")
    .select("id, provider, models_available")
    .eq("organization_id", org)
    .eq("is_active", true)
    .not("validated_at", "is", null);
  const creds = ((data ?? []) as Array<{ id: string; provider: string; models_available: string[] | null }>).sort(
    (a, b) => PREFERENCIA.indexOf(a.provider) - PREFERENCIA.indexOf(b.provider),
  );
  for (const c of creds) {
    const leve = MODELO_LEVE[c.provider];
    const lista = c.models_available ?? [];
    const modelo = leve && (lista.length === 0 || lista.includes(leve)) ? leve : (lista[0] ?? leve);
    if (!modelo) continue;
    try {
      const cred = await loadCredential(c.id, org);
      const model = instanciar(cred.provider, cred.apiKey, modelo, cred.baseUrl);
      if (model) return model;
    } catch {
      // credencial que não abre: tenta a próxima
    }
  }
  return null;
}

