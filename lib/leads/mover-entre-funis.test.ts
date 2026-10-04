import { describe, expect, it } from "vitest";

import { podeMoverEntreFunis, RECUSA_ENTRE_CRMS } from "./mover-entre-funis";

// Mover o card para outro funil do MESMO CRM (Funis no modelo Kommo, Fase E).
const f = (id: string, crm_id: string | null, is_archived = false) => ({ id, crm_id, is_archived, name: id });

describe("podeMoverEntreFunis", () => {
  it("mesmo funil: é a troca de etapa de sempre", () => {
    expect(podeMoverEntreFunis(f("a", "crm"), f("a", "crm"))).toEqual({ ok: true, entreFunis: false });
  });

  it("outro funil do MESMO CRM: move, e o card leva o funil junto", () => {
    expect(podeMoverEntreFunis(f("social", "apex"), f("sdr", "apex"))).toEqual({ ok: true, entreFunis: true });
  });

  it("outro CRM: recusa com o código de sempre e aponta o clone", () => {
    const r = podeMoverEntreFunis(f("social", "apex"), f("triagem", "pa"));
    expect(r).toEqual({ ok: false, codigo: "pipeline_immutable_use_clone", mensagem: RECUSA_ENTRE_CRMS });
    expect(RECUSA_ENTRE_CRMS).toContain("/api/v1/leads/[id]/clone");
  });

  it("CRM desconhecido (banco sem a 9004) não é o mesmo CRM", () => {
    expect(podeMoverEntreFunis(f("a", null), f("b", null)).ok).toBe(false);
  });

  it("funil de destino arquivado: recusa, mesmo no mesmo CRM", () => {
    const r = podeMoverEntreFunis(f("social", "apex"), f("velho", "apex", true));
    expect(r).toMatchObject({ ok: false, codigo: "pipeline_archived" });
  });
});
