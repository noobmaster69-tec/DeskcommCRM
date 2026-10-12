import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarModeloDeTraducao } from "./llm";
import { mesmaLingua } from "./idiomas";
import { promptDeTraducao } from "./traduzir-mensagem";

/**
 * TRADUÇÃO DE SAÍDA (fork jhoow, Fase C): o atendente escreve no idioma dele e
 * a mensagem sai no do cliente. A prévia do composer chama isto a cada pausa
 * de digitação (500ms), então o mesmo texto não pode custar duas chamadas:
 * cache em memória por processo (org + par + texto), com teto de tamanho.
 */

const TETO_DO_CACHE = 500;
const cache = new Map<string, string>();

export function _limparCacheDeSaida(): void {
  cache.clear();
}

export async function traduzirTextoDeSaida(
  admin: SupabaseClient,
  e: { organizationId: string; conversationId: string; texto: string; de: string; para: string },
  chamar: typeof chamarModeloDeTraducao = chamarModeloDeTraducao,
): Promise<string | null> {
  const texto = e.texto.trim();
  if (!texto) return null;
  if (mesmaLingua(e.de, e.para)) return texto;
  const chave = `${e.organizationId}|${e.de}|${e.para}|${texto}`;
  const guardada = cache.get(chave);
  if (guardada) return guardada;
  const r = await chamar(admin, {
    organizationId: e.organizationId,
    kind: "message_translate",
    system: promptDeTraducao(e.de, e.para),
    prompt: texto,
    conversationId: e.conversationId,
  });
  if (!r) return null;
  if (cache.size >= TETO_DO_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(chave, r);
  return r;
}

export interface ChavesDaTraducao {
  entrada: boolean;
  saida: boolean;
}

/** As chaves da conversa (`metadata.traducao`). Padrão: as duas ligadas. */
export function chavesDaConversa(metadata: Record<string, unknown> | null | undefined): ChavesDaTraducao {
  const t = ((metadata ?? {}).traducao ?? {}) as Record<string, unknown>;
  return { entrada: t.entrada !== false, saida: t.saida !== false };
}
