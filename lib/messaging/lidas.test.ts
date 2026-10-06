import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { WahaClient } from "@/lib/waha/client";
import { esquecerPreferencia, lerPreferencias, marcarComoLidas } from "./lidas";

/** Marcar como lidas ao responder (fork jhoow): só quando ligado e quando há recebida pendente. */
function falso(settings: Record<string, unknown>, ultima: "inbound" | "outbound" | null, historico?: Array<{ direction: string; external_id: string | null }>) {
  const linhas = historico ?? (ultima ? [{ direction: ultima, external_id: null }] : []);
  const filtros: Array<[string, unknown]> = [];
  const db = {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        eq: chain,
        order: chain,
        limit: () =>
          Object.assign(Promise.resolve({ data: tabela === "messages" ? linhas : [] }), {
            neq: (k: string, v: unknown) => (filtros.push([k, v]), Promise.resolve({ data: linhas })),
          }),
        maybeSingle: async () => ({ data: { settings } }),
      });
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, filtros };
}

describe("marcarComoLidas", () => {
  const base = { conversationId: "c1", sessionRef: "s1", recipient: "5511999990001@c.us" };

  it("padrão LIGADO; marca quando a última (fora a que sai) é do contato", async () => {
    esquecerPreferencia("o1");
    const markSeen = vi.fn(async () => {});
    const { db, filtros } = falso({}, "inbound");
    expect(await marcarComoLidas(db, { ...base, organizationId: "o1", canal: { markSeen }, ignorarMensagemId: "m-saindo" })).toBe(true);
    expect(markSeen).toHaveBeenCalledWith({ organizationId: "o1", sessionRef: "s1", recipient: "5511999990001@c.us" });
    expect(filtros).toEqual([["id", "m-saindo"]]);
  });

  it("manda os ids das recebidas pendentes (o NOWEB sem store só marca assim)", async () => {
    esquecerPreferencia("o5");
    const markSeen = vi.fn(async () => {});
    const { db } = falso({}, null, [
      { direction: "inbound", external_id: "false_x@c.us_C" },
      { direction: "inbound", external_id: "false_x@c.us_B" },
      { direction: "outbound", external_id: "true_x@c.us_Z" },
      { direction: "inbound", external_id: "false_x@c.us_A" },
    ]);
    expect(await marcarComoLidas(db, { ...base, organizationId: "o5", canal: { markSeen } })).toBe(true);
    expect(markSeen).toHaveBeenCalledWith(expect.objectContaining({ messageIds: ["false_x@c.us_B", "false_x@c.us_C"] }));
  });

  it("nada pendente (última é nossa) = não chama o canal", async () => {
    esquecerPreferencia("o2");
    const markSeen = vi.fn(async () => {});
    expect(await marcarComoLidas(falso({}, "outbound").db, { ...base, organizationId: "o2", canal: { markSeen } })).toBe(false);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("preferência DESLIGADA = não marca", async () => {
    esquecerPreferencia("o3");
    const markSeen = vi.fn(async () => {});
    const { db } = falso({ marcar_lidas_ao_responder: false }, "inbound");
    expect(await marcarComoLidas(db, { ...base, organizationId: "o3", canal: { markSeen } })).toBe(false);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("canal sem suporte ou que falha: silêncio, nunca lança", async () => {
    esquecerPreferencia("o4");
    expect(await marcarComoLidas(falso({}, "inbound").db, { ...base, organizationId: "o4", canal: {} })).toBe(false);
    const quebra = vi.fn(async () => {
      throw new Error("waha_500");
    });
    expect(await marcarComoLidas(falso({}, "inbound").db, { ...base, organizationId: "o4", canal: { markSeen: quebra } })).toBe(false);
  });

  it("lerPreferencias: padrão ligado; booleano gravado manda", () => {
    expect(lerPreferencias(null)).toEqual({ marcar_lidas_ao_responder: true });
    expect(lerPreferencias({ marcar_lidas_ao_responder: false })).toEqual({ marcar_lidas_ao_responder: false });
    expect(lerPreferencias({ marcar_lidas_ao_responder: "x" })).toEqual({ marcar_lidas_ao_responder: true });
  });
});

describe("WAHA sendSeen", () => {
  let servidor: Server;
  let url = "";
  const pedidos: Array<{ url: string; corpo: unknown; chave: string | undefined }> = [];
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (c: Buffer) => partes.push(c));
      req.on("end", () => {
        pedidos.push({ url: req.url ?? "", corpo: JSON.parse(Buffer.concat(partes).toString() || "{}"), chave: req.headers["x-api-key"] as string });
        res.writeHead(200, { "content-type": "application/json" }).end("{}");
      });
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(() => servidor.close());

  it("POST /api/sendSeen com sessão, chat e os ids das mensagens", async () => {
    await new WahaClient(url, "chave").sendSeen("sessao-1", "5511999990001@c.us", ["false_5511999990001@c.us_ABC"]);
    await new WahaClient(url, "chave").sendSeen("sessao-1", "5511999990001@c.us");
    expect(pedidos).toEqual([
      { url: "/api/sendSeen", corpo: { session: "sessao-1", chatId: "5511999990001@c.us", messageIds: ["false_5511999990001@c.us_ABC"] }, chave: "chave" },
      { url: "/api/sendSeen", corpo: { session: "sessao-1", chatId: "5511999990001@c.us" }, chave: "chave" },
    ]);
  });
});
