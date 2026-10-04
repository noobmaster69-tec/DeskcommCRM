import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { ORG_ID, OUTRA_ORG, PIPE, authOk, comAutoria, etapa, funil, makeDb } from "@/tests/helpers/stages-db-double";

const ctx = { params: Promise.resolve({ id: PIPE }) };

function reqPost(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/pipelines/${PIPE}/stages`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/pipelines/[id]/stages", () => {
  it("sem auth → repassa a resposta do requireRole, sem escrever", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("unauthenticated", "Auth required.", 401, {}),
    });
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Retorno" }), ctx);
    expect(res.status).toBe(401);
    expect(db.escritas).toEqual([]);
  });

  /**
   * O teste de 401 acima mocka o `requireRole` para falhar SEMPRE — passaria
   * igual se a criação pedisse `agent` ou `viewer`. Quem prova o papel é este,
   * num caminho com auth OK.
   */
  it("exige manager", async () => {
    authOk();
    makeDb({ stages: funil() });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "Retorno" }), ctx);
    expect(vi.mocked(requireRole).mock.calls[0]?.[0]).toBe("manager");
  });

  /**
   * ⭐ O funil EXISTE — só que noutra organização. Um handler que responde 404
   * depois de gravar é pior do que um que responde 200: o veredito não é o
   * status, é a lista de escritas emitidas.
   */
  it("funil de outra organização → 404 e NENHUMA escrita", async () => {
    authOk();
    const db = makeDb({
      pipelineOrg: OUTRA_ORG,
      stages: funil().map((e) => ({ ...e, organization_id: OUTRA_ORG })),
    });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Retorno" }), ctx);

    expect(res.status).toBe(404);
    expect(db.escritas).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("nome já usado no funil → 422 com a mensagem da regra, e nenhuma escrita", async () => {
    authOk();
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    // "proposta" difere de «Proposta» só por caixa — o usuário lê como a mesma coluna.
    const res = await POST(reqPost({ name: "proposta" }), ctx);

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unprocessable_entity");
    expect(body.error.message).toBe(
      "Já existe uma etapa chamada «Proposta» neste funil. Escolha outro nome.",
    );
    expect(db.escritas).toEqual([]);
  });

  it("nome em branco → 422, e nenhuma escrita", async () => {
    authOk();
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "   " }), ctx);

    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("cria no fim do funil, com slug e tenant do JWT", async () => {
    authOk();
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Pós-venda" }), ctx);

    expect(res.status).toBe(201);
    expect(db.escritas).toHaveLength(1);
    expect(db.escritas[0]?.tipo).toBe("insert");
    expect(db.escritas[0]?.patch).toEqual(
      comAutoria({
        organization_id: ORG_ID,
        pipeline_id: PIPE,
        name: "Pós-venda",
        slug: "pos-venda",
        // As duas últimas colunas são as finais («Pago» ganho em 3000,
        // «Cancelado» perda em 4000): a nova entra ANTES delas, como no Kommo —
        // entre «Proposta» (2000) e «Pago».
        position: 2500,
        // Sem cor pedida, a coluna nasce sem cor — declarado, não omitido.
        color: null,
      }),
    );

    const body = (await res.json()) as { data: { etapas: Array<{ id: string; name: string }> } };
    expect(body.data.etapas.map((e) => e.name)).toEqual([
      "Novo",
      "Proposta",
      "Pós-venda",
      "Pago",
      "Cancelado",
    ]);
  });

  it("slug ocupado por etapa ARQUIVADA ganha sufixo", async () => {
    authOk();
    // `uniq_crm_stages_pipeline_slug` NÃO é parcial: arquivada continua ocupando.
    const db = makeDb({
      stages: [
        ...funil(),
        etapa({ id: "e9", name: "Retorno antigo", slug: "retorno", position: 9000, is_archived: true }),
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Retorno" }), ctx);

    expect(res.status).toBe(201);
    expect(db.escritas[0]?.patch).toMatchObject({ slug: "retorno-2" });
  });

  it("caminho feliz audita pipeline.stage_created", async () => {
    authOk();
    makeDb({ stages: funil() });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "Retorno" }), ctx);

    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pipeline.stage_created",
        organizationId: ORG_ID,
        resourceType: "crm_stage",
      }),
    );
  });

  it("23505 do índice único → 409 em português, sem texto do Postgres", async () => {
    authOk();
    makeDb({
      stages: funil(),
      writeError: () => ({
        code: "23505",
        message: 'duplicate key value violates unique constraint "uniq_crm_stages_pipeline_slug"',
      }),
    });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Retorno" }), ctx);

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("state_conflict");
    expect(body.error.message).toContain("Retorno");
    // Sem esta metade, um 500 devolvendo a mensagem crua do Postgres também
    // conteria o nome da etapa e passaria: é o `not.toContain` que separa
    // "mensagem escrita para o usuário" de "vazamento do banco".
    expect(body.error.message).not.toContain("unique");
    expect(body.error.message).not.toContain("constraint");
  });

  it("erro inesperado do banco → 500, sem inventar sucesso", async () => {
    authOk();
    makeDb({
      stages: funil(),
      writeError: () => ({ code: "08006", message: "connection failure" }),
    });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Retorno" }), ctx);
    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });
});

// Este teste isola o handler; autoridade de suporte é exercitada na suíte própria.
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/impersonate/support")>(),
  requireSupportWrite: vi.fn(async () => null),
  authenticatedSessionId: vi.fn(async () => "f2200000-0000-4000-8000-000000000099"),
}));

describe("POST com cor e marcação (Funis no modelo Kommo, Fase B)", () => {
  it("cria com a cor no insert e MOVE o ganho: insert, solta a antiga, marca a nova — nessa ordem", async () => {
    authOk();
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Fechado - ganho", color: "#d7fc70", is_won: true }), ctx);

    expect(res.status).toBe(201);
    expect(db.escritas.map((e) => e.tipo)).toEqual(["insert", "update", "update"]);
    expect(db.escritas[0]?.patch).toMatchObject({ name: "Fechado - ganho", color: "#d7fc70" });
    expect(db.escritas[0]?.patch).not.toHaveProperty("is_won");
    // «Pago» (e3) era o ganho: solta ANTES — o índice único é imediato.
    expect(db.escritas[1]?.filtros).toContainEqual(["id", "e3"]);
    expect(db.escritas[1]?.patch).toEqual(comAutoria({ is_won: false }));
    expect(db.escritas[2]?.filtros).toContainEqual(["id", "novo-1-0"]);
    expect(db.escritas[2]?.patch).toEqual(comAutoria({ is_won: true }));
  });

  it("ganho E perda ao mesmo tempo → 422, e nenhuma escrita", async () => {
    authOk();
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Fim", is_won: true, is_lost: true }), ctx);
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("cor fora do formato → 422 do Zod, e nenhuma escrita", async () => {
    authOk();
    const db = makeDb({ stages: funil() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Retorno", color: "red" }), ctx);
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("funil que só tem a entrada e as finais: a coluna nova entra entre a entrada e «Ganho»", async () => {
    authOk();
    // É o funil adicional/principal como nasce na Fase C: sem colunas do meio.
    const db = makeDb({
      stages: [
        etapa({ id: "g", name: "Ganho", position: 1000, is_won: true }),
        etapa({ id: "p", name: "Perdido", position: 2000, is_lost: true }),
        etapa({ id: "en", name: "Etapa de entrada", position: 0, is_entry: true }),
      ],
    });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "Qualificando" }), ctx);
    expect((db.escritas[0]?.patch as Record<string, unknown>).position).toBe(500);
  });

  it("funil sem final na ponta: a coluna nova entra depois da MAIOR posição", async () => {
    authOk();
    const db = makeDb({
      stages: [
        etapa({ id: "a", name: "Pago", position: 1000, is_won: true }),
        etapa({ id: "b", name: "Cancelado", position: 2000, is_lost: true }),
        etapa({ id: "c", name: "Entregue", position: 3000 }),
      ],
    });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "Pós-venda" }), ctx);
    expect((db.escritas[0]?.patch as Record<string, unknown>).position).toBe(4000);
  });
});
