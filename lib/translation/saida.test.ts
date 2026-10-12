import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { _limparCacheDeSaida, chavesDaConversa, traduzirTextoDeSaida } from "./saida";

const admin = {} as SupabaseClient;
const pedido = { organizationId: "o1", conversationId: "cv1", texto: "Bom dia, tudo bem?", de: "pt-BR", para: "en-US" };

describe("tradução de saída", () => {
  beforeEach(() => _limparCacheDeSaida());

  it("traduz do meu idioma para o do cliente com o prompt de preservação", async () => {
    const traduzir = vi.fn().mockResolvedValue("Good morning, how are you?");
    expect(await traduzirTextoDeSaida(admin, pedido, traduzir)).toBe("Good morning, how are you?");
    expect(traduzir.mock.calls[0]![1]).toMatchObject({ kind: "message_translate", prompt: "Bom dia, tudo bem?" });
  });

  it("a prévia que repete o mesmo texto não paga duas vezes", async () => {
    const traduzir = vi.fn().mockResolvedValue("Good morning");
    await traduzirTextoDeSaida(admin, pedido, traduzir);
    await traduzirTextoDeSaida(admin, pedido, traduzir);
    expect(traduzir).toHaveBeenCalledTimes(1);
  });

  it("mesma língua devolve o texto sem chamar o modelo", async () => {
    const traduzir = vi.fn();
    expect(await traduzirTextoDeSaida(admin, { ...pedido, para: "pt-PT" }, traduzir)).toBe("Bom dia, tudo bem?");
    expect(traduzir).not.toHaveBeenCalled();
  });

  it("falha não entra no cache", async () => {
    const traduzir = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("Good morning");
    expect(await traduzirTextoDeSaida(admin, pedido, traduzir)).toBeNull();
    expect(await traduzirTextoDeSaida(admin, pedido, traduzir)).toBe("Good morning");
  });

  it("as chaves da conversa nascem ligadas", () => {
    expect(chavesDaConversa(null)).toEqual({ entrada: true, saida: true });
    expect(chavesDaConversa({ traducao: { saida: false } })).toEqual({ entrada: true, saida: false });
  });
});
