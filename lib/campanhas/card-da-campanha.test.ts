import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const criar = vi.fn(async () => ({}));
const mover = vi.fn(async () => ({}));
vi.mock("@/app/api/v1/leads/_handler", () => ({
  createLeadHandler: (...a: unknown[]) => criar(...(a as [])),
  moveLeadHandler: (...a: unknown[]) => mover(...(a as [])),
}));

import { garantirCardNaEtapa } from "./card-da-campanha";
import { resumoDoProgresso } from "@/components/campanhas/ProgressoDaCampanha";
import { corpoDaCampanha, valoresDaCampanha } from "@/app/app/campaigns/_form/valores";
import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";

const P = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";
const S2 = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";

function adminCom(leadAberto: { id: string; stage_id: string } | null) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: leadAberto, error: null }),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

const entrada = { organizationId: "org", contactId: C, pipelineId: P, stageId: S2, campanhaId: "camp", titulo: "Ana" };

describe("card da campanha no funil (item 3)", () => {
  beforeEach(() => {
    criar.mockClear();
    mover.mockClear();
  });

  it("sem negócio aberto no funil: CRIA o card na etapa", async () => {
    expect(await garantirCardNaEtapa(adminCom(null), entrada)).toBe("criado");
    expect(criar).toHaveBeenCalledOnce();
    expect(mover).not.toHaveBeenCalled();
  });

  it("com negócio em outra etapa: MOVE (é o 'recebe → responde')", async () => {
    expect(await garantirCardNaEtapa(adminCom({ id: "l1", stage_id: S1 }), entrada)).toBe("movido");
    expect(mover).toHaveBeenCalledWith(expect.anything(), expect.anything(), "l1", expect.objectContaining({ to_stage_id: S2 }));
  });

  it("já na etapa: não faz nada; falha do handler nunca lança", async () => {
    expect(await garantirCardNaEtapa(adminCom({ id: "l1", stage_id: S2 }), entrada)).toBe("ja_estava");
    mover.mockRejectedValueOnce(new Error("guarda"));
    expect(await garantirCardNaEtapa(adminCom({ id: "l1", stage_id: S1 }), entrada)).toBe("erro");
  });
});

describe("progresso e formulário", () => {
  it("barra: % enviadas e respondidas/enviadas", () => {
    expect(resumoDoProgresso({ elegiveis: 180, enviados: 120, pendentes: 60, responderam: 30 })).toEqual({
      pct: 67,
      texto: "67% enviadas · 30/120 respondidas",
    });
    expect(resumoDoProgresso({ elegiveis: 0, enviados: 0, pendentes: 0, responderam: 0 }).pct).toBe(0);
  });

  it("quem recebe vai e volta pelo formulário; sem funil, sem etapa", () => {
    const c = { recipients_pipeline_id: P, recipients_stage_id: S1, audience_filter: {} } as unknown as CampanhaDetalhada;
    expect(corpoDaCampanha(valoresDaCampanha(c))).toMatchObject({ recipients_pipeline_id: P, recipients_stage_id: S1 });
    const v = { ...valoresDaCampanha(c), funilDeQuemRecebe: "" };
    expect(corpoDaCampanha(v)).toMatchObject({ recipients_pipeline_id: null, recipients_stage_id: null });
  });
});
