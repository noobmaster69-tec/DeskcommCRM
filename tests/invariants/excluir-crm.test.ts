import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * EXCLUIR CRM DE VEZ (migration 9012, fork jhoow — card de CRM).
 *
 * `fn_crm_excluir` recusa o CRM padrão, o CRM com negócio e o CRM com captura
 * (CASCADE escondido); apaga funis, etapas e o CRM numa transação; respeita a
 * RLS (agent não apaga nada) e não toca no vizinho.
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

const ORG = "90120000-0000-4000-8000-00000000000a";
const MANAGER = "90120000-1111-4000-8000-00000000000a";
const AGENT = "90120000-1111-4000-8000-0000000000aa";

function novoCrm(nome: string): { crm: string; funil: string } {
  const crm = sql(`insert into public.crm_crms (organization_id, name, slug) values ('${ORG}', '${nome}', '${nome.toLowerCase()}') returning id`).split("\n")[0]!;
  const funil = sql(`insert into public.crm_pipelines (organization_id, crm_id, name, slug) values ('${ORG}', '${crm}', 'Funil ${nome}', 'funil-${nome.toLowerCase()}') returning id`).split("\n")[0]!;
  return { crm, funil };
}
const existe = (crm: string) => sql(`select count(*) from public.crm_crms where id = '${crm}'`);

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER}', 'f9012-mgr@invariant.test'), ('${AGENT}', 'f9012-agent@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'f9012-inv', 'Excluir CRM', 'F9012') on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER}', '${ORG}', 'manager', now()), ('${AGENT}', '${ORG}', 'agent', now())
      on conflict do nothing;
  `);
});

describe("fn_crm_excluir", () => {
  it("apaga o CRM vazio com funis e etapas", () => {
    const { crm, funil } = novoCrm("Vazio");
    como(MANAGER, `select public.fn_crm_excluir('${crm}'); select 1;`);
    expect(existe(crm)).toBe("0");
    expect(sql(`select count(*) from public.crm_pipelines where id = '${funil}'`)).toBe("0");
    expect(sql(`select count(*) from public.crm_stages where pipeline_id = '${funil}'`)).toBe("0");
  });

  it("recusa o CRM padrão", () => {
    const padrao = sql(`select id from public.crm_crms where organization_id = '${ORG}' and is_default`);
    expect(sqlstate(`select public.fn_crm_excluir('${padrao}')`)).toBe("P0001");
    expect(existe(padrao)).toBe("1");
  });

  it("recusa CRM com negócio — nada é apagado", () => {
    const { crm, funil } = novoCrm("Comlead");
    const etapa = sql(`select id from public.crm_stages where pipeline_id = '${funil}' order by position limit 1`);
    const contato = sql(`insert into public.contacts (organization_id, display_name) values ('${ORG}', 'F9012 contato') returning id`).split("\n")[0];
    sql(`insert into public.crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ('${ORG}', '${funil}', '${etapa}', '${contato}', 'negócio')`);
    expect(sqlstate(`select public.fn_crm_excluir('${crm}')`)).toBe("P0001");
    expect(existe(crm)).toBe("1");
  });

  it("agent não apaga (RLS) — a transação volta inteira", () => {
    const { crm, funil } = novoCrm("Doagente");
    expect(
      sqlstate(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${AGENT}"}', false);
        select public.fn_crm_excluir('${crm}');`),
    ).not.toBeNull();
    expect(existe(crm)).toBe("1");
    expect(sql(`select count(*) from public.crm_pipelines where id = '${funil}'`)).toBe("1");
  });

  it("anon não executa; reaplicar o bloco não muda nada", () => {
    expect(sql(`select has_function_privilege('anon', 'public.fn_crm_excluir(uuid)', 'execute')`)).toBe("f");
    const bloco = blocoDoBaseline("-- ---- excluir CRM de vez (migration 9012) ----");
    sql(bloco);
    sql(bloco);
  });
});
