import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * AS PASTAS DE FLUXO NÃO VAZAM ENTRE ORGANIZAÇÕES (migration 9002, fork jhoow).
 *
 * `fluxo_pastas` nasceu com RLS (`tenant_isolation_fluxo_pastas_all`: lê quem é
 * da org, escreve manager+) mas sem nenhuma prova comportamental — a varredura
 * `rls-completude-varredura.test.ts` a acusou como tabela tenant-aware nova sem
 * prova. Este arquivo é a prova, no molde de `agenda-rls.test.ts`:
 *
 * 1. Controle positivo: o agent lê as pastas da própria organização. Sem isto, o
 *    jeito trivial de ficar verde seria quebrar a tela de Fluxos inteira.
 * 2. Isolamento: zero linhas do vizinho, nos dois sentidos.
 * 3. Escrita: agent não cria; manager cria na própria e é recusado na do
 *    vizinho; update e delete cruzados não tocam linha nenhuma.
 * 4. anon não tem acesso.
 *
 * Conectar como `postgres` mediria NADA (`rolbypassrls = t`): aqui é
 * `set role authenticated` + `request.jwt.claims`, o caminho da produção.
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

/** Roda e devolve o SQLSTATE do erro, ou `null` se passou. */
function sqlstate(script: string): string | null {
  try {
    sql(`\\set VERBOSITY verbose\n${script}`);
    return null;
  } catch (err) {
    const saida = String((err as { stderr?: string }).stderr ?? err);
    return /ERROR:\s+([0-9A-Z]{5})/.exec(saida)?.[1] ?? saida;
  }
}

/** A última linha da saída como número — a da consulta final, depois do `SET` e do eco do JWT. */
function como(userId: string, consulta: string): number {
  const ultima =
    sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${consulta}
  `)
      .split("\n")
      .pop() ?? "";
  if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${ultima}`);
  return Number(ultima);
}

const ORG_A = "f1a50000-0000-4000-8000-00000000000a";
const ORG_B = "f1a50000-0000-4000-8000-00000000000b";
const AGENT_A = "f1a50000-1111-4000-8000-00000000000a";
const MANAGER_A = "f1a50000-1111-4000-8000-00000000000d";
const AGENT_B = "f1a50000-1111-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}',   'pastas-agent-a@invariant.test'),
      ('${MANAGER_A}', 'pastas-mgr-a@invariant.test'),
      ('${AGENT_B}',   'pastas-agent-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'pastas-inv-a', 'Pastas Invariant A', 'Pastas A'),
      ('${ORG_B}', 'pastas-inv-b', 'Pastas Invariant B', 'Pastas B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}',   '${ORG_A}', 'agent',   now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${AGENT_B}',   '${ORG_B}', 'agent',   now())
      on conflict do nothing;

    insert into public.fluxo_pastas (organization_id, nome)
    select v.org, 'Pasta do invariante'
      from (values ('${ORG_A}'::uuid), ('${ORG_B}'::uuid)) as v(org)
     where not exists (select 1 from public.fluxo_pastas p where p.organization_id = v.org);
  `);
});

describe("fluxo_pastas — leitura", () => {
  it("controle positivo: o agent lê as pastas da própria organização", () => {
    expect(como(AGENT_A, `select count(*) from public.fluxo_pastas where organization_id = '${ORG_A}';`)).toBeGreaterThan(0);
  });

  it("isolamento: zero linhas do vizinho, nos dois sentidos", () => {
    expect(como(AGENT_A, `select count(*) from public.fluxo_pastas where organization_id = '${ORG_B}';`)).toBe(0);
    expect(como(AGENT_B, `select count(*) from public.fluxo_pastas where organization_id = '${ORG_A}';`)).toBe(0);
  });

  it("a tabela inteira, sem filtro, é só a da própria organização", () => {
    expect(como(AGENT_A, `select count(*) from public.fluxo_pastas;`)).toBe(
      como(AGENT_A, `select count(*) from public.fluxo_pastas where organization_id = '${ORG_A}';`),
    );
  });

  it("anon não tem acesso", () => {
    expect(sqlstate(`set role anon; select count(*) from public.fluxo_pastas;`)).toBe("42501");
  });
});

describe("fluxo_pastas — escrita", () => {
  const inserir = (userId: string, org: string, nome: string) =>
    sqlstate(`set role authenticated;
              select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
              insert into public.fluxo_pastas (organization_id, nome) values ('${org}', '${nome}');`);

  it("agent não cria pasta (escrita é manager+)", () => {
    expect(inserir(AGENT_A, ORG_A, "Do agent")).toBe("42501");
  });

  it("manager cria na própria organização e é recusado na do vizinho", () => {
    expect(inserir(MANAGER_A, ORG_A, "Do manager")).toBeNull();
    expect(inserir(MANAGER_A, ORG_B, "Invasão")).toBe("42501");
  });

  it("update e delete cruzados não tocam linha nenhuma", () => {
    const antes = sql(`select string_agg(nome, ',' order by id) from public.fluxo_pastas where organization_id = '${ORG_B}'`);
    sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${MANAGER_A}"}', false);
      update public.fluxo_pastas set nome = 'renomeada pelo vizinho' where organization_id = '${ORG_B}';
      delete from public.fluxo_pastas where organization_id = '${ORG_B}';
    `);
    expect(sql(`select string_agg(nome, ',' order by id) from public.fluxo_pastas where organization_id = '${ORG_B}'`)).toBe(antes);
  });
});
