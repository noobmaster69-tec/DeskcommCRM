import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

// Este teste isola o handler; autoridade de suporte é exercitada na suíte própria.
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
  authenticatedSessionId: vi.fn(async () => "f2200000-0000-4000-8000-000000000099"),
}));

import { ORG_ID, OUTRA_ORG, authOk, funilRow, makeDb } from "@/tests/helpers/stages-db-double";

const PADRAO = "aaaaaaaa-0000-4000-8000-000000000001";
const GIRLY = "aaaaaaaa-0000-4000-8000-000000000002";
const ALHEIO = "aaaaaaaa-0000-4000-8000-000000000003";
const VELHO = "aaaaaaaa-0000-4000-8000-000000000004";

function crm(over: Record<string, unknown> & { id: string; name: string; slug: string }) {
  return {
    organization_id: ORG_ID,
    description: null,
    is_default: false,
    avatar_bg_color: null,
    archived_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const crmsDaOrg = () => [
  crm({ id: PADRAO, name: "PADRÃO", slug: "padrao", is_default: true }),
  crm({ id: GIRLY, name: "Clientes Girly", slug: "clientes-girly" }),
  crm({ id: VELHO, name: "Europa 2025", slug: "europa-2025", archived_at: "2026-09-01T00:00:00Z" }),
  crm({ id: ALHEIO, name: "CRM da outra empresa", slug: "outra", organization_id: OUTRA_ORG }),
];

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/v1/crms/x`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/crms/[id]", () => {
  it("CRM de OUTRA org → 404, igual a inexistente", async () => {
    authOk();
    makeDb({ crms: crmsDaOrg() });
    const { GET } = await import("./route");
    const res = await GET(req("GET"), ctx(ALHEIO));
    expect(res.status).toBe(404);
  });

  it("id que não é uuid → 404 sem consultar nada", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { GET } = await import("./route");
    const res = await GET(req("GET"), ctx("padrao"));
    expect(res.status).toBe(404);
    expect(db.rpcs).toEqual([]);
  });

  it("devolve o CRM com métricas", async () => {
    authOk();
    makeDb({
      crms: crmsDaOrg(),
      rpc: () => ({ data: [{ id: GIRLY, leads_count: 4, funis_count: 2, last_updated_at: null }], error: null }),
    });
    const { GET } = await import("./route");
    const res = await GET(req("GET"), ctx(GIRLY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ id: GIRLY, leads_count: 4, funis_count: 2, initials: "CG" });
  });
});

describe("PATCH /api/v1/crms/[id]", () => {
  it("renomeia e troca o endereço", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { name: "Girly", slug: "/girly" }), ctx(GIRLY));
    expect(res.status).toBe(200);
    expect(db.escritas).toEqual([
      {
        tipo: "update",
        table: "crm_crms",
        patch: { name: "Girly", slug: "girly" },
        filtros: [
          ["id", GIRLY],
          ["organization_id", ORG_ID],
        ],
      },
    ]);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "crm.updated" });
  });

  it("eleger padrão: libera o antigo, depois marca o alvo COM o resto do patch", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { is_default: true, description: "Marca" }), ctx(GIRLY));
    expect(res.status).toBe(200);
    expect(db.escritas.map((e) => [e.filtros[0]?.[1], e.patch])).toEqual([
      [PADRAO, { is_default: false }],
      [GIRLY, { is_default: true, description: "Marca" }],
    ]);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "crm.default_changed" });
  });

  it("is_default:false → 422: o padrão se muda, não se apaga", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { is_default: false }), ctx(PADRAO));
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("slug de outro CRM da org → 422", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { slug: "padrao" }), ctx(GIRLY));
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("CRM arquivado → 409", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { name: "Volta" }), ctx(VELHO));
    expect(res.status).toBe(409);
    expect(db.escritas).toEqual([]);
  });

  it("CRM de outra org → 404 sem escrita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", { name: "Meu agora" }), ctx(ALHEIO));
    expect(res.status).toBe(404);
    expect(db.escritas).toEqual([]);
  });

  it("corpo vazio → 422", async () => {
    authOk();
    makeDb({ crms: crmsDaOrg() });
    const { PATCH } = await import("./route");
    const res = await PATCH(req("PATCH", {}), ctx(GIRLY));
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/v1/crms/[id] (arquivar)", () => {
  it("o CRM padrão não se arquiva → 409", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg(), pipelines: [] });
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), ctx(PADRAO));
    expect(res.status).toBe(409);
    expect(db.escritas).toEqual([]);
  });

  it("CRM com funis arquiva JUNTO com eles, pela fn_crm_arquivar, e audita os funis (Fase D)", async () => {
    // A regra antiga ("zero funil vivo") + o funil principal fixo (9007)
    // deixavam todo CRM inarquivável. Agora CRM, funis vivos e vínculos de
    // número vão juntos, numa transação no banco (9009).
    authOk();
    const db = makeDb({
      crms: crmsDaOrg(),
      pipelines: [
        { ...funilRow({ id: "f1", name: "Ensaio" }), crm_id: GIRLY, is_primary: true },
        { ...funilRow({ id: "f2", name: "Upsell" }), crm_id: GIRLY },
        // arquivado não entra na conta
        { ...funilRow({ id: "f3", name: "Velho", is_archived: true }), crm_id: GIRLY },
      ],
    });
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), ctx(GIRLY));
    expect(res.status).toBe(200);
    expect(db.rpcs).toEqual([{ nome: "fn_crm_arquivar", args: { p_crm: GIRLY } }]);
    // Nada de update solto: a transação é da função.
    expect(db.escritas).toEqual([]);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({
      action: "crm.archived",
      metadata: { funis_arquivados: ["Ensaio", "Upsell"] },
    });
  });

  it("funil do CRM recebe lead de formulário → 409 com a frase, e nada arquivado", async () => {
    authOk();
    const db = makeDb({
      crms: crmsDaOrg(),
      pipelines: [{ ...funilRow({ id: "f1", name: "Ensaio" }), crm_id: GIRLY, is_primary: true }],
      webhookSources: [{ organization_id: ORG_ID, default_pipeline_id: "f1", name: "Site" }],
    });
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), ctx(GIRLY));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("«Site»");
    expect(db.rpcs).toEqual([]);
  });

  it("o funil padrão da organização está no CRM → 409, e nada arquivado", async () => {
    authOk();
    const db = makeDb({
      crms: crmsDaOrg(),
      pipelines: [{ ...funilRow({ id: "f1", name: "Ensaio", is_default: true }), crm_id: GIRLY, is_primary: true }],
    });
    const { DELETE } = await import("./route");
    expect((await DELETE(req("DELETE"), ctx(GIRLY))).status).toBe(409);
    expect(db.rpcs).toEqual([]);
  });

  it("CRM vazio também arquiva pela função, e audita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg(), pipelines: [] });
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), ctx(GIRLY));
    expect(res.status).toBe(200);
    expect(db.rpcs).toEqual([{ nome: "fn_crm_arquivar", args: { p_crm: GIRLY } }]);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "crm.archived" });
  });

  it("arquivar de novo não escreve nem audita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg(), pipelines: [] });
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), ctx(VELHO));
    expect(res.status).toBe(200);
    expect(db.escritas).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("CRM de outra org → 404 sem escrita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg(), pipelines: [] });
    const { DELETE } = await import("./route");
    const res = await DELETE(req("DELETE"), ctx(ALHEIO));
    expect(res.status).toBe(404);
    expect(db.escritas).toEqual([]);
  });
});
