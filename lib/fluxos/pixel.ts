import type { SupabaseClient } from "@supabase/supabase-js";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { enviarEventoDoFluxo, type EventoDoFluxo } from "@/lib/plataformas-de-anuncio/meta/conversions";

/**
 * Bloco PIXEL dos fluxos (fork jhoow, Fase D): manda um evento para a Meta pela
 * conexão de conversões da organização (Configurações › Conversões) — o mesmo
 * transporte da venda do funil, não uma segunda integração.
 *
 * Nunca lança e nunca prende o contato: o resultado vira evento do fluxo
 * (`pixel` / `pixel_falhou`) e o fluxo segue. Um pixel mal configurado não pode
 * calar a conversa de venda.
 */

/**
 * "R$ 29,90" → 29.9; "1.234,56" → 1234.56; "320" → 320; "29.90" → 29.9.
 * `null` quando não há número utilizável.
 */
export function lerValorMonetario(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpo)) return null;
  let normal: string;
  const virgula = limpo.lastIndexOf(",");
  const ponto = limpo.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) {
    // O separador que vem por último é o decimal.
    normal = virgula > ponto ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, "");
  } else if (virgula >= 0) {
    normal = /^-?\d{1,3}(,\d{3})+$/.test(limpo) ? limpo.replace(/,/g, "") : limpo.replace(",", ".");
  } else {
    normal = /^-?\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, "") : limpo;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export interface PedidoDePixel {
  evento: EventoDoFluxo["evento"];
  eventoId: string;
  /** Já interpolado. */
  valor: string | null;
  moeda: string;
  pageId: string | null;
  agora: Date;
}

export async function enviarPixelDoFluxo(
  admin: SupabaseClient,
  org: string,
  contactId: string,
  pedido: PedidoDePixel,
): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const leitura = await lerCredencial(admin, org, "meta_ads");
    if (!leitura.ok) return { ok: false, detalhe: `sem_conexao_meta:${leitura.motivo}` };

    // Sempre com a organização no filtro: o worker é service role.
    const { data, error } = await admin
      .from("contacts")
      .select("phone_number, source_metadata")
      .eq("organization_id", org)
      .eq("id", contactId)
      .maybeSingle();
    if (error) return { ok: false, detalhe: `contato_ilegivel:${error.message}` };
    const meta =
      data?.source_metadata && typeof data.source_metadata === "object"
        ? (data.source_metadata as Record<string, unknown>)
        : {};
    const clique =
      meta.ad_platform === "meta_ads" && typeof meta.ad_source_id === "string" && meta.ad_source_id.trim()
        ? meta.ad_source_id.trim()
        : null;
    const telefone = typeof data?.phone_number === "string" ? data.phone_number.replace(/\D/g, "") || null : null;

    const valor = pedido.valor ? lerValorMonetario(pedido.valor) : null;
    if (pedido.evento === "Purchase" && (valor === null || valor <= 0))
      return { ok: false, detalhe: `valor_invalido:${pedido.valor ?? ""}` };

    const r = await enviarEventoDoFluxo(leitura.credencial, {
      evento: pedido.evento,
      eventoId: pedido.eventoId,
      ocorridoEm: pedido.agora,
      cliqueDeOrigem: clique,
      telefone,
      valor,
      moeda: pedido.moeda,
      pageId: pedido.pageId,
    });
    const via = clique ? "anuncio" : "telefone";
    if (r.tipo === "ok") return { ok: true, detalhe: `enviado:${via}` };
    return { ok: false, detalhe: `${r.tipo}:${"detalhe" in r ? r.detalhe : ""}`.slice(0, 400) };
  } catch (erro) {
    return { ok: false, detalhe: erro instanceof Error ? erro.message.slice(0, 400) : "erro" };
  }
}
