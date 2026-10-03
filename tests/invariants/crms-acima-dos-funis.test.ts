import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * CRMs ACIMA DOS FUNIS (migration 9004) — o que só o Postgres pode responder.
 *
 * 1. O baseline aplicado TEM a tabela, a coluna NOT NULL e a FK composta — prova
 *    que a mudança chegou ao apêndice, e não só a `migrations/` (o kit self-host
 *    aplica apenas o baseline).
 * 2. Organização nova nasce com UM CRM padrão, e o funil que o seed cria entra
 *    nele — sem ninguém passar `crm_id`. É o gatilho que mantém vivo todo
 *    caminho antigo que cria funil.
 * 3. O backfill funciona num banco de ANTES da 9004 (simulado aqui) e reaplicar
 *    o bloco não duplica nada — é o que o `update.sh` faz a cada atualização.
 * 4. As fronteiras: funil não aponta para CRM de outra org; CRM com funil não se
 *    apaga; apagar a organização inteira continua funcionando.
 * 5. RLS: ninguém lê nem escreve CRM do vizinho; agent lê e não escreve; a
 *    métrica de uma org não soma negócio da outra.
 * 6. Duplicar copia funis e etapas, sem negócio.
 *
 * Conectar como `postgres` mediria NADA (`rolbypassrls = t`): os casos de RLS
 * usam `set role authenticated` + `request.jwt.claims`, o caminho da produção.
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

/**
 * Roda como o usuário e devolve a ÚLTIMA linha — o resultado da consulta final.
 * As de antes são o `SET` e o eco do `set_config`, que o `psql -tA` imprime.
 */
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

function numero(saida: string): number {
  const ultima = saida.split("\n").pop() ?? "";
  if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${saida}`);
  return Number(ultima);
}

/** O bloco da 9004 no apêndice do baseline, como o `update.sh` o reaplica. */
function blocoDaMigration(): string {
  const baseline = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
  const rotulo = "-- ---- CRMs: o nível acima dos funis (migration 9004) ----";
  const inicio = baseline.lastIndexOf(rotulo);
  if (inicio < 0) throw new Error("bloco da 9004 ausente do baseline");
  const proximo = baseline.indexOf("\n-- ---- ", inicio + rotulo.length);
  return baseline.slice(inicio, proximo < 0 ? undefined : proximo);
}

const ORG_A = "c4a00000-0000-4000-8000-00000000000a";
const ORG_B = "c4a00000-0000-4000-8000-00000000000b";
const ORG_C = "c4a00000-0000-4000-8000-00000000000c";
const AGENT_A = "c4a00000-1111-4000-8000-00000000000a";
const MANAGER_A = "c4a00000-1111-4000-8000-00000000000d";
const MANAGER_B = "c4a00000-1111-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}',   'crms-agent-a@invariant.test'),
      ('${MANAGER_A}', 'crms-mgr-a@invariant.test'),
      ('${MANAGER_B}', 'crms-mgr-b@invariant.test')
      on conflict (id) do nothing;

    -- O gatilho trg_seed_default_pipeline_for_org semeia um funil em cada uma.
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'crms-inv-a', 'CRMs Invariant A', 'CRMs A'),
      ('${ORG_B}', 'crms-inv-b', 'CRMs Invariant B', 'CRMs B'),
      ('${ORG_C}', 'crms-inv-c', 'CRMs Invariant C', 'CRMs C')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}',   '${ORG_A}', 'agent',   now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;

    -- Um negócio em cada org, no funil semeado (para a métrica ter o que contar).
    insert into public.crm_leads (organization_id, pipeline_id, stage_id, title)
    select p.organization_id, p.id, s.id, 'Negócio do invariante'
      from public.crm_pipelines p
      join lateral (
        select id from public.crm_stages st where st.pipeline_id = p.id order by position limit 1
      ) s on true
     where p.organization_id in ('${ORG_A}', '${ORG_B}');
  `);
});

describe("schema no baseline", () => {
  it("crm_pipelines.crm_id é NOT NULL e a FK é composta (organization_id, crm_id)", () => {
    expect(
      sql(`select is_nullable from information_schema.columns
            where table_schema='public' and table_name='crm_pipelines' and column_name='crm_id'`),
    ).toBe("NO");
    expect(
      sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'crm_pipelines_crm_fkey'`),
    ).toBe("FOREIGN KEY (organization_id, crm_id) REFERENCES crm_crms(organization_id, id)");
  });

  it("crm_crms tem RLS ligada", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.crm_crms'::regclass`)).toBe("t");
  });

  it("fn_crm_padrao_da_org não é executável por anon nem authenticated", () => {
    expect(
      sql(`select has_function_privilege('anon', 'public.fn_crm_padrao_da_org(uuid)', 'execute')::text
            || has_function_privilege('authenticated', 'public.fn_crm_padrao_da_org(uuid)', 'execute')::text`),
    ).toBe("falsefalse");
  });
});

describe("organização nova e funil sem crm_id", () => {
  it("org nova nasce com exatamente UM CRM, padrão, e o funil do seed dentro dele", () => {
    expect(sql(`select count(*) || ':' || bool_and(is_default)::text || ':' || min(slug)
                  from public.crm_crms where organization_id = '${ORG_A}'`)).toBe("1:true:padrao");
    expect(
      numero(
        sql(`select count(*) from public.crm_pipelines p
               join public.crm_crms c on c.id = p.crm_id and c.is_default
              where p.organization_id = '${ORG_A}'`),
      ),
    ).toBeGreaterThan(0);
  });

  it("funil inserido SEM crm_id cai no CRM padrão da org", () => {
    // A primeira linha é o `returning`; a segunda, o `INSERT 0 1` do psql.
    const crm = sql(`
      insert into public.crm_pipelines (organization_id, name, slug)
      values ('${ORG_A}', 'Funil sem CRM', 'funil-sem-crm') returning crm_id;
    `).split("\n")[0];
    expect(crm).toBe(sql(`select id from public.crm_crms where organization_id='${ORG_A}' and is_default`));
  });

  it("um segundo padrão na mesma org bate no índice único", () => {
    expect(
      sqlstate(`insert into public.crm_crms (organization_id, name, slug, is_default)
                values ('${ORG_A}', 'Outro padrão', 'outro-padrao', true);`),
    ).toBe("23505");
  });

  it("o CRM padrão não se arquiva (CHECK)", () => {
    expect(
      sqlstate(`update public.crm_crms set archived_at = now()
                 where organization_id = '${ORG_A}' and is_default;`),
    ).toBe("23514");
  });
});

describe("fronteiras", () => {
  it("funil NÃO aponta para CRM de outra organização (FK composta)", () => {
    expect(
      sqlstate(`update public.crm_pipelines
                   set crm_id = (select id from public.crm_crms where organization_id = '${ORG_B}' and is_default)
                 where organization_id = '${ORG_A}';`),
    ).toBe("23503");
  });

  it("CRM com funil não se apaga", () => {
    expect(
      sqlstate(`delete from public.crm_crms where organization_id = '${ORG_A}' and is_default;`),
    ).toBe("23503");
  });

  it("apagar a organização inteira continua funcionando (NO ACTION, não RESTRICT)", () => {
    expect(sqlstate(`delete from public.organizations where id = '${ORG_C}';`)).toBeNull();
    expect(sql(`select count(*) from public.crm_crms where organization_id = '${ORG_C}'`)).toBe("0");
  });
});

describe("backfill e reaplicação (update.sh)", () => {
  it("num banco de ANTES da 9004, cada org com funil ganha UM padrão e todos os funis entram nele", () => {
    // Simula o estado anterior para a org B: coluna nula e nenhum CRM.
    sql(`
      alter table public.crm_pipelines alter column crm_id drop not null;
      alter table public.crm_pipelines drop constraint crm_pipelines_crm_fkey;
      alter table public.crm_pipelines disable trigger trg_crm_pipelines_preencher_crm;
      update public.crm_pipelines set crm_id = null where organization_id = '${ORG_B}';
      delete from public.crm_crms where organization_id = '${ORG_B}';
      alter table public.crm_pipelines enable trigger trg_crm_pipelines_preencher_crm;
    `);
    sql(blocoDaMigration());

    expect(sql(`select count(*) from public.crm_crms where organization_id = '${ORG_B}'`)).toBe("1");
    expect(sql(`select count(*) from public.crm_pipelines where crm_id is null`)).toBe("0");
    expect(
      sql(`select is_nullable from information_schema.columns
            where table_schema='public' and table_name='crm_pipelines' and column_name='crm_id'`),
    ).toBe("NO");
  });

  it("reaplicar o bloco não duplica CRM nem mexe em funil", () => {
    const antes = sql(`select count(*) || ':' || string_agg(id::text || crm_id::text, ',' order by id)
                         from public.crm_pipelines`);
    const crmsAntes = sql(`select count(*) from public.crm_crms`);
    sql(blocoDaMigration());
    sql(blocoDaMigration());
    expect(sql(`select count(*) || ':' || string_agg(id::text || crm_id::text, ',' order by id)
                  from public.crm_pipelines`)).toBe(antes);
    expect(sql(`select count(*) from public.crm_crms`)).toBe(crmsAntes);
  });
});

describe("RLS", () => {
  it("controle positivo: o agent lê os CRMs da própria org", () => {
    expect(numero(como(AGENT_A, `select count(*) from public.crm_crms where organization_id = '${ORG_A}';`))).toBeGreaterThan(0);
  });

  it("isolamento: ninguém lê CRM do vizinho", () => {
    expect(numero(como(AGENT_A, `select count(*) from public.crm_crms where organization_id = '${ORG_B}';`))).toBe(0);
    expect(numero(como(MANAGER_B, `select count(*) from public.crm_crms where organization_id = '${ORG_A}';`))).toBe(0);
  });

  it("agent não escreve; manager escreve na própria org e não na do vizinho", () => {
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
                insert into public.crm_crms (organization_id, name, slug) values ('${ORG_A}', 'Do agent', 'do-agent');`),
    ).toBe("42501");
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${MANAGER_A}"}', false);
                insert into public.crm_crms (organization_id, name, slug) values ('${ORG_A}', 'Girly', 'clientes-girly');`),
    ).toBeNull();
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${MANAGER_A}"}', false);
                insert into public.crm_crms (organization_id, name, slug) values ('${ORG_B}', 'Invasão', 'invasao');`),
    ).toBe("42501");
  });

  it("a métrica de uma org não soma negócio da outra — e pedir a org do vizinho devolve nada", () => {
    const daPropria = como(MANAGER_A, `select coalesce(sum(leads_count), 0) from public.fn_crms_com_metricas('${ORG_A}');`);
    expect(numero(daPropria)).toBe(
      numero(sql(`select count(*) from public.crm_leads where organization_id = '${ORG_A}'`)),
    );
    expect(numero(como(MANAGER_A, `select count(*) from public.fn_crms_com_metricas('${ORG_B}');`))).toBe(0);
  });
});

describe("fn_crm_duplicar", () => {
  it("copia funis vivos e etapas, sem negócio, e a cópia não é padrão", () => {
    const origem = sql(`select id from public.crm_crms where organization_id='${ORG_A}' and is_default`);
    const novo = como(
      MANAGER_A,
      `select public.fn_crm_duplicar('${origem}', 'PADRÃO cópia', 'padrao-copia');`,
    );
    const contar = (crm: string) =>
      sql(`select (select count(*) from public.crm_pipelines where crm_id = '${crm}' and not is_archived)
             || ':' || (select count(*) from public.crm_stages s join public.crm_pipelines p on p.id = s.pipeline_id
                         where p.crm_id = '${crm}' and not p.is_archived and not s.is_archived)`);
    expect(contar(novo)).toBe(contar(origem));
    expect(sql(`select count(*) from public.crm_leads l join public.crm_pipelines p on p.id = l.pipeline_id
                 where p.crm_id = '${novo}'`)).toBe("0");
    expect(sql(`select is_default::text from public.crm_crms where id = '${novo}'`)).toBe("false");
  });

  it("agent não duplica (RLS das tabelas decide — a função é invoker)", () => {
    const origem = sql(`select id from public.crm_crms where organization_id='${ORG_A}' and is_default`);
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
                select public.fn_crm_duplicar('${origem}', 'Do agent', 'do-agent-2');`),
    ).toBe("42501");
  });
});
