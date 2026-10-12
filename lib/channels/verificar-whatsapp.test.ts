import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { verificarWhatsapp } from "./verificar-whatsapp";

/** "Este número tem WhatsApp?" antes da 1ª mensagem (fork jhoow, 9020). */
function falso(cache: { wa_existe: boolean | null; wa_verificado_em: string | null } | null) {
  const updates: unknown[] = [];
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: cache }),
    update: (d: unknown) => (updates.push(d), q),
  });
  return { db: { from: () => q } as unknown as SupabaseClient, updates };
}
const agora = new Date("2026-10-12T12:00:00Z");
const base = { organizationId: "o", contactId: "c", telefone: "+351 234 621 350", sessionRef: "s", agora };

describe("verificarWhatsapp", () => {
  it("pergunta ao canal (só dígitos) e guarda o resultado", async () => {
    const checkRecipient = vi.fn(async () => false);
    const { db, updates } = falso(null);
    expect(await verificarWhatsapp(db, { ...base, canal: { checkRecipient } })).toBe(false);
    expect(checkRecipient).toHaveBeenCalledWith({ organizationId: "o", sessionRef: "s", phone: "351234621350" });
    expect(updates).toEqual([{ wa_existe: false, wa_verificado_em: agora.toISOString() }]);
  });

  it("cache: 'tem' vale 30 dias, 'não tem' vale 7", async () => {
    const checkRecipient = vi.fn(async () => true);
    expect(await verificarWhatsapp(falso({ wa_existe: true, wa_verificado_em: "2026-09-20T00:00:00Z" }).db, { ...base, canal: { checkRecipient } })).toBe(true);
    expect(await verificarWhatsapp(falso({ wa_existe: false, wa_verificado_em: "2026-10-08T00:00:00Z" }).db, { ...base, canal: { checkRecipient } })).toBe(false);
    expect(checkRecipient).not.toHaveBeenCalled();
    expect(await verificarWhatsapp(falso({ wa_existe: false, wa_verificado_em: "2026-10-01T00:00:00Z" }).db, { ...base, canal: { checkRecipient } })).toBe(true);
    expect(checkRecipient).toHaveBeenCalledTimes(1);
  });

  it("canal sem verificação ou que falha = null (o envio segue como sempre)", async () => {
    expect(await verificarWhatsapp(falso(null).db, { ...base, canal: {} })).toBeNull();
    const quebra = vi.fn(async () => {
      throw new Error("waha_500");
    });
    expect(await verificarWhatsapp(falso(null).db, { ...base, canal: { checkRecipient: quebra } })).toBeNull();
  });
});
