import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("./card-da-campanha", () => ({ garantirCardNaEtapa: vi.fn(async () => "criado") }));

import { importacaoSchema, importarAudiencia, type EntradaDaImportacao } from "./importar-audiencia";

/**
 * Item 1 (fork jhoow): o lado do servidor da lista importada — política de
 * duplicata, contato criado sempre, lista gravada com o arquivo original.
 */
const ORG = "00000000-0000-4000-8000-000000000001";

interface Chamada {
  tabela: string;
  op: string;
  dados?: unknown;
  filtros: Array<[string, unknown]>;
}

function falso(existentes: Array<{ id: string; phone_number: string; name: string | null; email: string | null }>) {
  const chamadas: Chamada[] = [];
  let seq = 0;
  const builder = (tabela: string) => {
    const c: Chamada = { tabela, op: "select", filtros: [] };
    const resolver = async () => {
      chamadas.push(c);
      if (tabela === "contacts" && c.op === "select") {
        const fones = (c.filtros.find(([k]) => k === "in:phone_number")?.[1] ?? []) as string[];
        return { data: existentes.filter((e) => fones.includes(e.phone_number)).map((e) => ({ ...e, custom_fields: {} })), error: null };
      }
      if (c.op === "insert") return { data: { id: `novo-${++seq}` }, error: null };
      return { data: null, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (d: unknown) => ((c.op = "insert"), (c.dados = d), q),
      update: (d: unknown) => ((c.op = "update"), (c.dados = d), q),
      upsert: (d: unknown) => ((c.op = "upsert"), (c.dados = d), q),
      eq: (k: string, v: unknown) => (c.filtros.push([k, v]), q),
      is: () => q,
      in: (k: string, v: unknown) => (c.filtros.push([`in:${k}`, v]), q),
      order: () => q,
      limit: () => q,
      single: resolver,
      maybeSingle: resolver,
      then: (ok: (x: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko),
    };
    return q;
  };
  const upload = vi.fn(async () => ({ error: null }));
  const admin = {
    from: builder,
    storage: { from: () => ({ upload }) },
    rpc: () => Promise.resolve({ error: null }),
  } as unknown as SupabaseClient;
  return { admin, chamadas, upload };
}

const linha = (n: number, telefone: string, nome: string) => ({
  linha: n,
  nome,
  empresa: null,
  telefone,
  email: null,
  campos: { cidade: "SP" },
});

function entrada(p: Partial<EntradaDaImportacao>): EntradaDaImportacao {
  return importacaoSchema.parse({
    linhas: [linha(1, "+5511999990001", "Ana"), linha(2, "11999990002", "Bia"), linha(3, "123", "Lixo")],
    politica: "manter",
    ...p,
  });
}

describe("importarAudiencia", () => {
  const ja = [{ id: "c-ana", phone_number: "+5511999990001", name: "Ana Antiga", email: null }];

  it("MANTER: existente entra sem mudança, novo é criado, lixo é inválido", async () => {
    const { admin, chamadas } = falso(ja);
    const r = await importarAudiencia(admin, { organizationId: ORG, userId: "u1" }, entrada({}), null);
    expect(r).toMatchObject({ total: 3, criados: 1, mantidos: 1, atualizados: 0, pulados: 0, invalidos: 1 });
    expect(chamadas.some((c) => c.tabela === "contacts" && c.op === "update")).toBe(false);
    const lista = chamadas.find((c) => c.tabela === "campaign_audience_sources")!;
    expect(lista.dados).toMatchObject({ organization_id: ORG, mode: "import", contact_ids: ["c-ana", "novo-1"] });
    const novo = chamadas.find((c) => c.tabela === "contacts" && c.op === "insert")!;
    expect(novo.dados).toMatchObject({ organization_id: ORG, phone_number: "+5511999990002", source: "campanha_importacao" });
  });

  it("PULAR: quem já é contato fica fora da lista", async () => {
    const { admin, chamadas } = falso(ja);
    const r = await importarAudiencia(admin, { organizationId: ORG, userId: "u1" }, entrada({ politica: "pular" }), null);
    expect(r).toMatchObject({ criados: 1, pulados: 1 });
    const lista = chamadas.find((c) => c.tabela === "campaign_audience_sources")!;
    expect((lista.dados as { contact_ids: string[] }).contact_ids).toEqual(["novo-1"]);
  });

  it("ATUALIZAR: nome e variáveis da planilha, filtrado pela organização", async () => {
    const { admin, chamadas } = falso(ja);
    const r = await importarAudiencia(admin, { organizationId: ORG, userId: "u1" }, entrada({ politica: "atualizar" }), null);
    expect(r.atualizados).toBe(1);
    const up = chamadas.find((c) => c.tabela === "contacts" && c.op === "update")!;
    expect(up.dados).toMatchObject({ name: "Ana", custom_fields: { cidade: "SP" } });
    expect(up.filtros).toEqual(expect.arrayContaining([["organization_id", ORG], ["id", "c-ana"]]));
  });

  it("acha o contato antigo sem o nono dígito", async () => {
    const { admin } = falso([{ id: "c-velho", phone_number: "+551199990001", name: null, email: null }]);
    const r = await importarAudiencia(
      admin,
      { organizationId: ORG, userId: "u1" },
      entrada({ linhas: [linha(1, "+5511999990001", "Ana")] }),
      null,
    );
    expect(r).toMatchObject({ criados: 0, mantidos: 1 });
  });

  it("guarda o arquivo original na pasta da organização e cria as variáveis novas", async () => {
    const { admin, chamadas, upload } = falso([]);
    await importarAudiencia(
      admin,
      { organizationId: ORG, userId: "u1" },
      entrada({ novas_variaveis: [{ key: "cidade", label: "Cidade", type: "texto" }] }),
      { bytes: new Uint8Array([1]), tipo: "text/csv", extensao: "csv" },
    );
    const calls = upload.mock.calls as unknown as Array<[string]>;
    expect(calls[0]![0]).toMatch(new RegExp(`^${ORG}/[0-9a-f-]{36}\\.csv$`));
    const vars = chamadas.find((c) => c.tabela === "contact_custom_fields")!;
    expect(vars.dados).toEqual([expect.objectContaining({ key: "cidade", organization_id: ORG })]);
    const lista = chamadas.find((c) => c.tabela === "campaign_audience_sources")!;
    expect((lista.dados as { snapshot_file_path: string }).snapshot_file_path).toBe(calls[0]![0]);
  });

  it("o schema recusa variável nova com nome do sistema", () => {
    expect(
      importacaoSchema.safeParse({
        linhas: [linha(1, "+5511999990001", "Ana")],
        politica: "manter",
        novas_variaveis: [{ key: "primeiro_nome", label: "x" }],
      }).success,
    ).toBe(false);
  });
});
