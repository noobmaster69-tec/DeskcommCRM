// @vitest-environment node
//
// QUEM FALA PRIMEIRO É A LOJA — e a conversa também vira card.
//
// Antes, só a ENTRADA (`lib/channels/pos-entrada.ts`) abria demanda: a pessoa
// abordada pelo celular ou pela tela do CRM ficava no inbox, fora do funil, até
// responder. `lib/channels/pos-saida.ts` fecha esse buraco com uma régua mais
// estreita: card só para contato que NUNCA teve lead, porque a loja também
// escreve para quem já comprou (entrega, prazo) e isso não é demanda nova.
//
// O `garantirLeadDaConversa` aqui é o REAL; só o banco é de mentira. O banco
// falso aplica os filtros `.eq()` de verdade sobre a lista de leads — sem isso,
// tirar o `status = open` da busca passaria verde.

import { beforeEach, describe, expect, it, vi } from "vitest";

const ehContatoDoNumeroInterno = vi.fn(async () => false);
vi.mock("@/lib/escalacao/numero-interno-de-aviso", () => ({
  ehContatoDoNumeroInterno: (...a: unknown[]) => ehContatoDoNumeroInterno(...(a as [])),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/contacts/cliente-pela-agenda", () => ({
  lerClientePelaAgenda: async () => false,
}));
vi.mock("@/lib/campanhas/origem-do-lead", () => ({
  origemDeCampanhaDaConversa: async () => null,
  marcaDaOrigem: () => null,
}));
const audit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
const emitLeadActivity = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: (...a: unknown[]) => emitLeadActivity(...a),
}));

import { aplicarEfeitosPosSaida } from "@/lib/channels/pos-saida";
import { garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTATO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONVERSA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Lead = { id: string; organization_id: string; contact_id: string; status: string; pipeline_id?: string };

/**
 * O CRM de cada funil (Funis no modelo Kommo, Fase D): a régua "um lead aberto"
 * passou a valer POR CRM. `funil-entrada` é o destino do nascimento; um lead em
 * `funil-de-outro-crm` não segura o card novo.
 */
const CRM_DO_FUNIL: Record<string, string> = { "funil-entrada": "crm-1", "funil-de-outro-crm": "crm-2" };

let leads: Lead[] = [];
let rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];

/**
 * Builder encadeável do PostgREST; o efeito acontece no `maybeSingle()` (uma
 * linha) ou no `await` direto (lista — a leitura das demandas do contato e o
 * CRM dos funis, desde a Fase D).
 */
function banco() {
  const tabela = (nome: string) => {
    const filtros: Array<[string, unknown]> = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "is", "in"]) b[m] = () => b;
    const lista = () => {
      if (nome === "crm_leads") {
        return leads
          .filter((l) => filtros.every(([col, val]) => (l as Record<string, unknown>)[col] === val))
          .map((l) => ({ ...l, pipeline_id: l.pipeline_id ?? "funil-entrada" }));
      }
      if (nome === "crm_pipelines") {
        return Object.entries(CRM_DO_FUNIL).map(([id, crm_id]) => ({ id, crm_id }));
      }
      return [];
    };
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: lista(), error: null }).then(ok);
    b.eq = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return b;
    };
    b.maybeSingle = async () => {
      if (nome === "contacts") {
        return { data: { is_blocked: false, display_name: "Maria Cliente", name: null, phone_number: "5531999990000" }, error: null };
      }
      if (nome === "crm_leads") {
        const achados = leads.filter((l) =>
          filtros.every(([col, val]) => (l as Record<string, unknown>)[col] === val),
        );
        return { data: achados[0] ?? null, error: null };
      }
      if (nome === "crm_pipelines") return { data: { id: "funil-entrada" }, error: null };
      if (nome === "crm_stages") return { data: { id: "etapa-1" }, error: null };
      return { data: null, error: null };
    };
    return b;
  };
  return {
    from: tabela,
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      if (nome === "fn_nascer_lead_da_conversa") return { data: "lead-novo", error: null };
      return { data: null, error: null };
    },
  } as never;
}

const nasceu = () => rpcs.some((r) => r.nome === "fn_nascer_lead_da_conversa");

const saida = { organizationId: ORG, contactId: CONTATO, conversationId: CONVERSA, origem: "celular" };

beforeEach(() => {
  leads = [];
  rpcs = [];
  ehContatoDoNumeroInterno.mockReset().mockResolvedValue(false);
  emitLeadActivity.mockClear();
  audit.mockClear();
});

describe("pos-saida: a loja fala primeiro", () => {
  it("contato que nunca teve card ganha card no funil de entrada", async () => {
    await aplicarEfeitosPosSaida(banco(), saida);

    expect(nasceu(), "o envio para um contato novo tem de abrir a demanda").toBe(true);
    const rpc = rpcs.find((r) => r.nome === "fn_nascer_lead_da_conversa")!;
    expect(rpc.args).toMatchObject({ p_org: ORG, p_contact: CONTATO, p_pipeline: "funil-entrada", p_stage: "etapa-1" });
    // O título vem do cadastro — no envio, o nome do payload é o da loja.
    expect(rpc.args.p_title).toBe("Maria Cliente");
    // A timeline diz que quem falou primeiro foi a loja.
    expect(emitLeadActivity.mock.calls[0]?.[1]).toMatchObject({ reason: "primeira mensagem enviada no WhatsApp" });
  });

  it("contato com card FECHADO não ganha card novo (entrega pós-venda)", async () => {
    leads = [{ id: "lead-antigo", organization_id: ORG, contact_id: CONTATO, status: "won" }];

    await aplicarEfeitosPosSaida(banco(), saida);

    expect(nasceu(), "mandar o retrato para quem já comprou não é demanda nova").toBe(false);
  });

  it("contato com card ABERTO não ganha um segundo", async () => {
    leads = [{ id: "lead-aberto", organization_id: ORG, contact_id: CONTATO, status: "open" }];

    await aplicarEfeitosPosSaida(banco(), saida);

    expect(nasceu()).toBe(false);
  });

  it("card de OUTRA organização não conta", async () => {
    leads = [{ id: "lead-alheio", organization_id: "outra-org", contact_id: CONTATO, status: "won" }];

    await aplicarEfeitosPosSaida(banco(), saida);

    expect(nasceu(), "a régua de 'já teve lead' é por organização").toBe(true);
  });

  it("o número interno de avisos nunca vira card", async () => {
    ehContatoDoNumeroInterno.mockResolvedValue(true);

    await aplicarEfeitosPosSaida(banco(), saida);

    expect(nasceu()).toBe(false);
  });

  it("falha no nascimento não sobe — o envio já aconteceu", async () => {
    ehContatoDoNumeroInterno.mockRejectedValue(new Error("banco fora"));

    await expect(aplicarEfeitosPosSaida(banco(), saida)).resolves.toBeUndefined();
  });
});

describe("a régua da ENTRADA não mudou", () => {
  it("cliente com card fechado que volta a escrever abre demanda nova", async () => {
    leads = [{ id: "lead-antigo", organization_id: ORG, contact_id: CONTATO, status: "lost" }];

    const r = await garantirLeadDaConversa(banco(), {
      organizationId: ORG,
      contactId: CONTATO,
      conversationId: CONVERSA,
      nomeDoContato: null,
    });

    expect(r.criado, "na entrada, só lead ABERTO segura o card novo").toBe(true);
  });

  it("na entrada, card aberto devolve ja_existe", async () => {
    leads = [{ id: "lead-aberto", organization_id: ORG, contact_id: CONTATO, status: "open" }];

    const r = await garantirLeadDaConversa(banco(), {
      organizationId: ORG,
      contactId: CONTATO,
      conversationId: CONVERSA,
      nomeDoContato: null,
    });

    expect(r).toEqual({ criado: false, motivo: "ja_existe" });
  });

  it("card aberto em OUTRO CRM não segura o card novo — um lead aberto por CRM (Fase D)", async () => {
    leads = [{ id: "lead-da-apex", organization_id: ORG, contact_id: CONTATO, status: "open", pipeline_id: "funil-de-outro-crm" }];

    const r = await garantirLeadDaConversa(banco(), {
      organizationId: ORG,
      contactId: CONTATO,
      conversationId: CONVERSA,
      nomeDoContato: null,
    });

    expect(r.criado, "o contato com card na Apex que escreve para o número da PA ganha card na PA").toBe(true);
  });

  it("conversa de número SEM vínculo nasce no CRM padrão e deixa o rastro do fallback na auditoria", async () => {
    const r = await garantirLeadDaConversa(banco(), {
      organizationId: ORG,
      contactId: CONTATO,
      conversationId: CONVERSA,
      nomeDoContato: null,
    });
    expect(r.criado).toBe(true);
    expect(audit.mock.calls.map((c) => (c[0] as { action: string }).action)).toContain("lead.crm_fallback");
  });
});
