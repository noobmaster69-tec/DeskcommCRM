import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { crmDaConversa, garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";

import { pgComoSupabase } from "../pg-como-supabase";

/**
 * ROTEAMENTO POR NÚMERO E UM LEAD ABERTO POR CRM (Funis no modelo Kommo, Fase D;
 * migration 9009) — o que só o Postgres responde, com a função de nascimento de
 * verdade e o RPC de verdade:
 *
 * 1. Conversa de número VINCULADO nasce na Etapa de entrada do funil principal
 *    do CRM do vínculo; número SEM vínculo, no CRM padrão.
 * 2. Lead aberto no CRM A não segura card no CRM B; segura no próprio A — no
 *    código E dentro da trava do RPC (`fn_nascer_lead_da_conversa`).
 * 3. Arquivar CRM (`fn_crm_arquivar`) leva os funis — o principal inclusive — e
 *    os vínculos de número; número que apontava para ele cai no padrão. Funil
 *    que volta do arquivo num CRM sem principal vira o principal. A guarda do
 *    principal continua valendo em CRM vivo.
 * 4. A função de arquivar é invoker: agent não arquiva (a RLS manager+ decide).
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 3 });
const db = pgComoSupabase(pool);

const ORG = "9009aaaa-0000-4000-8000-000000000001";
const AGENT = "9009aaaa-1111-4000-8000-000000000001";
const S_PA = "9009aaaa-2222-4000-8000-000000000001";
const S_SOLTO = "9009aaaa-2222-4000-8000-000000000002";
const S_VELHO = "9009aaaa-2222-4000-8000-000000000003";
const C_PA = "9009aaaa-3333-4000-8000-000000000001";
const C_SOLTO = "9009aaaa-3333-4000-8000-000000000002";
const C_VELHO = "9009aaaa-3333-4000-8000-000000000003";

let contato = "";
let crmPadrao = "";
let crmPa = "";
let crmVelho = "";
let funilPa = "";
let entradaPa = "";
let funilPadrao = "";
let entradaPadrao = "";

async function um<T>(texto: string, params: unknown[] = []): Promise<T> {
  return (await pool.query(texto, params)).rows[0] as T;
}

async function sqlstate(texto: string, params: unknown[] = []): Promise<string | null> {
  try {
    await pool.query(texto, params);
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
}

/** Roda como o usuário (role `authenticated` + JWT), numa transação desfeita no fim. */
async function comoUsuario(userId: string, texto: string, params: unknown[] = []): Promise<string | null> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    await cliente.query("set local role authenticated");
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    await cliente.query(texto, params);
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  } finally {
    await cliente.query("rollback");
    cliente.release();
  }
}

const nascer = (conversa: string) =>
  garantirLeadDaConversa(db, { organizationId: ORG, contactId: contato, conversationId: conversa, nomeDoContato: "Ana" });

beforeAll(async () => {
  // O gatilho de seed cria o funil "Pedidos" no CRM padrão, já principal e com entrada.
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name) values ($1, 'roteamento-9009', 'Roteamento', 'Roteamento')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(`insert into auth.users (id, email) values ($1, 'f9009-agent@invariant.test') on conflict (id) do nothing`, [AGENT]);
  await pool.query(
    `insert into user_organizations (user_id, organization_id, role, accepted_at) values ($1, $2, 'agent', now()) on conflict do nothing`,
    [AGENT, ORG],
  );
  crmPadrao = (await um<{ id: string }>(`select id from crm_crms where organization_id = $1 and is_default`, [ORG])).id;
  funilPadrao = (await um<{ id: string }>(`select id from crm_pipelines where crm_id = $1 and is_primary`, [crmPadrao])).id;
  entradaPadrao = (await um<{ id: string }>(`select id from crm_stages where pipeline_id = $1 and is_entry`, [funilPadrao])).id;

  crmPa = (await um<{ id: string }>(`insert into crm_crms (organization_id, name, slug) values ($1, 'PA Advogados', 'pa-9009') returning id`, [ORG])).id;
  funilPa = (
    await um<{ id: string }>(
      `insert into crm_pipelines (organization_id, crm_id, name, slug) values ($1, $2, 'Funil da PA', 'funil-pa-9009') returning id`,
      [ORG, crmPa],
    )
  ).id;
  entradaPa = (await um<{ id: string }>(`select id from crm_stages where pipeline_id = $1 and is_entry`, [funilPa])).id;
  crmVelho = (await um<{ id: string }>(`insert into crm_crms (organization_id, name, slug) values ($1, 'Velho', 'velho-9009') returning id`, [ORG])).id;
  await pool.query(`insert into crm_pipelines (organization_id, crm_id, name, slug) values ($1, $2, 'Funil velho', 'funil-velho-9009')`, [
    ORG,
    crmVelho,
  ]);

  for (const [id, nome] of [
    [S_PA, "pa"],
    [S_SOLTO, "solto"],
    [S_VELHO, "velho"],
  ] as const) {
    await pool.query(
      `insert into channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
       values ($1, $2, $3, '\\x00'::bytea) on conflict (id) do nothing`,
      [id, ORG, `f9009_${nome}`],
    );
  }
  await pool.query(`insert into crm_waha_session_bindings (organization_id, channel_session_id, crm_id) values ($1, $2, $3)`, [ORG, S_PA, crmPa]);
  await pool.query(`insert into crm_waha_session_bindings (organization_id, channel_session_id, crm_id) values ($1, $2, $3)`, [
    ORG,
    S_VELHO,
    crmVelho,
  ]);

  contato = (await um<{ id: string }>(`insert into contacts (organization_id, display_name, source) values ($1, 'Ana', 'whatsapp') returning id`, [ORG])).id;
  for (const [id, sessao] of [
    [C_PA, S_PA],
    [C_SOLTO, S_SOLTO],
    [C_VELHO, S_VELHO],
  ] as const) {
    await pool.query(`insert into conversations (id, organization_id, contact_id, channel_session_id, status) values ($1, $2, $3, $4, 'open')`, [
      id,
      ORG,
      contato,
      sessao,
    ]);
  }
});

afterAll(async () => {
  await pool.query("delete from organizations where id = $1", [ORG]);
  await pool.end();
});

describe("roteamento por número", () => {
  it("o número vinculado leva ao CRM do vínculo; o solto, ao padrão", async () => {
    expect(await crmDaConversa(db, ORG, C_PA)).toEqual({ crmId: crmPa, motivo: "vinculo", channelSessionId: S_PA });
    expect(await crmDaConversa(db, ORG, C_SOLTO)).toEqual({ crmId: crmPadrao, motivo: "padrao", channelSessionId: S_SOLTO });
  });

  it("conversa do número da PA nasce na Etapa de entrada do funil principal da PA", async () => {
    expect(await nascer(C_PA)).toMatchObject({ criado: true, pipelineId: funilPa, stageId: entradaPa });
  });

  it("o MESMO contato, pelo número solto, ganha card no CRM padrão — o lead da PA não segura", async () => {
    expect(await nascer(C_SOLTO)).toMatchObject({ criado: true, pipelineId: funilPadrao, stageId: entradaPadrao });
  });

  it("de volta pelo número da PA: já tem lead aberto NESTE CRM → ja_existe", async () => {
    expect(await nascer(C_PA)).toEqual({ criado: false, motivo: "ja_existe" });
    const n = await um<{ n: string }>(`select count(*) n from crm_leads where contact_id = $1 and status = 'open'`, [contato]);
    expect(Number(n.n)).toBe(2);
  });

  it("o RPC aplica a mesma régua dentro da trava: NULL no CRM com lead aberto", async () => {
    const r = await um<{ id: string | null }>(
      `select public.fn_nascer_lead_da_conversa($1, $2, $3, $4, 'Duplicado', 'whatsapp') as id`,
      [ORG, contato, funilPa, entradaPa],
    );
    expect(r.id).toBeNull();
  });
});

describe("mover o card para outro funil do MESMO CRM (Fase E)", () => {
  it("funil e etapa mudam juntos no banco; entrar no ganho do funil novo fecha como ganho", async () => {
    const sdr = (
      await um<{ id: string }>(
        `insert into crm_pipelines (organization_id, crm_id, name, slug) values ($1, $2, $3, $4) returning id`,
        [ORG, crmPa, "SDR da PA", "sdr-pa-9009"],
      )
    ).id;
    // Funil adicional: não é principal, não ganha entrada (9007).
    expect((await um<{ is_primary: boolean }>(`select is_primary from crm_pipelines where id = $1`, [sdr])).is_primary).toBe(false);
    const reuniao = (
      await um<{ id: string }>(
        `insert into crm_stages (organization_id, pipeline_id, name, slug, position) values ($1, $2, $3, $4, 1000) returning id`,
        [ORG, sdr, "Reunião", "reuniao"],
      )
    ).id;
    const ganho = (
      await um<{ id: string }>(
        `insert into crm_stages (organization_id, pipeline_id, name, slug, position, is_won) values ($1, $2, $3, $4, 2000, true) returning id`,
        [ORG, sdr, "Ganho", "ganho"],
      )
    ).id;
    const lead = (await um<{ id: string }>(`select id from crm_leads where contact_id = $1 and pipeline_id = $2`, [contato, funilPa])).id;

    await pool.query(`update crm_leads set pipeline_id = $2, stage_id = $3 where id = $1`, [lead, sdr, reuniao]);
    expect(await um(`select pipeline_id, stage_id, status from crm_leads where id = $1`, [lead])).toEqual({
      pipeline_id: sdr,
      stage_id: reuniao,
      status: "open",
    });

    await pool.query(`update crm_leads set stage_id = $2 where id = $1`, [lead, ganho]);
    expect((await um<{ status: string }>(`select status from crm_leads where id = $1`, [lead])).status).toBe("won");
  });
});

describe("arquivar CRM (9009)", () => {
  it("fn_crm_arquivar leva funis (o principal inclusive) e vínculos; o número dele cai no padrão", async () => {
    await pool.query(`select public.fn_crm_arquivar($1)`, [crmVelho]);
    const crm = await um<{ archived_at: string | null }>(`select archived_at from crm_crms where id = $1`, [crmVelho]);
    expect(crm.archived_at).not.toBeNull();
    const funis = await pool.query(`select is_primary, is_archived from crm_pipelines where crm_id = $1`, [crmVelho]);
    expect(funis.rows).toEqual([{ is_primary: false, is_archived: true }]);
    const vinculos = await um<{ n: string }>(`select count(*) n from crm_waha_session_bindings where crm_id = $1`, [crmVelho]);
    expect(Number(vinculos.n)).toBe(0);
    expect((await crmDaConversa(db, ORG, C_VELHO)).motivo).toBe("padrao");
  });

  it("funil que volta do arquivo num CRM sem principal vira o principal, com a entrada", async () => {
    const f = await um<{ id: string }>(`update crm_pipelines set is_archived = false where crm_id = $1 returning id`, [crmVelho]);
    expect((await um<{ is_primary: boolean }>(`select is_primary from crm_pipelines where id = $1`, [f.id])).is_primary).toBe(true);
    const entradas = await um<{ n: string }>(`select count(*) n from crm_stages where pipeline_id = $1 and is_entry`, [f.id]);
    expect(Number(entradas.n)).toBe(1);
  });

  it("em CRM VIVO a guarda do principal continua: desmarcar → PT409", async () => {
    expect(await sqlstate(`update crm_pipelines set is_primary = false where id = $1`, [funilPa])).toBe("PT409");
  });

  it("agent não arquiva CRM: a função é invoker e a RLS manager+ não deixa achar a linha", async () => {
    expect(await comoUsuario(AGENT, `select public.fn_crm_arquivar($1)`, [crmPa])).toBe("P0002");
    expect((await um<{ archived_at: string | null }>(`select archived_at from crm_crms where id = $1`, [crmPa])).archived_at).toBeNull();
  });

  it("fn_crm_arquivar não é executável por anon", async () => {
    const r = await um<{ pode: boolean }>(`select has_function_privilege('anon', 'public.fn_crm_arquivar(uuid)', 'execute') as pode`);
    expect(r.pode).toBe(false);
  });
});
