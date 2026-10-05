import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * COLUNAS NOVAS DE CAMPANHA (fork jhoow — Campanhas, migrations 9014+).
 *  - 9014: mode (text/flow) e flow_id (FK mesma org, on delete set null).
 *  - 9015: intervalo sorteado (60/180, min ≤ max, ≥ 10s), timezone, next_send_at.
 *  - 9016: etapa de quem recebe (FKs compostas mesma org, on delete set null).
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


function blocoDoBaseline(rotulo: string): string {
  const baseline = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
  const inicio = baseline.lastIndexOf(rotulo);
  if (inicio < 0) throw new Error(`bloco ausente do baseline: ${rotulo}`);
  const proximo = baseline.indexOf("\n-- ---- ", inicio + rotulo.length);
  return baseline.slice(inicio, proximo < 0 ? undefined : proximo);
}

const ORG_A = "90140000-0000-4000-8000-00000000000a";
const ORG_B = "90140000-0000-4000-8000-00000000000b";
const SESSAO_A = "90140000-2222-4000-8000-00000000000a";
const FLUXO_A = "90140000-3333-4000-8000-00000000000a";
const FLUXO_B = "90140000-3333-4000-8000-00000000000b";
const CAMP = "90140000-4444-4000-8000-00000000000a";
const GRAFO = `{"nodes":[],"edges":[]}`;

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'f9014-inv-a', 'Campanha A', 'F9014 A'), ('${ORG_B}', 'f9014-inv-b', 'Campanha B', 'F9014 B')
      on conflict (id) do nothing;
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted) values
      ('${SESSAO_A}', '${ORG_A}', 'f9014_sessao_a', '\\x00'::bytea) on conflict (id) do nothing;
    insert into public.followup_flow_pointers (id, organization_id, name, surface, draft_graph) values
      ('${FLUXO_A}', '${ORG_A}', 'F9014 fluxo A', 'fluxo', '${GRAFO}'::jsonb),
      ('${FLUXO_B}', '${ORG_B}', 'F9014 fluxo B', 'fluxo', '${GRAFO}'::jsonb) on conflict (id) do nothing;
    insert into public.campaigns (id, organization_id, name, channel_session_id, base_legal, mode, flow_id) values
      ('${CAMP}', '${ORG_A}', 'F9014 campanha', '${SESSAO_A}', 'consent', 'flow', '${FLUXO_A}') on conflict (id) do nothing;
  `);
});

describe("9014 — campanha que inicia fluxo", () => {
  it("campanha antiga nasce 'text'; modo fora do vocabulário é recusado", () => {
    expect(sql(`select column_default from information_schema.columns where table_name = 'campaigns' and column_name = 'mode'`)).toBe("'text'::text");
    expect(sqlstate(`update public.campaigns set mode = 'audio' where id = '${CAMP}'`)).toBe("23514");
  });

  it("o fluxo é da MESMA organização", () => {
    expect(sqlstate(`update public.campaigns set flow_id = '${FLUXO_B}' where id = '${CAMP}'`)).toBe("23503");
  });

  it("apagar o fluxo não apaga a campanha — só zera o fluxo", () => {
    sql(`delete from public.followup_flow_pointers where id = '${FLUXO_A}'`);
    expect(sql(`select mode || '|' || coalesce(flow_id::text, 'nulo') from public.campaigns where id = '${CAMP}'`)).toBe("flow|nulo");
  });
});

describe("9015 — intervalo sorteado e fuso", () => {
  it("padrão 60–180s; mínimo ≥ 10; máximo ≥ mínimo", () => {
    expect(sql(`select min_interval_seconds || '-' || max_interval_seconds from public.campaigns where id = '${CAMP}'`)).toBe("60-180");
    expect(sqlstate(`update public.campaigns set min_interval_seconds = 5 where id = '${CAMP}'`)).toBe("23514");
    expect(sqlstate(`update public.campaigns set min_interval_seconds = 200, max_interval_seconds = 100 where id = '${CAMP}'`)).toBe("23514");
  });

  it("fuso no formato IANA (ou nulo)", () => {
    sql(`update public.campaigns set timezone = 'Europe/Lisbon' where id = '${CAMP}'`);
    sql(`update public.campaigns set timezone = 'America/Argentina/Buenos_Aires' where id = '${CAMP}'`);
    expect(sqlstate(`update public.campaigns set timezone = 'drop table x;' where id = '${CAMP}'`)).toBe("23514");
  });

  it("reaplicar os blocos não muda nada", () => {
    for (const r of [
      "-- ---- campanha que dispara fluxo (migration 9014) ----",
      "-- ---- ritmo aleatório e fuso da campanha (migration 9015) ----",
      "-- ---- etapa de quem recebe a campanha (migration 9016) ----",
    ]) {
      sql(blocoDoBaseline(r));
      sql(blocoDoBaseline(r));
    }
    expect(sql(`select count(*) from public.campaigns where id = '${CAMP}'`)).toBe("1");
  });
});

describe("9016 — etapa de quem recebe", () => {
  it("o funil/etapa de quem recebe é da MESMA organização", () => {
    const funilB = sql(`select id from public.crm_pipelines where organization_id = '${ORG_B}' limit 1`);
    const funilA = sql(`select id from public.crm_pipelines where organization_id = '${ORG_A}' limit 1`);
    expect(sqlstate(`update public.campaigns set recipients_pipeline_id = '${funilB}' where id = '${CAMP}'`)).toBe("23503");
    sql(`update public.campaigns set recipients_pipeline_id = '${funilA}' where id = '${CAMP}'`);
    expect(sql(`select recipients_pipeline_id from public.campaigns where id = '${CAMP}'`)).toBe(funilA);
  });
});

describe("9018 — janela em minutos e motivo da espera", () => {
  it("janela em minutos: os dois juntos, fim depois do início, dentro do dia", () => {
    sql(`update public.campaigns set janela_inicio_minuto = 570, janela_fim_minuto = 1095 where id = '${CAMP}'`);
    expect(sqlstate(`update public.campaigns set janela_inicio_minuto = 570, janela_fim_minuto = null where id = '${CAMP}'`)).toBe("23514");
    expect(sqlstate(`update public.campaigns set janela_inicio_minuto = 600, janela_fim_minuto = 600 where id = '${CAMP}'`)).toBe("23514");
    expect(sqlstate(`update public.campaigns set janela_inicio_minuto = 0, janela_fim_minuto = 1441 where id = '${CAMP}'`)).toBe("23514");
    sql(`update public.campaigns set janela_inicio_minuto = 0, janela_fim_minuto = 1440 where id = '${CAMP}'`);
  });

  it("motivo da espera só do vocabulário", () => {
    sql(`update public.campaigns set wait_reason = 'fora_da_janela', wait_until = now() where id = '${CAMP}'`);
    expect(sqlstate(`update public.campaigns set wait_reason = 'qualquer' where id = '${CAMP}'`)).toBe("23514");
  });

  it("reaplicar o bloco não muda nada", () => {
    const r = "-- ---- janela diária em minutos da campanha (migration 9018) ----";
    sql(blocoDoBaseline(r));
    sql(blocoDoBaseline(r));
    expect(sql(`select janela_fim_minuto from public.campaigns where id = '${CAMP}'`)).toBe("1440");
  });
});
