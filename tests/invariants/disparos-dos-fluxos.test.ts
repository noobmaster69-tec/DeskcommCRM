import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * DISPAROS DOS FLUXOS (migration 9011, fork jhoow — item 12).
 *
 * 1. As duas tabelas existem no baseline com os CHECKs (lógica and/or,
 *    condições em array, horas 1..720).
 * 2. RLS: a organização lê; só manager+ escreve; ninguém vê o vizinho.
 * 3. O fluxo apontado é da MESMA organização (FK composta) e apagar o fluxo
 *    não apaga a configuração — o destino vira nulo.
 * 4. Apagar a organização leva tudo junto; reaplicar o bloco não muda nada.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

function sqlstate(script: string): string | null {
  try {
    sql(`\\set VERBOSITY verbose\n${script}`);
    return null;
  } catch (err) {
    const saida = String((err as { stderr?: string }).stderr ?? err);
    return /ERROR:\s+([0-9A-Z]{5})/.exec(saida)?.[1] ?? saida;
  }
}

function como(userId: string, script: string): string {
  return (
    sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${script}
  `)
      .split("\n")
      .pop() ?? ""
  );
}

function blocoDoBaseline(rotulo: string): string {
  const baseline = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
  const inicio = baseline.lastIndexOf(rotulo);
  if (inicio < 0) throw new Error(`bloco ausente do baseline: ${rotulo}`);
  const proximo = baseline.indexOf("\n-- ---- ", inicio + rotulo.length);
  return baseline.slice(inicio, proximo < 0 ? undefined : proximo);
}

const ORG_A = "90110000-0000-4000-8000-00000000000a";
const ORG_B = "90110000-0000-4000-8000-00000000000b";
const MANAGER_A = "90110000-1111-4000-8000-00000000000a";
const AGENT_A = "90110000-1111-4000-8000-0000000000aa";
const MANAGER_B = "90110000-1111-4000-8000-00000000000b";
const FLUXO_A = "90110000-3333-4000-8000-00000000000a";
const FLUXO_A2 = "90110000-3333-4000-8000-0000000000a2";
const FLUXO_B = "90110000-3333-4000-8000-00000000000b";
const PALAVRA_A = "90110000-5555-4000-8000-00000000000a";
const GRAFO = `{"nodes":[],"edges":[]}`;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER_A}', 'f9011-mgr-a@invariant.test'),
      ('${AGENT_A}', 'f9011-agent-a@invariant.test'),
      ('${MANAGER_B}', 'f9011-mgr-b@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'f9011-inv-a', 'Disparos A', 'F9011 A'),
      ('${ORG_B}', 'f9011-inv-b', 'Disparos B', 'F9011 B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.followup_flow_pointers (id, organization_id, name, surface, draft_graph) values
      ('${FLUXO_A}', '${ORG_A}', 'F9011 boas-vindas', 'fluxo', '${GRAFO}'::jsonb),
      ('${FLUXO_A2}', '${ORG_A}', 'F9011 descartável', 'fluxo', '${GRAFO}'::jsonb),
      ('${FLUXO_B}', '${ORG_B}', 'F9011 do vizinho', 'fluxo', '${GRAFO}'::jsonb)
      on conflict (id) do nothing;
  `);
});

describe("schema no baseline", () => {
  it("as duas tabelas existem com RLS ligada", () => {
    expect(
      sql(`select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class
            where relname in ('crm_fluxo_triggers', 'crm_fluxo_global_triggers') and relkind = 'r'`),
    ).toBe("crm_fluxo_global_triggers:true,crm_fluxo_triggers:true");
  });

  it("os CHECKs recusam lógica, condições e horas fora do formato", () => {
    expect(
      sqlstate(`insert into public.crm_fluxo_triggers (organization_id, name, logic_operator) values ('${ORG_A}', 'x', 'xor')`),
    ).toBe("23514");
    expect(
      sqlstate(`insert into public.crm_fluxo_triggers (organization_id, name, conditions) values ('${ORG_A}', 'x', '{}'::jsonb)`),
    ).toBe("23514");
    expect(
      sqlstate(`insert into public.crm_fluxo_global_triggers (organization_id, default_response_hours) values ('${ORG_B}', 0)`),
    ).toBe("23514");
  });

  it("anon não tem acesso", () => {
    expect(sql(`select has_table_privilege('anon', 'public.crm_fluxo_triggers', 'select')`)).toBe("f");
    expect(sql(`select has_table_privilege('anon', 'public.crm_fluxo_global_triggers', 'select')`)).toBe("f");
  });
});

describe("RLS", () => {
  it("manager grava; a organização lê; o vizinho não vê", () => {
    como(
      MANAGER_A,
      `insert into public.crm_fluxo_triggers (id, organization_id, name, fluxo_id, conditions)
       values ('${PALAVRA_A}', '${ORG_A}', 'Palavra-chave 1', '${FLUXO_A}', '[{"operador":"contem","valor":"preço"}]'::jsonb);
       insert into public.crm_fluxo_global_triggers (organization_id, welcome_fluxo_id) values ('${ORG_A}', '${FLUXO_A2}');
       select 1;`,
    );
    expect(como(AGENT_A, `select count(*) from public.crm_fluxo_triggers where organization_id = '${ORG_A}'`)).toBe("1");
    expect(como(MANAGER_B, `select count(*) from public.crm_fluxo_triggers where organization_id = '${ORG_A}'`)).toBe("0");
    expect(como(MANAGER_B, `select count(*) from public.crm_fluxo_global_triggers where organization_id = '${ORG_A}'`)).toBe("0");
  });

  it("agent não escreve", () => {
    expect(
      sqlstate(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
        insert into public.crm_fluxo_triggers (organization_id, name) values ('${ORG_A}', 'do agente');`),
    ).toBe("42501");
  });
});

describe("o fluxo apontado", () => {
  it("só fluxo da mesma organização", () => {
    expect(
      sqlstate(`update public.crm_fluxo_triggers set fluxo_id = '${FLUXO_B}' where id = '${PALAVRA_A}'`),
    ).toBe("23503");
  });

  it("apagar o fluxo deixa a configuração sem destino, sem apagá-la", () => {
    sql(`delete from public.followup_flow_pointers where id = '${FLUXO_A2}'`);
    expect(sql(`select coalesce(welcome_fluxo_id::text, 'nulo') from public.crm_fluxo_global_triggers where organization_id = '${ORG_A}'`)).toBe("nulo");
    sql(`delete from public.followup_flow_pointers where id = '${FLUXO_A}'`);
    expect(sql(`select coalesce(fluxo_id::text, 'nulo') || '|' || name from public.crm_fluxo_triggers where id = '${PALAVRA_A}'`)).toBe(
      "nulo|Palavra-chave 1",
    );
  });
});

describe("reaplicar e apagar a organização", () => {
  it("o bloco do baseline roda de novo sem mudar dado", () => {
    const bloco = blocoDoBaseline("-- ---- disparos dos fluxos (migration 9011) ----");
    sql(bloco);
    sql(bloco);
    expect(sql(`select count(*) from public.crm_fluxo_triggers where organization_id = '${ORG_A}'`)).toBe("1");
  });

  it("apagar a organização leva as duas tabelas junto", () => {
    sql(`delete from public.organizations where id = '${ORG_A}'`);
    expect(sql(`select count(*) from public.crm_fluxo_triggers where organization_id = '${ORG_A}'`)).toBe("0");
    expect(sql(`select count(*) from public.crm_fluxo_global_triggers where organization_id = '${ORG_A}'`)).toBe("0");
  });
});
