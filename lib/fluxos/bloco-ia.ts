import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject, generateText, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { loadCredential } from "@/lib/ai/credentials";
import { resolveLanguageModel, type ModelId } from "@/lib/ai/gateway";
import { instanciar } from "@/lib/ai/gateway-binding";
import type { PROVEDORES_DO_BLOCO_DE_IA } from "@/lib/followup/blocos-do-fluxo";

/**
 * Bloco de IA dos fluxos (fork jhoow, Fase D): uma chamada de modelo dentro do
 * fluxo — responder o lead, extrair um dado para um campo, ou escolher por qual
 * saída o contato segue (as `condicionais`).
 *
 * A chave NUNCA mora no grafo (decisão do dono): o bloco usa a credencial que a
 * empresa cadastrou em IA › Credenciais — a escolhida no bloco, ou a ativa do
 * provedor — e, sem nenhuma, a chave da instalação para aquele provedor.
 *
 * Nunca lança: falha vira `{ ok: false }`, que o motor manda pela saída
 * "Falhou". Uma IA fora do ar não pode prender o lead no bloco.
 */

export type ProvedorDoBloco = (typeof PROVEDORES_DO_BLOCO_DE_IA)[number];

export interface PedidoDeIa {
  provedor: ProvedorDoBloco;
  credencialId: string | null;
  modelo: string;
  /** As instruções, já interpoladas. */
  instrucoes: string;
  /** O que o lead disse (ou a variável escolhida), já interpolado. */
  mensagem: string;
  condicionais: Array<{ id: string; nome: string; descricao: string }>;
  entender: { audio: boolean; imagem: boolean; pdf: boolean };
  /** Quantas mensagens recentes da conversa entram como contexto; 0 = nenhuma. */
  historico: number;
}

export type RespostaDaIa =
  | { ok: true; resposta: string; rota: string | null; modelo: string; origem: "credencial" | "instalacao" }
  | { ok: false; detalhe: string };

const BUCKET = "whatsapp-media";
const LIMITE_DE_MIDIA = 10 * 1024 * 1024;
const TEMPO_LIMITE_MS = 60_000;
/** Rota que a IA devolve quando nenhuma condicional serve. */
export const NENHUMA_ROTA = "nenhuma";

async function modeloDoBloco(
  admin: SupabaseClient,
  org: string,
  pedido: PedidoDeIa,
): Promise<{ model: LanguageModel; origem: "credencial" | "instalacao" } | { erro: string }> {
  let credencialId = pedido.credencialId;
  if (!credencialId) {
    // Admin client: a organização vai no filtro, sempre.
    const { data } = await admin
      .from("ai_provider_credentials")
      .select("id")
      .eq("organization_id", org)
      .eq("provider", pedido.provedor)
      .eq("is_active", true)
      .not("validated_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    credencialId = (data?.id as string | undefined) ?? null;
  }
  if (credencialId) {
    try {
      const cred = await loadCredential(credencialId, org);
      const model = instanciar(cred.provider, cred.apiKey, pedido.modelo, cred.baseUrl);
      if (model) return { model, origem: "credencial" };
      return { erro: `provedor_sem_suporte:${cred.provider}` };
    } catch (e) {
      return { erro: `credencial_indisponivel:${e instanceof Error ? e.message : "?"}` };
    }
  }
  // Último degrau: a chave da instalação, só para os provedores nativos.
  const daInstalacao = resolveLanguageModel(`${pedido.provedor}/${pedido.modelo}` as ModelId);
  if (daInstalacao) return { model: daInstalacao, origem: "instalacao" };
  return { erro: `sem_credencial:${pedido.provedor}` };
}

interface LinhaDeMensagem {
  direction: string;
  type: string | null;
  body: string | null;
  media_derived_text: string | null;
  media_storage_path: string | null;
  media_mime: string | null;
  media_size_bytes: number | null;
}

/** As mensagens recentes da conversa, da mais antiga para a mais nova. */
async function ultimasMensagens(admin: SupabaseClient, org: string, conversa: string, n: number): Promise<LinhaDeMensagem[]> {
  const { data, error } = await admin
    .from("messages")
    .select("direction, type, body, media_derived_text, media_storage_path, media_mime, media_size_bytes")
    .eq("organization_id", org)
    .eq("conversation_id", conversa)
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaDeMensagem[]).reverse();
}

function textoDaLinha(m: LinhaDeMensagem): string {
  return (m.body ?? m.media_derived_text ?? "").trim();
}

/** O contexto, a mídia pedida e a mensagem — a parte "user" da chamada. */
export async function montarConteudo(
  admin: SupabaseClient,
  org: string,
  conversa: string,
  pedido: PedidoDeIa,
): Promise<ModelMessage["content"]> {
  const querMidia = pedido.entender.audio || pedido.entender.imagem || pedido.entender.pdf;
  const linhas = pedido.historico > 0 || querMidia ? await ultimasMensagens(admin, org, conversa, Math.max(pedido.historico, 10)) : [];
  const partes: Array<{ type: "text"; text: string } | { type: "file"; data: Buffer; mediaType: string }> = [];

  if (pedido.historico > 0) {
    const recentes = linhas.slice(-pedido.historico).filter((m) => textoDaLinha(m));
    if (recentes.length > 0) {
      const transcricao = recentes
        .map((m) => `${m.direction === "inbound" ? "Cliente" : "Empresa"}: ${textoDaLinha(m)}`)
        .join("\n");
      partes.push({ type: "text", text: `Conversa recente:\n${transcricao}` });
    }
  }

  // Mídia: só a da última mensagem do lead — a de três mensagens atrás já foi tratada.
  const ultimaDoLead = [...linhas].reverse().find((m) => m.direction === "inbound");
  if (ultimaDoLead?.media_storage_path) {
    const mime = (ultimaDoLead.media_mime ?? "").split(";")[0]!.trim().toLowerCase();
    const ehImagem = ultimaDoLead.type === "image" && mime.startsWith("image/") && pedido.entender.imagem;
    const ehPdf = mime === "application/pdf" && pedido.entender.pdf;
    const ehAudio = ultimaDoLead.type === "audio" && pedido.entender.audio;
    if (ehAudio) {
      // A transcrição é feita pelo worker de mídia; o bloco usa o que já existe.
      const t = (ultimaDoLead.media_derived_text ?? "").trim();
      partes.push({ type: "text", text: t ? `Transcrição do áudio do cliente: ${t}` : "O cliente mandou um áudio que ainda não foi transcrito." });
    } else if ((ehImagem || ehPdf) && (ultimaDoLead.media_size_bytes ?? 0) <= LIMITE_DE_MIDIA) {
      const dl = await admin.storage.from(BUCKET).download(ultimaDoLead.media_storage_path);
      if (!dl.error && dl.data) {
        partes.push({ type: "file", data: Buffer.from(await dl.data.arrayBuffer()), mediaType: ehImagem ? mime : "application/pdf" });
      }
    }
  }

  partes.push({ type: "text", text: pedido.mensagem || "(sem texto)" });
  return partes as ModelMessage["content"];
}

export async function chamarBlocoDeIa(
  admin: SupabaseClient,
  org: string,
  conversa: string,
  pedido: PedidoDeIa,
): Promise<RespostaDaIa> {
  try {
    const resolvido = await modeloDoBloco(admin, org, pedido);
    if ("erro" in resolvido) return { ok: false, detalhe: resolvido.erro };
    const content = await montarConteudo(admin, org, conversa, pedido);
    const messages = [{ role: "user", content }] as ModelMessage[];
    const base = {
      model: resolvido.model,
      messages,
      maxOutputTokens: 1500,
      abortSignal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    };

    if (pedido.condicionais.length === 0) {
      const r = await generateText({ ...base, ...(pedido.instrucoes ? { system: pedido.instrucoes } : {}) });
      return { ok: true, resposta: r.text.trim(), rota: null, modelo: pedido.modelo, origem: resolvido.origem };
    }

    const ids = pedido.condicionais.map((c) => c.id);
    const rotas = pedido.condicionais.map((c) => `- "${c.id}": ${c.nome} — ${c.descricao}`).join("\n");
    const system = [
      pedido.instrucoes,
      `Além do texto da resposta, escolha a ROTA que descreve a mensagem do cliente:\n${rotas}\n- "${NENHUMA_ROTA}": nenhuma das anteriores.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const r = await generateObject({
      ...base,
      system,
      schema: z.object({
        resposta: z.string().describe("O texto da resposta, como pedido nas instruções."),
        rota: z.enum([NENHUMA_ROTA, ...ids] as [string, ...string[]]),
      }),
    });
    const rota = r.object.rota === NENHUMA_ROTA ? null : r.object.rota;
    return { ok: true, resposta: r.object.resposta.trim(), rota, modelo: pedido.modelo, origem: resolvido.origem };
  } catch (e) {
    return { ok: false, detalhe: (e instanceof Error ? e.message : "erro").slice(0, 400) };
  }
}
