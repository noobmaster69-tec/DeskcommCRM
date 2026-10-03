import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * `fn_definir_menu_oculto` SÓ MEXE NO MENU DE QUEM CHAMA (migration 9001, fork jhoow).
 *
 * A função é `security definer` e executável por `authenticated` — de propósito:
 * a policy de escrita de `user_organizations` é de admin, e esconder item do
 * PRÓPRIO menu lateral é de qualquer papel (PATCH /api/v1/me/menu, com o client
 * da sessão). `hardening-definer-varredura.test.ts` a aceita em
 * AUTHENTICATED_PERMITIDO citando este arquivo, que prova o que torna isso seguro:
 *
 * 1. Ela não tem seletor de usuário: grava na linha `user_id = auth.uid()`, e a
 *    linha de outra pessoa da MESMA organização não muda.
 * 2. Pedir a organização de que a pessoa não é membro não toca a linha do
 *    vizinho — recusa com P0002.
 * 3. Grava só `menu_oculto`: o papel da pessoa não muda junto.
 * 4. anon não executa; e o formato inválido é recusado (22023).
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

function chamarComo(userId: string, org: string, itens: string): string | null {
  return sqlstate(`set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    select public.fn_definir_menu_oculto('${org}', '${itens}'::jsonb);`);
}

function menuDe(userId: string, org: string): string {
  return sql(`select menu_oculto::text || '|' || role from public.user_organizations
               where user_id = '${userId}' and organization_id = '${org}'`);
}

const ORG_A = "3e0a0000-0000-4000-8000-00000000000a";
const ORG_B = "3e0a0000-0000-4000-8000-00000000000b";
const AGENT_A = "3e0a0000-1111-4000-8000-00000000000a";
const OUTRO_A = "3e0a0000-1111-4000-8000-00000000000c";
const AGENT_B = "3e0a0000-1111-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}', 'menu-agent-a@invariant.test'),
      ('${OUTRO_A}', 'menu-outro-a@invariant.test'),
      ('${AGENT_B}', 'menu-agent-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'menu-inv-a', 'Menu Invariant A', 'Menu A'),
      ('${ORG_B}', 'menu-inv-b', 'Menu Invariant B', 'Menu B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${OUTRO_A}', '${ORG_A}', 'agent', now()),
      ('${AGENT_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;
  `);
});

describe("fn_definir_menu_oculto", () => {
  it("grava o menu de quem chama, e só a coluna menu_oculto", () => {
    expect(chamarComo(AGENT_A, ORG_A, '["/app/kanban"]')).toBeNull();
    expect(menuDe(AGENT_A, ORG_A)).toBe('["/app/kanban"]|agent');
  });

  it("não toca o menu de outra pessoa da MESMA organização", () => {
    const antes = menuDe(OUTRO_A, ORG_A);
    expect(chamarComo(AGENT_A, ORG_A, '["/app/inbox"]')).toBeNull();
    expect(menuDe(OUTRO_A, ORG_A)).toBe(antes);
  });

  it("organização de que a pessoa não é membro → P0002, e a linha do vizinho não muda", () => {
    const antes = menuDe(AGENT_B, ORG_B);
    expect(chamarComo(AGENT_A, ORG_B, '["/app/inbox"]')).toBe("P0002");
    expect(menuDe(AGENT_B, ORG_B)).toBe(antes);
  });

  it("formato inválido é recusado (22023)", () => {
    expect(chamarComo(AGENT_A, ORG_A, '{"nao":"array"}')).toBe("22023");
  });

  it("anon não executa", () => {
    expect(
      sql(`select has_function_privilege('anon', 'public.fn_definir_menu_oculto(uuid,jsonb)', 'execute')::text`),
    ).toBe("false");
  });
});
