import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumoDaTraducao, inicioDoMes, textoDoConsumo } from "./consumo";

function banco(linhas: unknown[]) {
  const filtros: unknown[][] = [];
  const q: Record<string, unknown> = {};
  const enc = (nome: string) => (...a: unknown[]) => {
    filtros.push([nome, ...a]);
    return q;
  };
  Object.assign(q, { select: enc("select"), eq: enc("eq"), in: enc("in"), gte: enc("gte") });
  q.limit = async () => ({ data: linhas });
  return { admin: { from: () => q } as unknown as SupabaseClient, filtros };
}

describe("consumo da tradução", () => {
  it("conta só as traduções que deram certo e soma o custo de tudo", async () => {
    const { admin, filtros } = banco([
      { purpose: "message_translate", status: "ok", cost_cents: 0.4 },
      { purpose: "message_translate", status: "ok", cost_cents: "0.6" },
      { purpose: "message_translate", status: "erro", cost_cents: null },
      { purpose: "locale_detect", status: "ok", cost_cents: 1 },
    ]);
    const c = await consumoDaTraducao(admin, "o1", new Date("2026-10-12T15:00:00Z"));
    expect(c).toEqual({ mensagens: 2, custoEmDolares: 0.02 });
    expect(filtros).toContainEqual(["gte", "created_at", "2026-10-01T00:00:00.000Z"]);
    expect(textoDoConsumo(c)).toBe("Mensagens traduzidas este mês: 2 · Custo estimado: $0.02");
  });
  it("o mês começa no dia 1º", () => {
    expect(inicioDoMes(new Date("2026-02-28T23:00:00Z"))).toBe("2026-02-01T00:00:00.000Z");
  });
});
