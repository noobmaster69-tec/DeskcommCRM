import { describe, expect, it } from "vitest";

import { DIGITANDO_PADRAO, mensagemConfigSchema, segundosDoDigitando } from "./blocos-do-fluxo";

/** "Delay do digitando" do bloco Mensagem (fork jhoow). */
describe("digitando", () => {
  it("padrões por tipo", () => {
    expect(DIGITANDO_PADRAO).toEqual({ texto: 6, imagem: 6, arquivo: 6, sticker: 6, audio: 15, video: 10 });
    expect(segundosDoDigitando({ id: "a", tipo: "texto", texto: "x" })).toBe(6);
    expect(segundosDoDigitando({ id: "a", tipo: "audio", midia: { url: "https://x/a.ogg" } })).toBe(15);
    expect(segundosDoDigitando({ id: "a", tipo: "video", midia: { url: "https://x/a.mp4" } })).toBe(10);
  });

  it("valor do item e sorteio entre mínimo e máximo (pontas incluídas)", () => {
    const i = { id: "a", tipo: "texto" as const, texto: "x", typing_delay_seconds: 4, typing_delay_random_max: 10 };
    expect(segundosDoDigitando(i, () => 0)).toBe(4);
    expect(segundosDoDigitando(i, () => 1)).toBe(10);
    expect(segundosDoDigitando(i, () => 0.5)).toBe(7);
    expect(segundosDoDigitando({ ...i, typing_delay_random_max: null })).toBe(4);
  });

  it("schema: 1–60 s; máximo do aleatório não pode ser menor que o mínimo", () => {
    const ok = (item: Record<string, unknown>) => mensagemConfigSchema.safeParse({ itens: [{ id: "a", tipo: "texto", texto: "x", ...item }] }).success;
    expect(ok({})).toBe(true);
    expect(ok({ typing_delay_seconds: 1 })).toBe(true);
    expect(ok({ typing_delay_seconds: 60 })).toBe(true);
    expect(ok({ typing_delay_seconds: 0 })).toBe(false);
    expect(ok({ typing_delay_seconds: 61 })).toBe(false);
    expect(ok({ typing_delay_seconds: 4, typing_delay_random_max: 10 })).toBe(true);
    expect(ok({ typing_delay_seconds: 8, typing_delay_random_max: 4 })).toBe(false);
    // contato e intervalo não têm digitando
    expect(mensagemConfigSchema.safeParse({ itens: [{ id: "a", tipo: "contato", nome: "A", telefone: "5511999999999", typing_delay_seconds: 5 }] }).success).toBe(false);
  });
});
