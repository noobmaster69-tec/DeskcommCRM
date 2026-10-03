import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * A PORTA "Funis" (/app/kanban) VIRA "CRMs" (/app/crms) NOS DADOS (migration 9005).
 *
 * No catálogo de navegação o `href` é o identificador do item, e três colunas o
 * guardam. O leitor descarta id desconhecido EM SILÊNCIO, então o defeito que a
 * migration evita não reprova nada — só faz "CRMs" reaparecer para quem escondeu
 * "Funis", ou some a porta de uma interface simplificada. Este arquivo semeia as
 * três formas num banco que já passou pelo baseline (o estado de um clone que
 * gravou a preferência ANTES da troca), reaplica o bloco como o `update.sh` faz e
 * confere: trocado, sem duplicata, na mesma ordem, e reaplicar não muda mais nada.
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

function blocoDaMigration(): string {
  const baseline = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
  const rotulo = '-- ---- menu: a porta "Funis" (/app/kanban) vira "CRMs" (/app/crms) (migration 9005) ----';
  const inicio = baseline.lastIndexOf(rotulo);
  if (inicio < 0) throw new Error("bloco da 9005 ausente do baseline");
  const proximo = baseline.indexOf("\n-- ---- ", inicio + rotulo.length);
  return baseline.slice(inicio, proximo < 0 ? undefined : proximo);
}

const ORG = "9005a000-0000-4000-8000-00000000000a";
const ORG_LIMPA = "9005a000-0000-4000-8000-00000000000b";
const ESCONDEU = "9005a000-1111-4000-8000-00000000000a";
const JA_TINHA = "9005a000-1111-4000-8000-00000000000b";
const INTOCADO = "9005a000-1111-4000-8000-00000000000c";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ESCONDEU}', 'menu9005-a@invariant.test'),
      ('${JA_TINHA}', 'menu9005-b@invariant.test'),
      ('${INTOCADO}', 'menu9005-c@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'menu9005-a', 'Menu 9005 A', 'Menu A'),
      ('${ORG_LIMPA}', 'menu9005-b', 'Menu 9005 B', 'Menu B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at, menu_oculto, interface_settings) values
      ('${ESCONDEU}', '${ORG}', 'agent', now(),
        '["/app/inbox", "/app/kanban", "grupo:ia"]',
        '{"preset":"simplificada","destinos":["/app/inbox","/app/kanban","/app/contacts"]}'),
      ('${JA_TINHA}', '${ORG}', 'agent', now(),
        '["/app/kanban", "/app/crms"]',
        '{"preset":"completa"}'),
      ('${INTOCADO}', '${ORG}', 'agent', now(),
        '["/app/inbox"]',
        '{"preset":"completa","destinos":["/app/inbox"]}')
      on conflict do nothing;

    update public.organizations
       set interface_settings = '{"preset":"simplificada","destinos":["/app/kanban","/app/agenda"]}'
     where id = '${ORG}';
  `);
  sql(blocoDaMigration());
});

const linha = (user: string, coluna: "menu_oculto" | "interface_settings") =>
  sql(`select ${coluna}::text from public.user_organizations where user_id = '${user}' and organization_id = '${ORG}'`);

describe("9005 — /app/kanban vira /app/crms nos dados do menu", () => {
  it("menu oculto: troca no lugar, preservando a ordem do resto", () => {
    expect(linha(ESCONDEU, "menu_oculto")).toBe('["/app/inbox", "/app/crms", "grupo:ia"]');
  });

  it("menu oculto que já tinha /app/crms: sobra UM, sem duplicata", () => {
    expect(linha(JA_TINHA, "menu_oculto")).toBe('["/app/crms"]');
  });

  it("interface do vínculo: destinos trocados, preset mantido", () => {
    expect(linha(ESCONDEU, "interface_settings")).toBe(
      '{"preset": "simplificada", "destinos": ["/app/inbox", "/app/crms", "/app/contacts"]}',
    );
  });

  it("interface da empresa: destinos trocados", () => {
    expect(sql(`select interface_settings::text from public.organizations where id = '${ORG}'`)).toBe(
      '{"preset": "simplificada", "destinos": ["/app/crms", "/app/agenda"]}',
    );
  });

  it("quem não citava /app/kanban não é tocado", () => {
    expect(linha(INTOCADO, "menu_oculto")).toBe('["/app/inbox"]');
    expect(linha(INTOCADO, "interface_settings")).toBe('{"preset": "completa", "destinos": ["/app/inbox"]}');
    expect(linha(JA_TINHA, "interface_settings")).toBe('{"preset": "completa"}');
  });

  it("reaplicar não muda mais nada (update.sh)", () => {
    const antes = sql(`select string_agg(menu_oculto::text || interface_settings::text, '|' order by user_id)
                         from public.user_organizations where organization_id = '${ORG}'`);
    sql(blocoDaMigration());
    expect(
      sql(`select string_agg(menu_oculto::text || interface_settings::text, '|' order by user_id)
             from public.user_organizations where organization_id = '${ORG}'`),
    ).toBe(antes);
    expect(sql(`select count(*) from public.user_organizations where menu_oculto::text like '%/app/kanban%'`)).toBe("0");
  });
});
