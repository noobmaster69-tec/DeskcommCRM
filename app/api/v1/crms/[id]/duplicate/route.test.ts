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

import { ORG_ID, OUTRA_ORG, authOk, makeDb } from "@/tests/helpers/stages-db-double";

const PADRAO = "aaaaaaaa-0000-4000-8000-000000000001";
const ALHEIO = "aaaaaaaa-0000-4000-8000-000000000003";
const NOVO = "aaaaaaaa-0000-4000-8000-0000000000ff";

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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/v1/crms/x/duplicate", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/**
 * A rpc do dublê "cria" a linha do CRM novo, como a função faria — senão a
 * releitura da rota não acharia nada e o teste mediria o dublê.
 */
function dbComDuplicacao(erro?: { code: string; message: string }) {
  const db = makeDb({
    crms: [
      crm({ id: PADRAO, name: "PADRÃO", slug: "padrao", is_default: true }),
      crm({ id: ALHEIO, name: "Alheio", slug: "alheio", organization_id: OUTRA_ORG }),
    ],
    rpc: (nome, args) => {
      if (nome !== "fn_crm_duplicar") return { data: [], error: null };
      if (erro) return { data: null, error: erro };
      const a = args as { p_name: string; p_slug: string };
      db.tabelas.crm_crms.push(crm({ id: NOVO, name: a.p_name, slug: a.p_slug }));
      return { data: NOVO, error: null };
    },
  });
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/crms/[id]/duplicate", () => {
  it("sem corpo: nome '<nome> (cópia)' e slug derivado, numa rpc só", async () => {
    authOk();
    const db = dbComDuplicacao();
    const { POST } = await import("./route");
    const res = await POST(req(), ctx(PADRAO));
    expect(res.status).toBe(201);
    expect(db.rpcs.filter((r) => r.nome === "fn_crm_duplicar")).toEqual([
      { nome: "fn_crm_duplicar", args: { p_crm: PADRAO, p_name: "PADRÃO (cópia)", p_slug: "padrao-copia" } },
    ]);
    // Nenhuma escrita fora da transação da função.
    expect(db.escritas).toEqual([]);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ id: NOVO, is_default: false });
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "crm.duplicated" });
  });

  it("CRM de outra org → 404 e a rpc NÃO roda", async () => {
    authOk();
    const db = dbComDuplicacao();
    const { POST } = await import("./route");
    const res = await POST(req(), ctx(ALHEIO));
    expect(res.status).toBe(404);
    expect(db.rpcs.filter((r) => r.nome === "fn_crm_duplicar")).toEqual([]);
  });

  it("nome repetido → 422 antes da rpc", async () => {
    authOk();
    const db = dbComDuplicacao();
    const { POST } = await import("./route");
    const res = await POST(req({ name: "padrão" }), ctx(PADRAO));
    expect(res.status).toBe(422);
    expect(db.rpcs.filter((r) => r.nome === "fn_crm_duplicar")).toEqual([]);
  });

  it("corrida (23505 na função) → 409", async () => {
    authOk();
    dbComDuplicacao({ code: "23505", message: "duplicate key" });
    const { POST } = await import("./route");
    const res = await POST(req({ name: "Cópia" }), ctx(PADRAO));
    expect(res.status).toBe(409);
  });

  it("CRM sumiu entre a leitura e a função (P0002) → 404", async () => {
    authOk();
    dbComDuplicacao({ code: "P0002", message: "crm_nao_encontrado" });
    const { POST } = await import("./route");
    const res = await POST(req({ name: "Cópia" }), ctx(PADRAO));
    expect(res.status).toBe(404);
  });
});
