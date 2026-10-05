import { describe, expect, it } from "vitest";

import { classificarAudiencia, consentiuMarketing, motivoParaExcluir, type CandidatoDaAudiencia } from "./elegibilidade";
import { TEXTO_DA_EXCLUSAO } from "./tipos";

const base = { contactId: "c1", telefone: "+5511999999999", bloqueado: false, anonimizado: false, recusouMarketing: false };

describe("base legal CONSENTIMENTO (item 6)", () => {
  it("antes deste item: consentimento só barrava quem RECUSOU — agora barra quem não consentiu", () => {
    expect(motivoParaExcluir({ ...base })).toBeNull(); // interesse legítimo: segue igual
    expect(motivoParaExcluir({ ...base }, { exigeConsentimento: true })).toBe("sem_consentimento");
    expect(motivoParaExcluir({ ...base, consentiu: true }, { exigeConsentimento: true })).toBeNull();
  });

  it("recusa e opt-out continuam vindo antes (o motivo mais forte)", () => {
    expect(motivoParaExcluir({ ...base, recusouMarketing: true }, { exigeConsentimento: true })).toBe("recusou_marketing");
    expect(motivoParaExcluir({ ...base, bloqueado: true }, { exigeConsentimento: true })).toBe("opt_out");
  });

  it("consentimento registrado = granted_at sem recusa POSTERIOR", () => {
    expect(consentiuMarketing({ marketing: { granted_at: "2026-10-01T10:00:00Z" } })).toBe(true);
    expect(consentiuMarketing({ marketing: { granted_at: null, source: null } })).toBe(false);
    expect(consentiuMarketing({ marketing: { granted_at: "2026-10-01T10:00:00Z", declined_at: "2026-10-02T10:00:00Z" } })).toBe(false);
    expect(consentiuMarketing({ marketing: { granted_at: "2026-10-03T10:00:00Z", declined_at: "2026-10-02T10:00:00Z" } })).toBe(true);
    expect(consentiuMarketing({})).toBe(false);
    expect(consentiuMarketing(null)).toBe(false);
  });

  it("a prévia/preparação conta quem ficou de fora por falta de consentimento", () => {
    const candidatos: CandidatoDaAudiencia[] = [
      { ...base, contactId: "a", telefone: "+5511900000001", nome: "Ana", consentiu: true },
      { ...base, contactId: "b", telefone: "+5511900000002", nome: "Bia", consentiu: false },
    ];
    const ctx = {
      excluidosAMao: new Set<string>(),
      jaEmCampanha: new Set<string>(),
      suprimidos: new Set<string>(),
      hashDoEndereco: (e: string) => e,
      renderizar: () => ({ texto: "oi", faltando: [] }),
    };
    const com = classificarAudiencia(candidatos, { ...ctx, exigeConsentimento: true });
    expect(com.map((l) => l.motivo)).toEqual([null, "sem_consentimento"]);
    const sem = classificarAudiencia(candidatos, ctx);
    expect(sem.every((l) => l.elegivel)).toBe(true);
    expect(TEXTO_DA_EXCLUSAO.sem_consentimento).toMatch(/consentimento/);
  });
});
