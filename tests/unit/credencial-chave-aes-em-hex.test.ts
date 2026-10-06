/**
 * Credenciais de IA (fork jhoow) — "Erro interno" ao conectar chave de API.
 *
 * Causa raiz medida no staging: `AI_CRED_AES_KEY` estava em HEX (64 caracteres
 * = 32 bytes), e `getKey()` só lia base64 — 48 bytes, exceção, e a rota
 * devolvia o genérico "Erro interno". Prova: hex passa a cifrar e decifrar; e
 * a falha de cifragem vira código e frase próprios.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "a3f1c2d4e5b6978812345678abcdef00112233445566778899aabbccddeeff01";
});

import { decryptKey, encryptKey } from "@/lib/crypto/aes_gcm";
import { respostaDeFalhaAoGuardar } from "@/lib/ai/credenciais/resposta-de-falha";

describe("AI_CRED_AES_KEY em hex", () => {
  it("cifra e decifra (antes lançava 'deve ter exatamente 32 bytes (lido: 48)')", () => {
    const e = encryptKey("sk-teste-1234567890");
    expect(e.last4).toBe("7890");
    expect(decryptKey(e)).toBe("sk-teste-1234567890");
  });
});

describe("resposta da falha ao guardar", () => {
  const t = (s: string) => s;

  it("cifragem: código próprio e frase que nomeia a configuração", async () => {
    const r = respostaDeFalhaAoGuardar("cifragem", "x", { requestId: "r1", t, operacao: "criar" });
    const corpo = (await r.json()) as { error: { code: string; message: string } };
    expect(r.status).toBe(500);
    expect(corpo.error.code).toBe("credencial_cifra_indisponivel");
    expect(corpo.error.message).toMatch(/AI_CRED_AES_KEY/);
  });

  it("banco: continua interno, mas diz o que fazer", async () => {
    const r = respostaDeFalhaAoGuardar("banco", "boom", { requestId: "r2", t, operacao: "atualizar" });
    const corpo = (await r.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("internal_error");
    expect(corpo.error.message).toMatch(/gravar a chave/);
  });
});
