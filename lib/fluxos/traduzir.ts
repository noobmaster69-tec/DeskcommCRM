import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { loadCredential } from "@/lib/ai/credentials";
import { instanciar } from "@/lib/ai/gateway-binding";
import type { FlowGraph } from "@/lib/followup/graph-schema";

/**
 * TRADUZIR UM FLUXO (fork jhoow, item 2 — o "Traduzir" do menu "⋯").
 *
 * Só os textos que o CLIENTE lê mudam: o texto e a legenda dos itens da
 * Mensagem e a mensagem antes do Aguardar resposta. Estrutura, ids, ligações,
 * etiquetas, nomes de saída e configuração ficam intactos — o fluxo traduzido
 * é o mesmo fluxo, falando outra língua. Variáveis `{nome}` passam sem tradução.
 *
 * O modelo é o da empresa (IA › Credenciais), como no Bloco de IA: nenhuma
 * chave da instalação é gasta para traduzir conteúdo de cliente.
 */

export const IDIOMAS_DE_TRADUCAO = ["en", "es", "pt"] as const;
export type IdiomaDeTraducao = (typeof IDIOMAS_DE_TRADUCAO)[number];

export const NOME_DO_IDIOMA: Record<IdiomaDeTraducao, string> = {
  en: "inglês (English)",
  es: "espanhol (Español)",
  pt: "português do Brasil",
};

/** Teto de textos por tradução: um fluxo de venda grande tem ~100 blocos. */
export const MAX_TEXTOS = 400;

type Local = { no: number; item?: number; campo: "texto" | "legenda" | "mensagem_antes" };

/** Os textos do cliente, na ordem, com o endereço de cada um no grafo. */
export function textosDoFluxo(grafo: FlowGraph): { locais: Local[]; textos: string[] } {
  const locais: Local[] = [];
  const textos: string[] = [];
  grafo.nodes.forEach((n, no) => {
    if (n.type === "mensagem") {
      n.config.itens.forEach((it, item) => {
        if (it.tipo === "texto" && it.texto.trim()) {
          locais.push({ no, item, campo: "texto" });
          textos.push(it.texto);
        } else if ((it.tipo === "imagem" || it.tipo === "video") && it.legenda?.trim()) {
          locais.push({ no, item, campo: "legenda" });
          textos.push(it.legenda);
        }
      });
    } else if (n.type === "aguardar_resposta" && n.config.mensagem_antes?.trim()) {
      locais.push({ no, campo: "mensagem_antes" });
      textos.push(n.config.mensagem_antes);
    }
  });
  return { locais: locais.slice(0, MAX_TEXTOS), textos: textos.slice(0, MAX_TEXTOS) };
}

/** Uma cópia do grafo com cada texto trocado pela tradução de mesmo índice. */
export function aplicarTraducoes(grafo: FlowGraph, locais: Local[], traducoes: string[]): FlowGraph {
  const copia = structuredClone(grafo);
  locais.forEach((l, i) => {
    const novo = traducoes[i];
    if (typeof novo !== "string" || !novo.trim()) return;
    const n = copia.nodes[l.no]!;
    if (n.type === "mensagem" && l.item !== undefined) {
      const it = n.config.itens[l.item]!;
      if (l.campo === "texto" && it.tipo === "texto") it.texto = novo;
      if (l.campo === "legenda" && (it.tipo === "imagem" || it.tipo === "video")) it.legenda = novo;
    } else if (n.type === "aguardar_resposta" && l.campo === "mensagem_antes") {
      n.config.mensagem_antes = novo;
    }
  });
  return copia;
}

/** As variáveis `{nome}` do texto — a tradução tem de devolver as mesmas. */
export function variaveisDe(texto: string): string[] {
  return (texto.match(/\{[^{}\s]+\}/g) ?? []).sort();
}

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
 * O modelo da empresa para traduzir: a credencial ativa e validada mais
 * preferida (Anthropic > OpenAI > Google > …). `null` = nenhuma cadastrada —
 * a tela pede para configurar um provedor em Credenciais.
 */
export async function modeloParaTraduzir(admin: SupabaseClient, org: string): Promise<LanguageModel | null> {
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

/** Traduz em UMA chamada, devolvendo a lista na mesma ordem e tamanho. */
export async function traduzirTextos(
  model: LanguageModel,
  textos: string[],
  idioma: IdiomaDeTraducao,
): Promise<string[]> {
  const r = await generateObject({
    model,
    abortSignal: AbortSignal.timeout(90_000),
    system:
      `Você traduz mensagens de WhatsApp de um fluxo de atendimento para ${NOME_DO_IDIOMA[idioma]}. ` +
      "Devolva EXATAMENTE uma tradução por texto recebido, na mesma ordem. Mantenha intactos: " +
      "variáveis entre chaves como {nome} ou {campo}, emojis, quebras de linha, *negrito*, _itálico_, " +
      "links e números. Tom natural de conversa, sem explicar nada.",
    prompt: JSON.stringify({ textos }),
    schema: z.object({ traducoes: z.array(z.string()) }),
  });
  const out = r.object.traducoes;
  // Lista torta ou variável perdida: aquele texto fica no original — melhor
  // um trecho sem traduzir do que uma mensagem que quebra `{nome}`.
  return textos.map((orig, i) => {
    const tr = out[i];
    if (typeof tr !== "string" || !tr.trim()) return orig;
    return JSON.stringify(variaveisDe(tr)) === JSON.stringify(variaveisDe(orig)) ? tr : orig;
  });
}
