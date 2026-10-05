import { describe, expect, it } from "vitest";

import { passaNoFiltro } from "./lista";
import { patchDoFluxoSchema, planoDoPatch, type EstadoDoFluxo } from "./menu-do-fluxo";

const AGORA = "2026-10-04T12:00:00.000Z";
const ativo: EstadoDoFluxo = { status: "active", active_version_id: "v1", archived_at: null };
const pausado: EstadoDoFluxo = { status: "disabled", active_version_id: "v1", archived_at: null };
const rascunho: EstadoDoFluxo = { status: "draft", active_version_id: null, archived_at: null };

describe("PATCH do menu ⋯ (itens 1 e 2)", () => {
  it("corpo vazio não passa", () => {
    expect(patchDoFluxoSchema.safeParse({}).success).toBe(false);
    expect(patchDoFluxoSchema.safeParse({ pasta_id: null }).success).toBe(true);
  });

  it("mover de pasta não mexe em updated_at (a lista ordena por ele)", () => {
    const p = planoDoPatch(ativo, { pasta_id: null }, AGORA);
    expect(p).toEqual({ ok: true, update: { pasta_id: null }, eventos: ["fluxo.movido_de_pasta"] });
  });

  it("desativar só muda quem está ativo", () => {
    expect(planoDoPatch(ativo, { ativo: false }, AGORA)).toEqual({
      ok: true,
      update: { status: "disabled", updated_at: AGORA },
      eventos: ["followup_flow.disabled"],
    });
    expect(planoDoPatch(pausado, { ativo: false }, AGORA)).toEqual({ ok: true, update: {}, eventos: [] });
  });

  it("reativar exige versão publicada e fluxo fora do arquivo", () => {
    expect(planoDoPatch(pausado, { ativo: true }, AGORA)).toMatchObject({ ok: true, update: { status: "active" } });
    expect(planoDoPatch(rascunho, { ativo: true }, AGORA)).toMatchObject({ ok: false, codigo: "sem_versao" });
    expect(planoDoPatch({ ...pausado, archived_at: AGORA }, { ativo: true }, AGORA)).toMatchObject({
      ok: false,
      codigo: "arquivado",
    });
  });

  it("arquivar um fluxo ativo o desativa junto", () => {
    expect(planoDoPatch(ativo, { arquivado: true }, AGORA)).toEqual({
      ok: true,
      update: { archived_at: AGORA, status: "disabled", updated_at: AGORA },
      eventos: ["followup_flow.disabled", "fluxo.arquivado"],
    });
  });

  it("desarquivar devolve o fluxo pausado, sem reativar sozinho", () => {
    expect(planoDoPatch({ ...pausado, archived_at: AGORA }, { arquivado: false }, AGORA)).toEqual({
      ok: true,
      update: { archived_at: null, updated_at: AGORA },
      eventos: ["fluxo.desarquivado"],
    });
  });
});

describe("filtro Arquivados", () => {
  it("arquivado só aparece em Arquivados — some até de Todos", () => {
    expect(passaNoFiltro("disabled", "arquivados", true)).toBe(true);
    expect(passaNoFiltro("disabled", "todos", true)).toBe(false);
    expect(passaNoFiltro("disabled", "pausados", true)).toBe(false);
    expect(passaNoFiltro("active", "arquivados", false)).toBe(false);
    expect(passaNoFiltro("active", "todos")).toBe(true);
  });
});
