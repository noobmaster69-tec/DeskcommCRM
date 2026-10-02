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
const emitLeadActivity = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: (...a: unknown[]) => emitLeadActivity(...a),
}));

import { aplicarEfeitosPosSaida } from "@/lib/channels/pos-saida";
import { garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTATO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONVERSA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Lead = { id: string; organization_id: string; contact_id: string; status: string };

let leads: Lead[] = [];
let rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];

/** Builder encadeável do PostgREST; o efeito acontece no `maybeSingle()`. */
function banco() {
  const tabela = (nome: string) => {
    const filtros: Array<[string, unknown]> = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit"]) b[m] = () => b;
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
});
