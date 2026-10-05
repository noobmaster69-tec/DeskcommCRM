import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * ARQUIVAR E COMPARTILHAR FLUXO (migration 9010, fork jhoow — item 2).
 *
 * 1. O baseline aplicado tem `archived_at`, `share_token` (único parcial) e a
 *    função `fn_fluxo_compartilhado`.
 * 2. A função é o ÚNICO caminho para ler um fluxo de outra organização, e só
 *    pelo token: devolve nome e grafo, nada mais; token nulo, desconhecido ou
 *    de ponteiro que não é `fluxo` devolve vazio; anon não executa.
 * 3. A RLS do ponteiro continua por organização (o token não abre a tabela).
 * 4. Reaplicar o bloco do baseline não muda nada (é o `update.sh`).
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

const ORG_A = "90100000-0000-4000-8000-00000000000a";
const ORG_B = "90100000-0000-4000-8000-00000000000b";
const MANAGER_A = "90100000-1111-4000-8000-00000000000a";
const MANAGER_B = "90100000-1111-4000-8000-00000000000b";
const FLUXO_A = "90100000-3333-4000-8000-00000000000a";
const FOLLOWUP_A = "90100000-3333-4000-8000-00000000000f";
const TOKEN = "90100000-4444-4000-8000-000000000001";
const TOKEN_FOLLOWUP = "90100000-4444-4000-8000-000000000002";
const GRAFO = `{"nodes":[{"id":"t1","type":"trigger","label":"Início","position":{"x":0,"y":0},"config":{}}],"edges":[]}`;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER_A}', 'f9010-mgr-a@invariant.test'),
      ('${MANAGER_B}', 'f9010-mgr-b@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'f9010-inv-a', 'Fluxo A', 'F9010 A'),
      ('${ORG_B}', 'f9010-inv-b', 'Fluxo B', 'F9010 B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.followup_flow_pointers (id, organization_id, name, surface, draft_graph, share_token) values
      ('${FLUXO_A}', '${ORG_A}', 'F9010 boas-vindas', 'fluxo', '${GRAFO}'::jsonb, '${TOKEN}'),
      ('${FOLLOWUP_A}', '${ORG_A}', 'F9010 follow-up', 'followup', '${GRAFO}'::jsonb, '${TOKEN_FOLLOWUP}')
      on conflict (id) do nothing;
  `);
});

describe("schema no baseline", () => {
  it("as colunas existem e são opcionais", () => {
    expect(
      sql(`select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by column_name)
             from information_schema.columns
            where table_schema = 'public' and table_name = 'followup_flow_pointers'
              and column_name in ('archived_at', 'share_token')`),
    ).toBe("archived_at:timestamp with time zone:YES,share_token:uuid:YES");
  });

  it("o token é único (dois fluxos não dividem um link)", () => {
    expect(
      sqlstate(`update public.followup_flow_pointers set share_token = '${TOKEN}' where id = '${FOLLOWUP_A}'`),
    ).toBe("23505");
  });

  it("a função é definer ESTÁVEL e anon não executa", () => {
    expect(
      sql(`select p.prosecdef::text || ':' || p.provolatile::text from pg_proc p
            where p.oid = 'public.fn_fluxo_compartilhado(uuid)'::regprocedure`),
    ).toBe("true:s");
    expect(sql(`select has_function_privilege('anon', 'public.fn_fluxo_compartilhado(uuid)', 'execute')`)).toBe("f");
    expect(
      sql(`select has_function_privilege('authenticated', 'public.fn_fluxo_compartilhado(uuid)', 'execute')`),
    ).toBe("t");
  });
});

describe("o link compartilhado", () => {
  it("quem é de OUTRA organização lê nome e grafo pelo token", () => {
    expect(como(MANAGER_B, `select nome || '|' || (grafo->'nodes'->0->>'id') from public.fn_fluxo_compartilhado('${TOKEN}')`)).toBe(
      "F9010 boas-vindas|t1",
    );
  });

  it("devolve só nome e grafo — nenhuma coluna a mais", () => {
    expect(
      sql(`select string_agg(a, ',' order by a) from (
             select unnest(proargnames) as a from pg_proc
              where oid = 'public.fn_fluxo_compartilhado(uuid)'::regprocedure) x`),
    ).toBe("grafo,nome,p_token");
  });

  it("token nulo, desconhecido ou de um follow-up não devolve nada", () => {
    expect(como(MANAGER_B, `select count(*) from public.fn_fluxo_compartilhado(null)`)).toBe("0");
    expect(
      como(MANAGER_B, `select count(*) from public.fn_fluxo_compartilhado('90100000-4444-4000-8000-0000000000ff')`),
    ).toBe("0");
    expect(como(MANAGER_B, `select count(*) from public.fn_fluxo_compartilhado('${TOKEN_FOLLOWUP}')`)).toBe("0");
  });

  it("o token não abre a tabela: a RLS do ponteiro segue por organização", () => {
    expect(como(MANAGER_B, `select count(*) from public.followup_flow_pointers where id = '${FLUXO_A}'`)).toBe("0");
    expect(como(MANAGER_A, `select count(*) from public.followup_flow_pointers where id = '${FLUXO_A}'`)).toBe("1");
  });
});

describe("reaplicar", () => {
  it("o bloco do baseline roda de novo sem erro e sem mudar dado", () => {
    const bloco = blocoDoBaseline("-- ---- fluxos: arquivar e compartilhar (migration 9010) ----");
    sql(bloco);
    sql(bloco);
    expect(sql(`select share_token from public.followup_flow_pointers where id = '${FLUXO_A}'`)).toBe(TOKEN);
  });
});
