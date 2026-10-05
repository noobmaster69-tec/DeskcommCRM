import { describe, expect, it } from "vitest";

import { criarCampanhaSchema } from "@/lib/campanhas/schemas";
import { corpoDaCampanha, podeSalvar, valoresDaCampanha } from "./valores";

/**
 * Item 5: "Quem responder" é TODO opcional — funil, etapa e agente. Em branco,
 * o card nasce no funil do número e quem atende é o agente publicado nele.
 */
describe("quem responder é opcional (item 5)", () => {
  const minimo = {
    ...valoresDaCampanha(),
    nome: "Reativação",
    canal: "11111111-1111-4111-8111-111111111111",
    texto: "Oi {primeiro_nome}",
    comAlgumaTag: "vip",
  };

  it("o formulário salva sem funil, etapa nem agente de resposta", () => {
    expect(podeSalvar(minimo)).toBe(true);
    const corpo = corpoDaCampanha(minimo);
    expect(corpo).toMatchObject({ pipeline_id: null, stage_id: null, agent_id: null, recipients_pipeline_id: null });
  });

  it("a API aceita a campanha sem nada disso", () => {
    expect(criarCampanhaSchema.safeParse(corpoDaCampanha(minimo)).success).toBe(true);
  });

  it("só a coerência é cobrada: etapa sem funil não", () => {
    expect(
      criarCampanhaSchema.safeParse({ ...corpoDaCampanha(minimo), stage_id: "22222222-2222-4222-8222-222222222222" }).success,
    ).toBe(false);
  });
});
