import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchParaDestinoDaOrganizacao } from "@/lib/automation/destinos-internos-autorizados";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { URL_PROVISORIA, type MidiaParaCopiar } from "./importar-leona";

/**
 * Traz a mídia de um fluxo importado do Leona para o Storage da organização
 * (`<org>/fluxos/<fluxo>/…`, o mesmo lugar do upload do editor). Depois disso o
 * fluxo não depende mais da CDN do Leona.
 *
 * Download pela régua de destino da organização (sem IP interno, sem seguir
 * redirect) — o link vem de um JSON colado por alguém, não de nós.
 *
 * Falha de um arquivo não derruba a importação: link https fica como link (a
 * cadeia de envio ainda o baixa na hora), e a figurinha em `data:` que não
 * subiu sai do bloco. Os dois viram aviso.
 */
const BUCKET = "whatsapp-media";
const TEMPO_LIMITE_MS = 30_000;
const SIMULTANEOS = 3;

type Item = { id: string; tipo: string; midia?: Record<string, unknown> };
type No = { id: string; config: { itens?: Item[] } };

async function baixar(origem: string, mimeDeclarado: string | null): Promise<{ bytes: Buffer; mime: string }> {
  if (origem.startsWith("data:")) {
    const virgula = origem.indexOf(",");
    const cabeca = origem.slice(5, virgula);
    if (!cabeca.endsWith(";base64")) throw new Error("data_sem_base64");
    const bytes = Buffer.from(origem.slice(virgula + 1), "base64");
    return { bytes, mime: cabeca.replace(";base64", "") || "application/octet-stream" };
  }
  const resposta = await fetchParaDestinoDaOrganizacao()(origem, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  if (!resposta.ok) throw new Error(`http_${resposta.status}`);
  if (Number(resposta.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) throw new Error("grande_demais");
  const bytes = Buffer.from(await resposta.arrayBuffer());
  const mime = (resposta.headers.get("content-type") ?? "").split(";")[0]!.trim() || mimeDeclarado || "application/octet-stream";
  return { bytes, mime };
}

export async function copiarMidiaImportada(
  admin: SupabaseClient,
  org: string,
  fluxoId: string,
  grafo: FlowGraph,
  midias: MidiaParaCopiar[],
): Promise<{ grafo: FlowGraph; avisos: string[] }> {
  const avisos: string[] = [];
  const nos = grafo.nodes as unknown as No[];
  const itemDe = (m: MidiaParaCopiar) => nos.find((n) => n.id === m.noId)?.config.itens?.find((i) => i.id === m.itemId);
  const remover: MidiaParaCopiar[] = [];
  let copiadas = 0;

  const fila = [...midias];
  async function trabalhador() {
    for (let m = fila.shift(); m; m = fila.shift()) {
      const item = itemDe(m);
      if (!item?.midia) continue;
      try {
        const { bytes, mime } = await baixar(m.origem, m.mime);
        if (bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES) throw new Error("tamanho_invalido");
        const caminho = `${org}/fluxos/${fluxoId}/${randomUUID()}.${extFromMime(mime)}`;
        const { error } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, upsert: false });
        if (error) throw new Error(error.message);
        item.midia = { storage_path: caminho, mime, ...(m.nome ? { nome_arquivo: m.nome.slice(0, 200) } : {}) };
        copiadas++;
      } catch {
        if (String(item.midia.url ?? "").startsWith(URL_PROVISORIA)) remover.push(m);
        else avisos.push(`um arquivo não pôde ser copiado e segue pelo link do Leona: ${m.nome ?? m.origem.slice(0, 80)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: SIMULTANEOS }, trabalhador));

  for (const m of remover) {
    const no = nos.find((n) => n.id === m.noId);
    if (!no?.config.itens) continue;
    no.config.itens = no.config.itens.filter((i) => i.id !== m.itemId);
    if (no.config.itens.length === 0) no.config.itens = [{ id: "i1", tipo: "texto", texto: "(complete esta mensagem)" } as Item];
    avisos.push("uma figurinha não pôde ser copiada e saiu do bloco.");
  }
  if (copiadas > 0) avisos.unshift(`${copiadas} arquivo(s) copiado(s) do Leona para cá.`);
  return { grafo, avisos };
}
