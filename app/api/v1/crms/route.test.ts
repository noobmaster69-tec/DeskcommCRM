import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

// Este teste isola o handler; autoridade de suporte é exercitada na suíte própria.
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
  authenticatedSessionId: vi.fn(async () => "f2200000-0000-4000-8000-000000000099"),
}));

import { ORG_ID, OUTRA_ORG, authOk, makeDb } from "@/tests/helpers/stages-db-double";

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
  crm({ id: ALHEIO, name: "CRM da outra empresa", slug: "outra", organization_id: OUTRA_ORG, is_default: true }),
];

function reqPost(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/v1/crms", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/crms", () => {
  it("qualquer papel lê (viewer)", async () => {
    authOk();
    makeDb({ crms: crmsDaOrg() });
    const { GET } = await import("./route");
    await GET();
    expect(vi.mocked(requireRole).mock.calls[0]?.[0]).toBe("viewer");
  });

  it("só os VIVOS da org ATIVA, com as métricas da rpc e as iniciais", async () => {
    authOk();
    const db = makeDb({
      crms: crmsDaOrg(),
      rpc: (nome) =>
        nome === "fn_crms_com_metricas"
          ? {
              data: [
                { id: PADRAO, leads_count: "12", funis_count: 3, last_updated_at: "2026-10-03T10:00:00Z" },
                { id: GIRLY, leads_count: 0, funis_count: 1, last_updated_at: null },
              ],
              error: null,
            }
          : { data: null, error: null },
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };

    expect(body.data.map((c) => c.id).sort()).toEqual([PADRAO, GIRLY].sort());
    const padrao = body.data.find((c) => c.id === PADRAO)!;
    // bigint chega como texto: a rota converte, senão a tela somaria strings.
    expect(padrao).toMatchObject({ leads_count: 12, funis_count: 3, initials: "PA", is_default: true });
    // A org da métrica sai da SESSÃO.
    expect(db.rpcs).toEqual([{ nome: "fn_crms_com_metricas", args: { p_org: ORG_ID } }]);
    expect(db.escritas).toEqual([]);
  });
});

describe("POST /api/v1/crms", () => {
  it("exige manager", async () => {
    authOk();
    makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "PA Advogados - EUROPA" }));
    expect(vi.mocked(requireRole).mock.calls[0]?.[0]).toBe("manager");
  });

  it("organization_id no body é recusado — a org sai da sessão", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Novo", organization_id: OUTRA_ORG }));
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("cria com slug derivado do nome, sem roubar o padrão, e audita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "PA Advogados - EUROPA", avatar_bg_color: "#386BF8" }));

    expect(res.status).toBe(201);
    // CRM + o funil principal que nasce com ele + as etapas finais do funil
    // (Funis no modelo Kommo, Fase C). A entrada vem do gatilho da 9007.
    expect(db.escritas.map((e) => `${e.tipo}:${e.table}`)).toEqual([
      "insert:crm_crms",
      "insert:crm_pipelines",
      "insert:crm_stages",
    ]);
    expect(db.escritas[0]).toMatchObject({
      tipo: "insert",
      table: "crm_crms",
      patch: {
        organization_id: ORG_ID,
        name: "PA Advogados - EUROPA",
        slug: "pa-advogados-europa",
        is_default: false,
        avatar_bg_color: "#386BF8",
      },
    });
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ slug: "pa-advogados-europa", initials: "PA" });
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "crm.created" });
  });

  it("aceita o slug como a tela mostra (/Com-Barra) e normaliza", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Pedidos", slug: "/Pedidos" }));
    expect(res.status).toBe(201);
    expect(db.escritas[0]?.patch).toMatchObject({ slug: "pedidos" });
  });

  it("slug ocupado por CRM ARQUIVADO → 422 e nenhuma escrita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Europa nova", slug: "europa-2025" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("(arquivado)");
    expect(db.escritas).toEqual([]);
  });

  it("slug de OUTRA org não colide (o índice único é por organização)", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Outra", slug: "outra" }));
    expect(res.status).toBe(201);
    expect(db.escritas[0]?.patch).toMatchObject({ slug: "outra" });
  });

  it("nome duplicado (sem acento, sem caixa) → 422", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "clientes girly" }));
    expect(res.status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("is_default:true libera o padrão antigo ANTES de marcar o novo", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Novo padrão", is_default: true }));
    expect(res.status).toBe(201);
    const updates = db.escritas.filter((e) => e.tipo === "update");
    expect(updates.map((u) => [u.filtros.find(([c]) => c === "id")?.[1], u.patch])).toEqual([
      [PADRAO, { is_default: false }],
      [expect.any(String), { is_default: true }],
    ]);
  });

  it("o PRIMEIRO CRM da organização nasce padrão", async () => {
    authOk();
    const db = makeDb({ crms: [] });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Primeiro" }));
    expect(res.status).toBe(201);
    expect(db.escritas.filter((e) => e.tipo === "update").map((u) => u.patch)).toEqual([
      { is_default: true },
    ]);
  });

  it("corrida no índice único (23505) → 409 com frase", async () => {
    authOk();
    makeDb({
      crms: crmsDaOrg(),
      writeError: (n) => (n === 1 ? { code: "23505", message: "duplicate key" } : null),
    });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Concorrente" }));
    expect(res.status).toBe(409);
  });

  it("Idempotency-Key que não é uuid → 400, sem escrita", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "X1" }, { "Idempotency-Key": "abc" }));
    expect(res.status).toBe(400);
    expect(db.escritas).toEqual([]);
  });
});

describe("POST /api/v1/crms nasce com o funil principal (Funis no modelo Kommo, Fase C)", () => {
  it("o funil vai para o CRM novo, chamado «Funil de vendas», com ganho e perda", async () => {
    authOk();
    const db = makeDb({ crms: crmsDaOrg() });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "Apex Company" }));
    const crmId = (db.tabelas.crm_crms as Array<Record<string, unknown>>).find((c) => c.name === "Apex Company")?.id;
    expect(db.escritas[1]?.patch).toMatchObject({ crm_id: crmId, name: "Funil de vendas" });
    expect((db.escritas[2]?.patch as Array<Record<string, unknown>>).map((e) => e.name)).toEqual(["Ganho", "Perdido"]);
  });

  it("«Funil de vendas» já existe na organização → o do CRM novo leva o nome do CRM", async () => {
    authOk();
    const db = makeDb({
      crms: crmsDaOrg(),
      pipelines: [{ id: "99999999-9999-4999-8999-999999999999", name: "Funil de vendas", slug: "funil-de-vendas", organization_id: ORG_ID, is_archived: false, position: 1000 } as never],
    });
    const { POST } = await import("./route");
    await POST(reqPost({ name: "PA Advogados - EUROPA" }));
    expect(db.escritas[1]?.patch).toMatchObject({ name: "Funil de vendas (PA Advogados - EUROPA)" });
  });

  it("se as etapas do funil falham, desfaz o funil E o CRM — CRM sem quadro seria pior que nenhum", async () => {
    authOk();
    const db = makeDb({
      crms: crmsDaOrg(),
      writeError: (n, table) => (table === "crm_stages" ? { code: "XX000", message: "falhou" } : null),
    });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ name: "Apex Company" }));
    expect(res.status).toBe(500);
    expect(db.escritas.filter((e) => e.tipo === "delete").map((e) => e.table)).toEqual(["crm_pipelines", "crm_crms"]);
    expect((db.tabelas.crm_crms as Array<Record<string, unknown>>).some((c) => c.name === "Apex Company")).toBe(false);
  });
});
