import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * TRADUÇÃO AUTOMÁTICA (migration 9022, fork jhoow — Inbox › Fase A).
 * Origem do idioma do contato, cache de tradução na mensagem, idioma do
 * atendente (RLS: cada um só o seu), chave do fluxo e reaplicação.
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

const ORG = "90220000-0000-4000-8000-00000000000a";
const ANA = "90220000-1111-4000-8000-00000000000a";
const BETO = "90220000-1111-4000-8000-00000000000b";
const CONTATO = "90220000-2222-4000-8000-00000000000a";
const ROTULO = "-- ---- tradução automática (migration 9022) ----";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ANA}', 'f9022-ana@invariant.test'), ('${BETO}', 'f9022-beto@invariant.test') on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'f9022-inv', 'Tradução', 'F9022') on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ANA}', '${ORG}', 'agent', now()), ('${BETO}', '${ORG}', 'agent', now()) on conflict do nothing;
    insert into public.contacts (id, organization_id, phone_number) values
      ('${CONTATO}', '${ORG}', '+447700900123') on conflict (id) do nothing;
  `);
});

describe("9022 — tradução automática", () => {
  it("a origem do idioma do contato é do vocabulário", () => {
    sql(`update public.contacts set locale = 'en-GB', locale_source = 'ddi' where id = '${CONTATO}'`);
    expect(sqlstate(`update public.contacts set locale_source = 'chute' where id = '${CONTATO}'`)).toBe("23514");
  });

  it("o estado da tradução da mensagem é do vocabulário", () => {
    expect(sql(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'messages'
      and column_name in ('content_original','content_locale','content_translated','translated_to','translated_at','translation_status')`)).toBe("6");
    expect(sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'messages_translation_status_check'`)).toContain("failed");
  });

  it("cada atendente lê e grava SÓ o próprio idioma", () => {
    como(ANA, `insert into public.user_preferences (user_id, operating_locale) values ('${ANA}', 'en-US'); select 1;`);
    expect(como(ANA, `select operating_locale from public.user_preferences where user_id = '${ANA}'`)).toBe("en-US");
    expect(como(BETO, `select count(*) from public.user_preferences where user_id = '${ANA}'`)).toBe("0");
    expect(
      sqlstate(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${BETO}"}', false);
        insert into public.user_preferences (user_id) values ('${ANA}');`),
    ).toBe("42501");
    expect(como(BETO, `with x as (update public.user_preferences set operating_locale = 'es-ES' where user_id = '${ANA}' returning 1) select count(*) from x`)).toBe("0");
    expect(sqlstate(`update public.user_preferences set operating_locale = 'klingon' where user_id = '${ANA}'`)).toBe("23514");
    expect(sql(`select has_table_privilege('anon', 'public.user_preferences', 'select')`)).toBe("f");
  });

  it("o fluxo nasce SEM tradução", () => {
    expect(sql(`select column_default from information_schema.columns where table_schema = 'public'
      and table_name = 'followup_flow_pointers' and column_name = 'translate_to_contact_locale'`)).toBe("false");
  });

  it("o consumo aceita tradução e detecção", () => {
    expect(sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'ai_invocations_invocation_kind_check'`)).toContain("message_translate");
  });

  it("reaplicar não muda nada", () => {
    sql(blocoDoBaseline(ROTULO));
    sql(blocoDoBaseline(ROTULO));
    expect(sql(`select locale || '/' || locale_source from public.contacts where id = '${CONTATO}'`)).toBe("en-GB/ddi");
    expect(sql(`select operating_locale from public.user_preferences where user_id = '${ANA}'`)).toBe("en-US");
  });
});
