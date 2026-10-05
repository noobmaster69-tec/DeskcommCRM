import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * VARIÁVEIS DA ORGANIZAÇÃO (migration 9013, fork jhoow — Campanhas › item 2).
 * A tabela de definições: formato da chave, unicidade por org, RLS (a org lê,
 * manager escreve, vizinho não vê), anon sem acesso, reaplicação.
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

const ORG_A = "90130000-0000-4000-8000-00000000000a";
const ORG_B = "90130000-0000-4000-8000-00000000000b";
const MANAGER_A = "90130000-1111-4000-8000-00000000000a";
const AGENT_A = "90130000-1111-4000-8000-0000000000aa";
const MANAGER_B = "90130000-1111-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER_A}', 'f9013-mgr-a@invariant.test'), ('${AGENT_A}', 'f9013-agent-a@invariant.test'),
      ('${MANAGER_B}', 'f9013-mgr-b@invariant.test') on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'f9013-inv-a', 'Variáveis A', 'F9013 A'), ('${ORG_B}', 'f9013-inv-b', 'Variáveis B', 'F9013 B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()), ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now()) on conflict do nothing;
  `);
});

describe("contact_custom_fields", () => {
  it("manager cria; agent lê; o vizinho não vê", () => {
    como(MANAGER_A, `insert into public.contact_custom_fields (organization_id, key, label) values ('${ORG_A}', 'interesse', 'Interesse'); select 1;`);
    expect(como(AGENT_A, `select count(*) from public.contact_custom_fields where organization_id = '${ORG_A}'`)).toBe("1");
    expect(como(MANAGER_B, `select count(*) from public.contact_custom_fields where organization_id = '${ORG_A}'`)).toBe("0");
  });

  it("agent não escreve", () => {
    expect(
      sqlstate(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
        insert into public.contact_custom_fields (organization_id, key, label) values ('${ORG_A}', 'plano', 'Plano');`),
    ).toBe("42501");
  });

  it("formato da chave e tipo são do banco; chave única por organização", () => {
    expect(sqlstate(`insert into public.contact_custom_fields (organization_id, key, label) values ('${ORG_A}', 'Com Espaco', 'x')`)).toBe("23514");
    expect(sqlstate(`insert into public.contact_custom_fields (organization_id, key, label, type) values ('${ORG_A}', 'ok_key', 'x', 'cor')`)).toBe("23514");
    expect(sqlstate(`insert into public.contact_custom_fields (organization_id, key, label) values ('${ORG_A}', 'interesse', 'De novo')`)).toBe("23505");
    sql(`insert into public.contact_custom_fields (organization_id, key, label) values ('${ORG_B}', 'interesse', 'Mesma chave, outra org')`);
  });

  it("anon sem acesso; reaplicar não muda nada", () => {
    expect(sql(`select has_table_privilege('anon', 'public.contact_custom_fields', 'select')`)).toBe("f");
    const bloco = blocoDoBaseline("-- ---- variáveis da organização (migration 9013) ----");
    sql(bloco);
    sql(bloco);
    expect(sql(`select count(*) from public.contact_custom_fields where organization_id = '${ORG_A}'`)).toBe("1");
  });
});
