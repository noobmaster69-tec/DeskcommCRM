import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * FUNIL PRINCIPAL E ETAPA DE ENTRADA (migration 9007) — o que só o Postgres
 * pode responder.
 *
 * 1. O baseline aplicado TEM as colunas, os CHECKs, os índices e a tabela de
 *    vínculos — a mudança chegou ao apêndice, e não só a `migrations/`.
 * 2. Nascimento: o primeiro funil vivo de um CRM vira principal e ganha a
 *    entrada como primeira coluna, por qualquer caminho (o seed de organização
 *    nova incluído); o segundo funil não ganha nada.
 * 3. Exclusividade e guardas: um principal por CRM, uma entrada por funil,
 *    entrada só no principal; a entrada não se renomeia, não se arquiva, não
 *    fecha negócio, não muda de funil; o principal não se desmarca nem se
 *    arquiva. Apagar a organização inteira continua funcionando.
 * 4. Backfill num banco de ANTES da 9007 (simulado aqui): o funil padrão (ou o
 *    mais antigo) vira principal, a entrada entra antes das outras colunas sem
 *    mover nenhuma, e reaplicar o bloco não muda nada — é o `update.sh`.
 * 5. `fn_crm_duplicar` e `fn_aplicar_quadro_do_onboarding` convivem com a
 *    entrada (uma só na cópia; preservada na troca de colunas).
 * 6. Vínculo número ↔ CRM: um CRM por número, vários números por CRM, FKs
 *    compostas na mesma org, cascata dos dois lados, RLS (lê a org, escreve
 *    manager+, ninguém vê o vizinho).
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

/** Roda como o usuário e devolve a ÚLTIMA linha — o resultado da consulta final. */
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

/** A primeira linha — o `returning` de um INSERT (a segunda é o `INSERT 0 1`). */
function primeira(saida: string): string {
  return saida.split("\n")[0] ?? "";
}

/** O bloco da 9007 no apêndice do baseline, como o `update.sh` o reaplica. */
function blocoDaMigration(): string {
  const baseline = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
  const rotulo = "-- ---- funil principal e etapa de entrada (migration 9007) ----";
  const inicio = baseline.lastIndexOf(rotulo);
  if (inicio < 0) throw new Error("bloco da 9007 ausente do baseline");
  const proximo = baseline.indexOf("\n-- ---- ", inicio + rotulo.length);
  return baseline.slice(inicio, proximo < 0 ? undefined : proximo);
}

const ORG_A = "90070000-0000-4000-8000-00000000000a";
const ORG_B = "90070000-0000-4000-8000-00000000000b";
const ORG_C = "90070000-0000-4000-8000-00000000000c";
const AGENT_A = "90070000-1111-4000-8000-00000000000a";
const MANAGER_A = "90070000-1111-4000-8000-00000000000d";
const MANAGER_B = "90070000-1111-4000-8000-00000000000b";
const SESSAO_A1 = "90070000-2222-4000-8000-0000000000a1";
const SESSAO_A2 = "90070000-2222-4000-8000-0000000000a2";
const SESSAO_B1 = "90070000-2222-4000-8000-0000000000b1";

/** O funil semeado (padrão) da org. */
function funilPadrao(org: string): string {
  return sql(`select id from public.crm_pipelines where organization_id = '${org}' and is_default`);
}

function crmPadrao(org: string): string {
  return sql(`select id from public.crm_crms where organization_id = '${org}' and is_default`);
}

function entradaDe(pipeline: string): string {
  return sql(`select id from public.crm_stages where pipeline_id = '${pipeline}' and is_entry`);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}',   'f9007-agent-a@invariant.test'),
      ('${MANAGER_A}', 'f9007-mgr-a@invariant.test'),
      ('${MANAGER_B}', 'f9007-mgr-b@invariant.test')
      on conflict (id) do nothing;

    -- O gatilho trg_seed_default_pipeline_for_org semeia um funil em cada uma.
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'f9007-inv-a', 'Funil principal A', 'F9007 A'),
      ('${ORG_B}', 'f9007-inv-b', 'Funil principal B', 'F9007 B'),
      ('${ORG_C}', 'f9007-inv-c', 'Funil principal C', 'F9007 C')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}',   '${ORG_A}', 'agent',   now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;

    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted) values
      ('${SESSAO_A1}', '${ORG_A}', 'f9007_sessao_a1', '\\x00'::bytea),
      ('${SESSAO_A2}', '${ORG_A}', 'f9007_sessao_a2', '\\x00'::bytea),
      ('${SESSAO_B1}', '${ORG_B}', 'f9007_sessao_b1', '\\x00'::bytea)
      on conflict (id) do nothing;
  `);
});

describe("schema no baseline", () => {
  it("as colunas existem, NOT NULL e falsas por padrão", () => {
    expect(
      sql(`select string_agg(table_name || '.' || column_name || ':' || is_nullable || ':' || column_default, ',' order by table_name)
             from information_schema.columns
            where table_schema = 'public'
              and ((table_name = 'crm_pipelines' and column_name = 'is_primary')
                or (table_name = 'crm_stages' and column_name = 'is_entry'))`),
    ).toBe("crm_pipelines.is_primary:NO:false,crm_stages.is_entry:NO:false");
  });

  it("os índices únicos são parciais: um principal por CRM, uma entrada por funil", () => {
    expect(
      sql(`select string_agg(indexdef, ' | ' order by indexname) from pg_indexes
            where indexname in ('uniq_crm_pipelines_crm_primary', 'uniq_crm_stages_pipeline_entry')`),
    ).toBe(
      "CREATE UNIQUE INDEX uniq_crm_pipelines_crm_primary ON public.crm_pipelines USING btree (crm_id) WHERE (is_primary = true)" +
        " | CREATE UNIQUE INDEX uniq_crm_stages_pipeline_entry ON public.crm_stages USING btree (pipeline_id) WHERE (is_entry = true)",
    );
  });

  it("a tabela de vínculos tem RLS ligada e FKs compostas", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.crm_waha_session_bindings'::regclass`)).toBe("t");
    expect(
      sql(`select string_agg(pg_get_constraintdef(oid), ' | ' order by conname) from pg_constraint
            where conname in ('crm_waha_bindings_crm_fkey', 'crm_waha_bindings_session_fkey')`),
    ).toBe(
      "FOREIGN KEY (organization_id, crm_id) REFERENCES crm_crms(organization_id, id) ON DELETE CASCADE" +
        " | FOREIGN KEY (organization_id, channel_session_id) REFERENCES channel_sessions(organization_id, id) ON DELETE CASCADE",
    );
  });

  it("as funções de gatilho não são executáveis por anon nem authenticated", () => {
    expect(
      sql(`select string_agg(has_function_privilege(r, f, 'execute')::text, ',')
             from unnest(array['anon', 'authenticated']) r,
                  unnest(array['public.fn_crm_funil_principal_nasce()',
                               'public.fn_crm_etapa_de_entrada_nasce()',
                               'public.fn_crm_guarda_funil_principal()',
                               'public.fn_crm_guarda_etapa_de_entrada()']) f`),
    ).toBe("false,false,false,false,false,false,false,false");
  });
});

describe("nascimento", () => {
  it("organização nova: o funil semeado é principal e a entrada é a PRIMEIRA coluna, aberta", () => {
    const funil = funilPadrao(ORG_A);
    expect(sql(`select is_primary::text from public.crm_pipelines where id = '${funil}'`)).toBe("true");
    expect(
      sql(`select name || ':' || is_won::text || ':' || is_lost::text from public.crm_stages
            where pipeline_id = '${funil}' order by position limit 1`),
    ).toBe("Etapa de entrada:false:false");
    // As 8 colunas do seed continuam lá, depois dela.
    expect(sql(`select count(*) from public.crm_stages where pipeline_id = '${funil}' and not is_entry`)).toBe("8");
  });

  it("o segundo funil do mesmo CRM não é principal e não ganha coluna nenhuma", () => {
    const funil = primeira(
      sql(`insert into public.crm_pipelines (organization_id, name, slug)
           values ('${ORG_A}', 'SDR', 'f9007-sdr') returning id;`),
    );
    expect(sql(`select is_primary::text from public.crm_pipelines where id = '${funil}'`)).toBe("false");
    expect(sql(`select count(*) from public.crm_stages where pipeline_id = '${funil}'`)).toBe("0");
  });

  it("CRM novo: o primeiro funil vira principal com entrada; funil arquivado não", () => {
    const crm = primeira(
      sql(`insert into public.crm_crms (organization_id, name, slug)
           values ('${ORG_A}', 'Apex', 'f9007-apex') returning id;`),
    );
    const arquivado = primeira(
      sql(`insert into public.crm_pipelines (organization_id, crm_id, name, slug, is_archived)
           values ('${ORG_A}', '${crm}', 'Velho', 'f9007-velho', true) returning id;`),
    );
    expect(sql(`select is_primary::text from public.crm_pipelines where id = '${arquivado}'`)).toBe("false");

    const funil = primeira(
      sql(`insert into public.crm_pipelines (organization_id, crm_id, name, slug)
           values ('${ORG_A}', '${crm}', 'Social Seller', 'f9007-social') returning id;`),
    );
    expect(sql(`select is_primary::text from public.crm_pipelines where id = '${funil}'`)).toBe("true");
    expect(sql(`select count(*) from public.crm_stages where pipeline_id = '${funil}' and is_entry`)).toBe("1");
  });
});

describe("exclusividade e guardas", () => {
  it("um segundo principal no mesmo CRM bate no índice único", () => {
    expect(
      sqlstate(`update public.crm_pipelines set is_primary = true
                 where organization_id = '${ORG_A}' and slug = 'f9007-sdr';`),
    ).toBe("23505");
  });

  it("uma segunda entrada no mesmo funil bate no índice único", () => {
    expect(
      sqlstate(`insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_entry)
                values ('${ORG_A}', '${funilPadrao(ORG_A)}', 'Outra entrada', 'outra-entrada', -5000, true);`),
    ).toBe("23505");
  });

  it("entrada só existe no funil principal", () => {
    const sdr = sql(`select id from public.crm_pipelines where organization_id = '${ORG_A}' and slug = 'f9007-sdr'`);
    expect(
      sqlstate(`insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_entry)
                values ('${ORG_A}', '${sdr}', 'Entrada falsa', 'entrada-falsa', 0, true);`),
    ).toBe("PT409");
  });

  it("a entrada não se renomeia, não deixa de ser entrada e não muda de funil", () => {
    const entrada = entradaDe(funilPadrao(ORG_A));
    const sdr = sql(`select id from public.crm_pipelines where organization_id = '${ORG_A}' and slug = 'f9007-sdr'`);
    expect(sqlstate(`update public.crm_stages set name = 'Outro nome' where id = '${entrada}';`)).toBe("PT409");
    expect(sqlstate(`update public.crm_stages set is_entry = false where id = '${entrada}';`)).toBe("PT409");
    expect(sqlstate(`update public.crm_stages set pipeline_id = '${sdr}' where id = '${entrada}';`)).toBe("PT409");
  });

  it("a entrada não se arquiva nem fecha negócio (CHECK)", () => {
    const entrada = entradaDe(funilPadrao(ORG_A));
    expect(sqlstate(`update public.crm_stages set is_archived = true where id = '${entrada}';`)).toBe("23514");
    expect(sqlstate(`update public.crm_stages set is_lost = true where id = '${entrada}';`)).toBe("23514");
  });

  it("controle positivo: as outras colunas seguem editáveis, e a entrada muda de cor", () => {
    const funil = funilPadrao(ORG_A);
    expect(
      sqlstate(`update public.crm_stages set name = 'Abandonou o carrinho'
                 where pipeline_id = '${funil}' and slug = 'carrinho_abandonado';`),
    ).toBeNull();
    expect(sqlstate(`update public.crm_stages set color = '#a8c7fa' where id = '${entradaDe(funil)}';`)).toBeNull();
  });

  it("o principal não se desmarca nem se arquiva, mas se renomeia", () => {
    const funil = funilPadrao(ORG_A);
    expect(sqlstate(`update public.crm_pipelines set is_primary = false where id = '${funil}';`)).toBe("PT409");
    expect(sqlstate(`update public.crm_pipelines set is_archived = true where id = '${funil}';`)).toBe("23514");
    expect(sqlstate(`update public.crm_pipelines set name = 'Funil de vendas' where id = '${funil}';`)).toBeNull();
  });

  it("apagar a organização inteira continua funcionando (o DELETE não é guardado)", () => {
    expect(sqlstate(`delete from public.organizations where id = '${ORG_C}';`)).toBeNull();
    expect(sql(`select count(*) from public.crm_pipelines where organization_id = '${ORG_C}'`)).toBe("0");
  });
});

describe("backfill e reaplicação (update.sh)", () => {
  it("num banco de ANTES da 9007: o funil padrão vira principal (não o mais antigo) e a entrada entra antes, sem mover coluna", () => {
    const padrao = funilPadrao(ORG_B);
    // Um funil MAIS ANTIGO que o padrão, no mesmo CRM: o padrão tem de ganhar.
    const antigo = primeira(
      sql(`insert into public.crm_pipelines (organization_id, name, slug, created_at)
           values ('${ORG_B}', 'Mais antigo', 'f9007-antigo', now() - interval '1 year') returning id;`),
    );
    // Um CRM sem funil padrão, com dois funis: o mais antigo tem de ganhar.
    const crm = primeira(
      sql(`insert into public.crm_crms (organization_id, name, slug)
           values ('${ORG_B}', 'Sem padrão', 'f9007-sem-padrao') returning id;`),
    );
    const novo = primeira(
      sql(`insert into public.crm_pipelines (organization_id, crm_id, name, slug, created_at)
           values ('${ORG_B}', '${crm}', 'Novo', 'f9007-novo', now()) returning id;`),
    );
    const velho = primeira(
      sql(`insert into public.crm_pipelines (organization_id, crm_id, name, slug, created_at)
           values ('${ORG_B}', '${crm}', 'Velho', 'f9007-velho-b', now() - interval '2 years') returning id;`),
    );
    sql(`insert into public.crm_stages (organization_id, pipeline_id, name, slug, position)
         values ('${ORG_B}', '${velho}', 'Qualificando', 'qualificando', 500);`);

    // Simula o estado anterior: ninguém principal, nenhuma entrada.
    sql(`
      alter table public.crm_pipelines disable trigger trg_crm_pipelines_guarda_principal;
      delete from public.crm_stages where organization_id = '${ORG_B}' and is_entry;
      update public.crm_pipelines set is_primary = false where organization_id = '${ORG_B}';
      alter table public.crm_pipelines enable trigger trg_crm_pipelines_guarda_principal;
    `);
    const colunasAntes = sql(`select string_agg(id::text || '@' || position, ',' order by id)
                                from public.crm_stages where organization_id = '${ORG_B}'`);

    sql(blocoDaMigration());

    expect(
      sql(`select string_agg(id::text, ',' order by id) from public.crm_pipelines
            where organization_id = '${ORG_B}' and is_primary`),
    ).toBe([padrao, velho].sort().join(","));
    expect(sql(`select is_primary::text from public.crm_pipelines where id = '${antigo}'`)).toBe("false");
    expect(sql(`select is_primary::text from public.crm_pipelines where id = '${novo}'`)).toBe("false");

    // A entrada é a primeira coluna: menor posição − 1000.
    expect(sql(`select position from public.crm_stages where id = '${entradaDe(padrao)}'`)).toBe("0");
    expect(sql(`select position from public.crm_stages where id = '${entradaDe(velho)}'`)).toBe("-500");
    // Nenhuma coluna que já existia se moveu.
    expect(
      sql(`select string_agg(id::text || '@' || position, ',' order by id)
             from public.crm_stages where organization_id = '${ORG_B}' and not is_entry`),
    ).toBe(colunasAntes);
  });

  it("reaplicar o bloco não duplica entrada nem troca o principal", () => {
    const foto = () =>
      sql(`select (select string_agg(id::text, ',' order by id) from public.crm_pipelines where is_primary)
               || '|' || (select string_agg(id::text || '@' || position, ',' order by id) from public.crm_stages)`);
    const antes = foto();
    sql(blocoDaMigration());
    sql(blocoDaMigration());
    expect(foto()).toBe(antes);
  });
});

describe("funções que mexem em funis inteiros", () => {
  it("fn_crm_duplicar: a cópia tem um principal, uma entrada e as mesmas colunas", () => {
    const origem = sql(`select id from public.crm_crms where organization_id = '${ORG_A}' and slug = 'f9007-apex'`);
    // Um funil adicional ANTES do principal na ordem: a cópia não pode elegê-lo.
    sql(`insert into public.crm_pipelines (organization_id, crm_id, name, slug, position)
         values ('${ORG_A}', '${origem}', 'SDR Apex', 'f9007-sdr-apex', -1);`);
    const novo = como(MANAGER_A, `select public.fn_crm_duplicar('${origem}', 'Apex cópia', 'f9007-apex-copia');`);
    const contar = (crm: string) =>
      sql(`select (select count(*) from public.crm_pipelines where crm_id = '${crm}' and not is_archived)
             || ':' || (select count(*) from public.crm_pipelines where crm_id = '${crm}' and is_primary)
             || ':' || (select count(*) from public.crm_stages s join public.crm_pipelines p on p.id = s.pipeline_id
                         where p.crm_id = '${crm}' and s.is_entry)
             || ':' || (select count(*) from public.crm_stages s join public.crm_pipelines p on p.id = s.pipeline_id
                         where p.crm_id = '${crm}' and not p.is_archived and not s.is_archived)`);
    expect(contar(novo)).toBe(contar(origem));
    expect(contar(novo)).toMatch(/^2:1:1:/);
  });

  it("fn_aplicar_quadro_do_onboarding troca as colunas e preserva a entrada, à frente", () => {
    const funil = funilPadrao(ORG_B);
    const entrada = entradaDe(funil);
    const r = sql(`select public.fn_aplicar_quadro_do_onboarding('${ORG_B}', '${funil}', 'Agendamentos', 'agendamentos',
      '[{"nome":"Novo contato","slug":"novo_contato","position":1000},
        {"nome":"Consulta marcada","slug":"consulta_marcada","position":2000,"is_won":true}]'::jsonb);`);
    expect(r).toContain('"ok": true');
    expect(
      sql(`select string_agg(name, ', ' order by position) from public.crm_stages where pipeline_id = '${funil}'`),
    ).toBe("Etapa de entrada, Novo contato, Consulta marcada");
    expect(entradaDe(funil)).toBe(entrada);
  });
});

describe("vínculo número ↔ CRM", () => {
  it("manager vincula número da própria org a CRM da própria org; vários números no mesmo CRM", () => {
    for (const sessao of [SESSAO_A1, SESSAO_A2]) {
      expect(
        sqlstate(`set role authenticated;
                  select set_config('request.jwt.claims', '{"sub":"${MANAGER_A}"}', false);
                  insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
                  values ('${ORG_A}', '${sessao}', '${crmPadrao(ORG_A)}');`),
      ).toBeNull();
    }
  });

  it("um número só pode estar em um CRM", () => {
    const apex = sql(`select id from public.crm_crms where organization_id = '${ORG_A}' and slug = 'f9007-apex'`);
    expect(
      sqlstate(`insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
                values ('${ORG_A}', '${SESSAO_A1}', '${apex}');`),
    ).toBe("23505");
  });

  it("número de outra org ou CRM de outra org: a FK composta recusa", () => {
    expect(
      sqlstate(`insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
                values ('${ORG_A}', '${SESSAO_B1}', '${crmPadrao(ORG_A)}');`),
    ).toBe("23503");
    expect(
      sqlstate(`insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
                values ('${ORG_B}', '${SESSAO_B1}', '${crmPadrao(ORG_A)}');`),
    ).toBe("23503");
  });

  it("RLS: agent lê os da própria org e ZERO do vizinho, nos dois sentidos", () => {
    sql(`insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
         values ('${ORG_B}', '${SESSAO_B1}', '${crmPadrao(ORG_B)}') on conflict do nothing;`);
    expect(como(AGENT_A, `select count(*) from public.crm_waha_session_bindings where organization_id = '${ORG_A}';`)).toBe("2");
    expect(como(AGENT_A, `select count(*) from public.crm_waha_session_bindings where organization_id = '${ORG_B}';`)).toBe("0");
    expect(como(MANAGER_B, `select count(*) from public.crm_waha_session_bindings where organization_id = '${ORG_A}';`)).toBe("0");
  });

  it("agent não escreve; manager não escreve no vizinho; update cruzado não toca linha", () => {
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
                delete from public.crm_waha_session_bindings where channel_session_id = '${SESSAO_A2}';
                insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
                values ('${ORG_A}', '${SESSAO_A2}', '${crmPadrao(ORG_A)}');`),
    ).toBe("42501");
    expect(sql(`select count(*) from public.crm_waha_session_bindings where channel_session_id = '${SESSAO_A2}'`)).toBe("1");
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${MANAGER_A}"}', false);
                insert into public.crm_waha_session_bindings (organization_id, channel_session_id, crm_id)
                values ('${ORG_B}', '${SESSAO_B1}', '${crmPadrao(ORG_B)}');`),
    ).toBe("42501");
    como(MANAGER_A, `update public.crm_waha_session_bindings set crm_id = crm_id where organization_id = '${ORG_B}';`);
    expect(
      sql(`select (updated_at = created_at)::text from public.crm_waha_session_bindings where channel_session_id = '${SESSAO_B1}'`),
    ).toBe("true");
  });

  it("apagar o CRM ou o número desfaz o vínculo (o número volta ao CRM padrão)", () => {
    const crm = primeira(
      sql(`insert into public.crm_crms (organization_id, name, slug)
           values ('${ORG_A}', 'Sem funil', 'f9007-sem-funil') returning id;`),
    );
    sql(`update public.crm_waha_session_bindings set crm_id = '${crm}' where channel_session_id = '${SESSAO_A2}';`);
    sql(`delete from public.crm_crms where id = '${crm}';`);
    expect(sql(`select count(*) from public.crm_waha_session_bindings where channel_session_id = '${SESSAO_A2}'`)).toBe("0");

    sql(`delete from public.channel_sessions where id = '${SESSAO_A1}';`);
    expect(sql(`select count(*) from public.crm_waha_session_bindings where channel_session_id = '${SESSAO_A1}'`)).toBe("0");
  });
});

describe("cor do funil (migration 9008)", () => {
  it("a coluna existe, é opcional e nasce vazia", () => {
    expect(
      sql(`select is_nullable || ':' || coalesce(column_default, '-') from information_schema.columns
            where table_schema = 'public' and table_name = 'crm_pipelines' and column_name = 'color'`),
    ).toBe("YES:-");
    expect(sql(`select count(*) from public.crm_pipelines where organization_id = '${ORG_A}' and color is not null`)).toBe("0");
  });

  it("aceita hex de 6 dígitos e recusa o resto (CHECK, mesmo formato da cor da etapa)", () => {
    const funil = funilPadrao(ORG_A);
    expect(sqlstate(`update public.crm_pipelines set color = '#a4c8fa' where id = '${funil}';`)).toBeNull();
    expect(sqlstate(`update public.crm_pipelines set color = 'azul' where id = '${funil}';`)).toBe("23514");
    expect(sqlstate(`update public.crm_pipelines set color = null where id = '${funil}';`)).toBeNull();
  });
});
