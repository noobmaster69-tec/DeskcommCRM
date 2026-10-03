/**
 * O `crm_id` nas rotas de funil (migration 9004): filtrar a lista, criar dentro
 * de um CRM e mover de um CRM para outro.
 *
 * O caso que importa é o de fronteira: `crm_id` de OUTRA organização. A chave
 * estrangeira composta o recusaria com um 23503 cru; a rota precisa recusar
 * ANTES, com 422 e sem escrita nenhuma.
 */
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

import { ORG_ID, OUTRA_ORG, PIPE, authOk, funilRow, makeDb } from "@/tests/helpers/stages-db-double";

const PADRAO = "aaaaaaaa-0000-4000-8000-000000000001";
const GIRLY = "aaaaaaaa-0000-4000-8000-000000000002";
const ALHEIO = "aaaaaaaa-0000-4000-8000-000000000003";
const VELHO = "aaaaaaaa-0000-4000-8000-000000000004";

const crms = () => [
  { id: PADRAO, organization_id: ORG_ID, is_default: true, archived_at: null },
  { id: GIRLY, organization_id: ORG_ID, is_default: false, archived_at: null },
  { id: VELHO, organization_id: ORG_ID, is_default: false, archived_at: "2026-09-01T00:00:00Z" },
  { id: ALHEIO, organization_id: OUTRA_ORG, is_default: true, archived_at: null },
];

const funis = () => [
  { ...funilRow({ id: PIPE, name: "Pedidos", slug: "pedidos", is_default: true }), crm_id: PADRAO },
  { ...funilRow({ id: "p-girly", name: "Ensaio Girly", slug: "ensaio-girly", position: 2000 }), crm_id: GIRLY },
];

function reqJson(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/pipelines?crm_id=", () => {
  it("recorta para os funis do CRM", async () => {
    authOk();
    makeDb({ pipelines: funis(), crms: crms() });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/v1/pipelines?crm_id=${GIRLY}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string; crm_id: string }> };
    expect(body.data.map((p) => p.id)).toEqual(["p-girly"]);
    expect(body.data[0]?.crm_id).toBe(GIRLY);
  });

  it("sem filtro devolve todos da org, como antes", async () => {
    authOk();
    makeDb({ pipelines: funis(), crms: crms() });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/v1/pipelines"));
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(2);
  });

  it("crm_id que não é uuid → 400", async () => {
    authOk();
    makeDb({ pipelines: funis(), crms: crms() });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/v1/pipelines?crm_id=girly"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/pipelines com crm_id", () => {
  it("cria o funil DENTRO do CRM pedido", async () => {
    authOk();
    const db = makeDb({ pipelines: funis(), crms: crms() });
    const { POST } = await import("./route");
    const res = await POST(reqJson("http://localhost/api/v1/pipelines", "POST", { name: "Upsell", crm_id: GIRLY }));
    expect(res.status).toBe(201);
    expect(db.escritas[0]).toMatchObject({ table: "crm_pipelines", tipo: "insert", patch: { crm_id: GIRLY } });
  });

  it("sem crm_id continua funcionando — o gatilho põe no padrão", async () => {
    authOk();
    const db = makeDb({ pipelines: funis(), crms: crms() });
    const { POST } = await import("./route");
    const res = await POST(reqJson("http://localhost/api/v1/pipelines", "POST", { name: "Upsell" }));
    expect(res.status).toBe(201);
    expect((db.escritas[0]?.patch as Record<string, unknown>).crm_id).toBeUndefined();
  });

  it.each([
    ["de OUTRA organização", ALHEIO],
    ["arquivado", VELHO],
    ["inexistente", "aaaaaaaa-0000-4000-8000-0000000000ee"],
  ])("CRM %s → 422 e nenhuma escrita", async (_caso, crmId) => {
    authOk();
    const db = makeDb({ pipelines: funis(), crms: crms() });
    const { POST } = await import("./route");
    const res = await POST(reqJson("http://localhost/api/v1/pipelines", "POST", { name: "Upsell", crm_id: crmId }));
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });
});

describe("PATCH /api/v1/pipelines/[id] com crm_id (mover)", () => {
  const ctx = { params: Promise.resolve({ id: PIPE }) };

  it("move o funil para outro CRM e audita como pipeline.moved_crm", async () => {
    authOk();
    const db = makeDb({ pipelines: funis(), crms: crms() });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(reqJson("http://localhost/x", "PATCH", { crm_id: GIRLY }), {
      params: Promise.resolve({ id: PIPE }),
    });
    expect(res.status).toBe(200);
    expect(db.escritas).toEqual([
      {
        tipo: "update",
        table: "crm_pipelines",
        patch: { crm_id: GIRLY },
        filtros: [
          ["id", PIPE],
          ["organization_id", ORG_ID],
        ],
      },
    ]);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "pipeline.moved_crm" });
    const body = (await res.json()) as { data: { pipelines: Array<{ id: string; crm_id: string }> } };
    expect(body.data.pipelines.find((p) => p.id === PIPE)?.crm_id).toBe(GIRLY);
  });

  it("mover para o CRM em que já está não escreve nada", async () => {
    authOk();
    const db = makeDb({ pipelines: funis(), crms: crms() });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(reqJson("http://localhost/x", "PATCH", { crm_id: PADRAO }), ctx);
    expect(res.status).toBe(200);
    expect(db.escritas).toEqual([]);
  });

  it.each([
    ["de OUTRA organização", ALHEIO],
    ["arquivado", VELHO],
  ])("CRM %s → 422 e nenhuma escrita", async (_caso, crmId) => {
    authOk();
    const db = makeDb({ pipelines: funis(), crms: crms() });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(reqJson("http://localhost/x", "PATCH", { crm_id: crmId }), {
      params: Promise.resolve({ id: PIPE }),
    });
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });
});
