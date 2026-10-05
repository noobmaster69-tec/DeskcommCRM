import { describe, expect, it } from "vitest";

import { filtroDeAudienciaSchema } from "@/lib/campanhas/audiencia";
import { filtroDoFormulario, podeSalvar, temCriterio, valoresDaCampanha } from "./valores";
import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";

/** Item 1 (fork jhoow): cada modo da Fonte do público manda SÓ o que usa. */
const base = {
  ...valoresDaCampanha(),
  nome: "Reativação",
  canal: "11111111-1111-4111-8111-111111111111",
  texto: "Oi {primeiro_nome}",
};
const FUNIL = "33333333-3333-4333-8333-333333333333";
const ETAPA = "44444444-4444-4444-8444-444444444444";
const LISTA = "55555555-5555-4555-8555-555555555555";

describe("fonte do público", () => {
  it("nova campanha começa no modo CRM e sem critério", () => {
    expect(base.fonte).toBe("crm");
    expect(temCriterio(base)).toBe(false);
    expect(podeSalvar(base)).toBe(false);
  });

  it("CRM: funil, etapas, entrada e variáveis viram filtro válido", () => {
    const v = {
      ...base,
      funilDoPublico: FUNIL,
      etapasDoPublico: [ETAPA],
      entrouDe: "2026-09-01",
      campos: [
        { chave: "cidade", operador: "igual" as const, valor: " SP " },
        { chave: "", operador: "igual" as const, valor: "x" },
        { chave: "site", operador: "preenchido" as const, valor: "" },
      ],
    };
    const f = filtroDoFormulario(v);
    expect(f).toMatchObject({
      fonte: "crm",
      funis: [FUNIL],
      etapas: [ETAPA],
      entrou_de: "2026-09-01T00:00:00.000Z",
      campos: [
        { chave: "cidade", operador: "igual", valor: "SP" },
        { chave: "site", operador: "preenchido", valor: "" },
      ],
    });
    expect(filtroDeAudienciaSchema.safeParse(f).success).toBe(true);
    expect(podeSalvar(v)).toBe(true);
  });

  it("etiqueta: 'todas' vai em com_todas_tags e não carrega funil esquecido", () => {
    const v = { ...base, fonte: "etiqueta" as const, comAlgumaTag: "vip, sp", todasAsTags: true, funilDoPublico: FUNIL };
    const f = filtroDoFormulario(v) as Record<string, unknown>;
    expect(f).toMatchObject({ com_todas_tags: ["vip", "sp"], com_alguma_tag: [] });
    expect(f.funis).toBeUndefined();
    expect(filtroDeAudienciaSchema.safeParse(f).success).toBe(true);
  });

  it("importação: só a lista; sem lista não salva", () => {
    const sem = { ...base, fonte: "importacao" as const, comAlgumaTag: "vip" };
    expect(temCriterio(sem)).toBe(false);
    const com = { ...sem, listaImportada: LISTA };
    expect(filtroDoFormulario(com)).toEqual({ fonte: "importacao", lista_importada: LISTA, limite: 100 });
    expect(podeSalvar(com)).toBe(true);
  });

  it("campanha antiga sem `fonte` reabre no modo certo", () => {
    const c = (f: Record<string, unknown>) => ({ audience_filter: f }) as unknown as CampanhaDetalhada;
    expect(valoresDaCampanha(c({ com_alguma_tag: ["vip"] })).fonte).toBe("etiqueta");
    expect(valoresDaCampanha(c({ funis: [FUNIL], com_alguma_tag: ["vip"] })).fonte).toBe("crm");
    expect(valoresDaCampanha(c({ lista_importada: LISTA })).listaImportada).toBe(LISTA);
    const todas = valoresDaCampanha(c({ fonte: "etiqueta", com_todas_tags: ["a", "b"] }));
    expect(todas).toMatchObject({ todasAsTags: true, comAlgumaTag: "a, b" });
  });
});
