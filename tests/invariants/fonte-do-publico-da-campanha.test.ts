import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * FONTE DO PÚBLICO DA CAMPANHA (migration 9017, fork jhoow — Campanhas › item 1).
 * A lista importada: RLS (a org lê, manager escreve e apaga, vizinho não vê),
 * FK da campanha em cascata, bucket privado, anon sem acesso, reaplicação.
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

const ORG_A = "90170000-0000-4000-8000-00000000000a";
const ORG_B = "90170000-0000-4000-8000-00000000000b";
const MANAGER_A = "90170000-1111-4000-8000-00000000000a";
const AGENT_A = "90170000-1111-4000-8000-0000000000aa";
const MANAGER_B = "90170000-1111-4000-8000-00000000000b";
const LISTA = "90170000-2222-4000-8000-00000000000a";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER_A}', 'f9017-mgr-a@invariant.test'), ('${AGENT_A}', 'f9017-agent-a@invariant.test'),
      ('${MANAGER_B}', 'f9017-mgr-b@invariant.test') on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'f9017-inv-a', 'Fonte A', 'F9017 A'), ('${ORG_B}', 'f9017-inv-b', 'Fonte B', 'F9017 B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()), ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now()) on conflict do nothing;
  `);
});

describe("campaign_audience_sources", () => {
  it("manager cria; agent lê; o vizinho não vê", () => {
    como(
      MANAGER_A,
      `insert into public.campaign_audience_sources (id, organization_id, mode, contact_ids, estimated_recipients)
       values ('${LISTA}', '${ORG_A}', 'import', '{}', 0); select 1;`,
    );
    expect(como(AGENT_A, `select count(*) from public.campaign_audience_sources where organization_id = '${ORG_A}'`)).toBe("1");
    expect(como(MANAGER_B, `select count(*) from public.campaign_audience_sources where organization_id = '${ORG_A}'`)).toBe("0");
  });

  it("agent não cria, não altera e não apaga", () => {
    expect(
      sqlstate(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
        insert into public.campaign_audience_sources (organization_id, mode) values ('${ORG_A}', 'import');`),
    ).toBe("42501");
    expect(como(AGENT_A, `with x as (update public.campaign_audience_sources set estimated_recipients = 9 where id = '${LISTA}' returning 1) select count(*) from x`)).toBe("0");
    expect(como(AGENT_A, `with x as (delete from public.campaign_audience_sources where id = '${LISTA}' returning 1) select count(*) from x`)).toBe("0");
    expect(sql(`select count(*) from public.campaign_audience_sources where id = '${LISTA}' and estimated_recipients = 0`)).toBe("1");
  });

  it("o manager do vizinho não grava na organização alheia", () => {
    expect(
      sqlstate(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${MANAGER_B}"}', false);
        insert into public.campaign_audience_sources (organization_id, mode) values ('${ORG_A}', 'import');`),
    ).toBe("42501");
    expect(como(MANAGER_B, `with x as (delete from public.campaign_audience_sources where id = '${LISTA}' returning 1) select count(*) from x`)).toBe("0");
  });

  it("modo e jsonb são do banco", () => {
    expect(sqlstate(`insert into public.campaign_audience_sources (organization_id, mode) values ('${ORG_A}', 'planilha')`)).toBe("23514");
    expect(sqlstate(`insert into public.campaign_audience_sources (organization_id, mode, config) values ('${ORG_A}', 'import', '[]')`)).toBe("23514");
  });

  it("bucket do arquivo original é privado", () => {
    expect(sql(`select public from storage.buckets where id = 'campaign-audiences'`)).toBe("f");
  });

  it("anon sem acesso; reaplicar não muda nada", () => {
    expect(sql(`select has_table_privilege('anon', 'public.campaign_audience_sources', 'select')`)).toBe("f");
    const bloco = blocoDoBaseline("-- ---- fonte do público da campanha (migration 9017) ----");
    sql(bloco);
    sql(bloco);
    expect(sql(`select count(*) from public.campaign_audience_sources where organization_id = '${ORG_A}'`)).toBe("1");
  });
});
