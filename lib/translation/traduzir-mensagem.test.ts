import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { promptDeTraducao, traduzirMensagemRecebida } from "./traduzir-mensagem";

/** Banco de mentira: uma linha por tabela; filtros ignorados; updates registrados por tabela. */
function banco(tabelas: Record<string, Record<string, unknown> | null>) {
  const updates: Array<{ tabela: string; campos: Record<string, unknown> }> = [];
  const from = (tabela: string) => {
    const q: Record<string, unknown> = {};
    const encadear = () => q;
    Object.assign(q, {
      select: encadear,
      eq: encadear,
      not: encadear,
      order: encadear,
      limit: encadear,
      maybeSingle: async () => ({ data: tabelas[tabela] ?? null }),
      update: (campos: Record<string, unknown>) => {
        updates.push({ tabela, campos });
        if (tabelas[tabela]) Object.assign(tabelas[tabela]!, campos);
        return { eq: async () => ({ error: null }) };
      },
    });
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, updates };
}

const mensagem = (extra: Record<string, unknown> = {}) => ({
  id: "m1",
  organization_id: "o1",
  conversation_id: "cv1",
  contact_id: "c1",
  direction: "inbound",
  body: "Hi! Is the apartment still available?",
  content_translated: null,
  content_locale: null,
  translated_to: null,
  translation_status: null,
  ...extra,
});
const contatoIngles = { id: "c1", organization_id: "o1", locale: "en-US", locale_source: "manual", locale_detected: null, phone_number: "+19392301037", custom_fields: null };
const conversa = { assigned_to_user_id: null, metadata: {} };

describe("tradução da mensagem recebida", () => {
  it("traduz do idioma do contato para o do atendente e grava o cache", async () => {
    const { admin, updates } = banco({ messages: mensagem(), contacts: { ...contatoIngles }, conversations: conversa });
    const traduzir = vi.fn().mockResolvedValue("Oi! O apartamento ainda está disponível?");
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("traduzida");
    expect(traduzir.mock.calls[0]![1]).toMatchObject({
      kind: "message_translate",
      prompt: "Hi! Is the apartment still available?",
      system: expect.stringContaining("Preserve emojis, gírias, tom e nomes próprios"),
    });
    const gravado = updates.find((u) => u.tabela === "messages")!.campos;
    expect(gravado).toMatchObject({
      content_translated: "Oi! O apartamento ainda está disponível?",
      content_locale: "en-US",
      translated_to: "pt-BR",
      translation_status: "done",
    });
  });

  it("CACHE: já traduzida para o mesmo idioma não chama o modelo de novo", async () => {
    const { admin } = banco({
      messages: mensagem({ content_translated: "Oi!", content_locale: "en-US", translated_to: "pt-BR", translation_status: "done" }),
      contacts: { ...contatoIngles },
      conversations: conversa,
    });
    const traduzir = vi.fn();
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("cache");
    expect(traduzir).not.toHaveBeenCalled();
  });

  it("idioma do contato mudou: o cache não segura e traduz de novo", async () => {
    const { admin } = banco({
      messages: mensagem({ content_translated: "Oi!", content_locale: "es-ES", translated_to: "pt-BR", translation_status: "done" }),
      contacts: { ...contatoIngles },
      conversations: conversa,
    });
    const traduzir = vi.fn().mockResolvedValue("Oi de novo");
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("traduzida");
    expect(traduzir).toHaveBeenCalledTimes(1);
  });

  it("mesma língua (pt-PT → pt-BR) não traduz", async () => {
    const { admin, updates } = banco({
      messages: mensagem({ body: "Bom dia, ainda está disponível?" }),
      contacts: { ...contatoIngles, locale: "pt-PT" },
      conversations: conversa,
    });
    const traduzir = vi.fn();
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("mesmo_idioma");
    expect(traduzir).not.toHaveBeenCalled();
    expect(updates.find((u) => u.tabela === "messages")!.campos).toMatchObject({ translation_status: "skipped" });
  });

  it("modelo indisponível: marca 'failed' e não insiste sozinho; o 'tentar novamente' repete", async () => {
    const tabelas = { messages: mensagem(), contacts: { ...contatoIngles }, conversations: conversa };
    const { admin } = banco(tabelas);
    const traduzir = vi.fn().mockResolvedValue(null);
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("falhou");
    expect(tabelas.messages.translation_status).toBe("failed");
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("falhou");
    expect(traduzir).toHaveBeenCalledTimes(1);
    traduzir.mockResolvedValueOnce("Oi!");
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir, repetirFalha: true })).toBe("traduzida");
  });

  it("conversa com a tradução de entrada desligada: não toca", async () => {
    const { admin } = banco({
      messages: mensagem(),
      contacts: { ...contatoIngles },
      conversations: { assigned_to_user_id: null, metadata: { traducao: { entrada: false } } },
    });
    const traduzir = vi.fn();
    expect(await traduzirMensagemRecebida(admin, "m1", { traduzir })).toBe("desligada");
    expect(traduzir).not.toHaveBeenCalled();
  });

  it("marcador de mídia e saída não são traduzidos", async () => {
    const traduzir = vi.fn();
    expect(await traduzirMensagemRecebida(banco({ messages: mensagem({ body: "[image]" }) }).admin, "m1", { traduzir })).toBe("sem_texto");
    expect(await traduzirMensagemRecebida(banco({ messages: mensagem({ direction: "outbound" }) }).admin, "m1", { traduzir })).toBe("sem_texto");
    expect(traduzir).not.toHaveBeenCalled();
  });

  it("o prompt nomeia os dois idiomas", () => {
    expect(promptDeTraducao("en-US", "pt-BR")).toContain("de inglês (EUA) para português do Brasil");
  });
});
