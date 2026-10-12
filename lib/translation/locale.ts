import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarModeloDeTraducao } from "./llm";
import { localeDoTelefone, normalizarLocale } from "./idiomas";

/**
 * O IDIOMA DO CONTATO, em cascata (fork jhoow, 9022):
 *
 *   1. MANUAL sempre vence — `contacts.locale` com `locale_source='manual'`, ou o
 *      campo `idioma_contato` da ficha. Locale antigo sem origem também conta como
 *      manual: alguém o gravou, e a cascata não sobrescreve escolha de gente.
 *   2. DDI — o código do país do telefone (+1 en-US, +351 pt-PT, +55 pt-BR…).
 *   3. DETECTADO — o modelo lê a última mensagem recebida; o resultado fica em
 *      cache (`locale_detected` + `locale_detected_at`) e não se pergunta de novo.
 */

export type OrigemDoIdioma = "manual" | "ddi" | "detected";

export interface ContatoDoIdioma {
  id: string;
  organization_id: string;
  locale: string | null;
  locale_source: OrigemDoIdioma | null;
  locale_detected: string | null;
  phone_number: string | null;
  custom_fields: Record<string, unknown> | null;
}

export interface IdiomaResolvido {
  locale: string | null;
  source: OrigemDoIdioma | null;
}

/** A cascata sem banco e sem modelo: o que JÁ se sabe do contato. */
export function idiomaConhecido(c: ContatoDoIdioma): IdiomaResolvido {
  const doCampo = normalizarLocale(
    typeof c.custom_fields?.idioma_contato === "string" ? c.custom_fields.idioma_contato : null,
  );
  if (doCampo) return { locale: doCampo, source: "manual" };
  const gravado = normalizarLocale(c.locale);
  if (gravado && (c.locale_source === "manual" || c.locale_source === null)) return { locale: gravado, source: "manual" };
  const ddi = localeDoTelefone(c.phone_number);
  if (ddi) return { locale: ddi, source: "ddi" };
  const detectado = normalizarLocale(c.locale_detected);
  if (detectado) return { locale: detectado, source: "detected" };
  return { locale: null, source: null };
}

const COLUNAS = "id, organization_id, locale, locale_source, locale_detected, phone_number, custom_fields";

export interface OpcoesDaResolucao {
  /** Pode chamar o modelo quando nem manual nem DDI respondem. Padrão: sim. */
  detectar?: boolean;
  /** Texto para a detecção; ausente = a última mensagem recebida do contato. */
  texto?: string | null;
  detector?: (admin: SupabaseClient, org: string, texto: string) => Promise<string | null>;
}

/**
 * `resolveContactLocale(contactId)`: aplica a cascata e PERSISTE o que mudou
 * (`locale` + `locale_source`), para a próxima leitura não refazer o caminho.
 */
export async function resolveContactLocale(
  admin: SupabaseClient,
  contactId: string,
  opcoes: OpcoesDaResolucao = {},
): Promise<IdiomaResolvido> {
  const { data } = await admin.from("contacts").select(COLUNAS).eq("id", contactId).maybeSingle();
  const c = data as ContatoDoIdioma | null;
  if (!c) return { locale: null, source: null };

  let r = idiomaConhecido(c);
  if (!r.locale && opcoes.detectar !== false) {
    const texto = opcoes.texto ?? (await ultimaMensagemRecebida(admin, c.organization_id, c.id));
    if (texto && texto.trim().length >= 3) {
      const detectado = await (opcoes.detector ?? detectarIdioma)(admin, c.organization_id, texto);
      if (detectado) {
        await admin
          .from("contacts")
          .update({ locale_detected: detectado, locale_detected_at: new Date().toISOString() })
          .eq("id", c.id);
        r = { locale: detectado, source: "detected" };
      }
    }
  }

  // Grava só o que a cascata decidiu e o banco ainda não tem. Manual vindo do
  // campo da ficha também desce para a coluna, que é o que o resto lê.
  if (r.locale && (r.locale !== c.locale || r.source !== c.locale_source)) {
    await admin.from("contacts").update({ locale: r.locale, locale_source: r.source }).eq("id", c.id);
  }
  return r;
}

async function ultimaMensagemRecebida(admin: SupabaseClient, org: string, contactId: string): Promise<string | null> {
  const { data } = await admin
    .from("messages")
    .select("body")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .not("body", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { body: string | null } | null)?.body ?? null;
}

/** Detecção pelo modelo da empresa. `null` quando não há modelo ou a resposta não é um locale. */
export async function detectarIdioma(admin: SupabaseClient, org: string, texto: string): Promise<string | null> {
  const resposta = await chamarModeloDeTraducao(admin, {
    organizationId: org,
    kind: "locale_detect",
    system:
      "Você identifica o idioma de mensagens de WhatsApp. Responda APENAS com o código BCP-47 " +
      "(por exemplo pt-BR, pt-PT, en-US, en-GB, es-ES, nl-NL, fr-FR, de-DE, it-IT). Sem explicação.",
    prompt: texto.slice(0, 1000),
  });
  return normalizarLocale(resposta?.split(/\s/)[0]?.replace(/[^A-Za-z-_]/g, "") ?? null);
}
