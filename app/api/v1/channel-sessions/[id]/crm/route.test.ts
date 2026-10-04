import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
// Este teste isola o handler; autoridade de suporte é exercitada na suíte própria.
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireSupportWrite: vi.fn(async () => null),
}));

import { ORG_ID, OUTRA_ORG, authOk, makeDb } from "@/tests/helpers/stages-db-double";

// Ligar um número de WhatsApp a um CRM (Funis no modelo Kommo, Fase D). O que
// estes testes guardam: o corte de papel, a organização vinda da sessão (nunca
// do corpo), o CRM vivo, a troca reescrevendo a MESMA linha e a auditoria.

const SESSAO = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const SESSAO_ALHEIA = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const APEX = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const PA = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const ARQUIVADO = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";

const ctx = (id = SESSAO) => ({ params: Promise.resolve({ id }) });
const reqPut = (body: unknown) =>
  new NextRequest(`http://localhost/api/v1/channel-sessions/${SESSAO}/crm`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

function banco(vinculos: Array<Record<string, unknown>> = []) {
  const db = makeDb({
    crms: [
      { id: APEX, organization_id: ORG_ID, name: "Apex", archived_at: null },
      { id: PA, organization_id: ORG_ID, name: "PA Advogados", archived_at: null },
      { id: ARQUIVADO, organization_id: ORG_ID, name: "Velho", archived_at: "2026-10-01T00:00:00Z" },
    ],
  });
  const tabelas = db.tabelas as unknown as Record<string, Array<Record<string, unknown>>>;
  tabelas.channel_sessions = [
    { id: SESSAO, organization_id: ORG_ID, waha_session_name: "org_x", phone_number: "5511961170212", display_name: "Vendas" },
    { id: SESSAO_ALHEIA, organization_id: OUTRA_ORG, waha_session_name: "org_y", phone_number: "5511900000000" },
  ];
  tabelas.crm_waha_session_bindings = vinculos;
  return { db, vinculos: () => tabelas.crm_waha_session_bindings! };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/v1/channel-sessions/[id]/crm", () => {
  it("exige manager", async () => {
    authOk();
    banco();
    const { PUT } = await import("./route");
    await PUT(reqPut({ crm_id: APEX }), ctx());
    expect(vi.mocked(requireRole).mock.calls[0]?.[0]).toBe("manager");
  });

  it("liga o número ao CRM, com a org da sessão, e audita crm.number_bound", async () => {
    authOk();
    const { db, vinculos } = banco();
    const { PUT } = await import("./route");
    const res = await PUT(reqPut({ crm_id: APEX }), ctx());
    expect(res.status).toBe(200);
    expect(db.escritas.map((e) => `${e.tipo}:${e.table}`)).toEqual(["insert:crm_waha_session_bindings"]);
    expect(vinculos()[0]).toMatchObject({ organization_id: ORG_ID, channel_session_id: SESSAO, crm_id: APEX });
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({
      action: "crm.number_bound",
      metadata: { crm_anterior: null, crm_novo: APEX },
    });
  });

  it("trocar de CRM reescreve a MESMA linha — um número, um CRM", async () => {
    authOk();
    const { db, vinculos } = banco([{ organization_id: ORG_ID, channel_session_id: SESSAO, crm_id: APEX }]);
    const { PUT } = await import("./route");
    expect((await PUT(reqPut({ crm_id: PA }), ctx())).status).toBe(200);
    expect(db.escritas.map((e) => e.tipo)).toEqual(["update"]);
    expect(vinculos()).toHaveLength(1);
    expect(vinculos()[0]?.crm_id).toBe(PA);
  });

  it("desvincular apaga o vínculo (o número volta ao CRM padrão) e audita crm.number_unbound", async () => {
    authOk();
    const { db, vinculos } = banco([{ organization_id: ORG_ID, channel_session_id: SESSAO, crm_id: APEX }]);
    const { PUT } = await import("./route");
    expect((await PUT(reqPut({ crm_id: null }), ctx())).status).toBe(200);
    expect(db.escritas.map((e) => e.tipo)).toEqual(["delete"]);
    expect(vinculos()).toHaveLength(0);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "crm.number_unbound" });
  });

  it("pedir o estado que já está não escreve nem audita", async () => {
    authOk();
    const { db } = banco([{ organization_id: ORG_ID, channel_session_id: SESSAO, crm_id: APEX }]);
    const { PUT } = await import("./route");
    expect((await PUT(reqPut({ crm_id: APEX }), ctx())).status).toBe(200);
    expect(db.escritas).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("CRM arquivado ou inexistente → 422, e nenhuma escrita", async () => {
    authOk();
    const { db } = banco();
    const { PUT } = await import("./route");
    expect((await PUT(reqPut({ crm_id: ARQUIVADO }), ctx())).status).toBe(422);
    expect((await PUT(reqPut({ crm_id: "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6" }), ctx())).status).toBe(422);
    expect(db.escritas).toEqual([]);
  });

  it("número de OUTRA organização → 404, igual a inexistente, e nenhuma escrita", async () => {
    authOk();
    const { db } = banco();
    const { PUT } = await import("./route");
    expect((await PUT(reqPut({ crm_id: APEX }), ctx(SESSAO_ALHEIA))).status).toBe(404);
    expect(db.escritas).toEqual([]);
  });

  it("corpo sem crm_id → 422 do Zod", async () => {
    authOk();
    banco();
    const { PUT } = await import("./route");
    expect((await PUT(reqPut({}), ctx())).status).toBe(422);
  });
});
