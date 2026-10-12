import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveContactLocale } from "./locale";
import { chamarModeloDeTraducao } from "./llm";

/** Banco de mentira: uma linha de contato, uma mensagem recebida, e o registro dos updates. */
function banco(contato: Record<string, unknown>, ultimaMensagem: string | null = null) {
  const updates: Array<Record<string, unknown>> = [];
  const construtor = (tabela: string) => {
    const q: Record<string, unknown> = {};
    const encadear = () => q;
    Object.assign(q, {
      select: encadear,
      eq: encadear,
      not: encadear,
      order: encadear,
      limit: encadear,
      maybeSingle: async () => ({ data: tabela === "contacts" ? contato : ultimaMensagem ? { body: ultimaMensagem } : null }),
      update: (v: Record<string, unknown>) => {
        updates.push(v);
        Object.assign(contato, v);
        return { eq: async () => ({ error: null }) };
      },
    });
    return q;
  };
  return { admin: { from: construtor } as unknown as SupabaseClient, updates };
}

const contato = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  organization_id: "o1",
  locale: null,
  locale_source: null,
  locale_detected: null,
  phone_number: null,
  custom_fields: null,
  ...extra,
});

describe("resolveContactLocale", () => {
  it("DDI resolve e persiste com origem 'ddi' — sem chamar o modelo", async () => {
    const { admin, updates } = banco(contato({ phone_number: "+447700900123" }));
    const detector = vi.fn();
    expect(await resolveContactLocale(admin, "c1", { detector })).toEqual({ locale: "en-GB", source: "ddi" });
    expect(detector).not.toHaveBeenCalled();
    expect(updates).toEqual([{ locale: "en-GB", locale_source: "ddi" }]);
  });

  it("sem DDI conhecido, detecta pela última mensagem e guarda o cache", async () => {
    const { admin, updates } = banco(contato({ phone_number: "+81312345678" }), "Good morning, is this available?");
    const detector = vi.fn().mockResolvedValue("en-US");
    expect(await resolveContactLocale(admin, "c1", { detector })).toEqual({ locale: "en-US", source: "detected" });
    expect(detector).toHaveBeenCalledWith(admin, "o1", "Good morning, is this available?");
    expect(updates[0]).toMatchObject({ locale_detected: "en-US" });
    expect(updates[1]).toEqual({ locale: "en-US", locale_source: "detected" });
  });

  it("cache de detecção vale: não chama o modelo de novo", async () => {
    const { admin } = banco(contato({ locale_detected: "fr-FR", locale: "fr-FR", locale_source: "detected" }), "Bonjour");
    const detector = vi.fn();
    expect(await resolveContactLocale(admin, "c1", { detector })).toEqual({ locale: "fr-FR", source: "detected" });
    expect(detector).not.toHaveBeenCalled();
  });

  it("manual não é tocado", async () => {
    const { admin, updates } = banco(contato({ locale: "es-ES", locale_source: "manual", phone_number: "+5519920425772" }));
    expect(await resolveContactLocale(admin, "c1")).toEqual({ locale: "es-ES", source: "manual" });
    expect(updates).toEqual([]);
  });
});

describe("chamarModeloDeTraducao", () => {
  const admin = {} as SupabaseClient;
  const chamada = { organizationId: "o1", kind: "message_translate" as const, system: "s", prompt: "p" };

  it("sem credencial da empresa: null, sem chamar nada", async () => {
    const gerar = vi.fn();
    expect(await chamarModeloDeTraducao(admin, chamada, { modelo: async () => null, gerar })).toBeNull();
    expect(gerar).not.toHaveBeenCalled();
  });

  it("falhou, tenta UMA vez mais; registra as duas no consumo", async () => {
    const gerar = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ text: " Bom dia ", usage: { inputTokens: 10, outputTokens: 3 } });
    const registrar = vi.fn();
    const r = await chamarModeloDeTraducao(admin, chamada, {
      modelo: async () => ({ modelId: "claude-haiku-4-5" }) as never,
      gerar: gerar as never,
      registrar,
      custo: async () => 0.01,
    });
    expect(r).toBe("Bom dia");
    expect(gerar).toHaveBeenCalledTimes(2);
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar.mock.calls[1]![0]).toMatchObject({ invocation_kind: "message_translate", model: "claude-haiku-4-5", cost_cents: 0.01 });
  });

  it("duas falhas: null (a tela mostra o fallback)", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("down"));
    const r = await chamarModeloDeTraducao(admin, chamada, {
      modelo: async () => ({ modelId: "m" }) as never,
      gerar: gerar as never,
      registrar: vi.fn(),
    });
    expect(r).toBeNull();
    expect(gerar).toHaveBeenCalledTimes(2);
  });
});
