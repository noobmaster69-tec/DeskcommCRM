/**
 * O menu lateral PESSOAL (fork jhoow, P6): a regra pura, a rota e a fiação.
 *
 * A garantia que importa é a de direção: a preferência só ESCONDE. Ela roda
 * depois de papel, empresa e vínculo, então nunca devolve ao menu o que essas
 * camadas tiraram — e o caso ⭐ abaixo prova isso com uma tela proibida.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  aplicarMenuOculto,
  chaveDeGrupo,
  chaveDoMenuOculto,
  lerMenuOculto,
} from "@/lib/navigation/menu-pessoal";
import { sidebarGroups } from "@/lib/navigation/registry";

const mocks = vi.hoisted(() => ({ support: vi.fn(), role: vi.fn(), audit: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.support }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
import { PATCH } from "@/app/api/v1/me/menu/route";

const grupos = () => sidebarGroups(false, "admin");
const hrefs = (gs: ReturnType<typeof grupos>) => gs.flatMap((g) => g.items.map((i) => i.href));

describe("aplicarMenuOculto", () => {
  it("⭐ esconde a tela escolhida e mantém o resto", () => {
    const antes = hrefs(grupos());
    const depois = hrefs(aplicarMenuOculto(grupos(), ["/app/radar"]));
    expect(antes).toContain("/app/radar");
    expect(depois).not.toContain("/app/radar");
    expect(depois).toHaveLength(antes.length - 1);
  });

  it("⭐ esconder o grupo esconde todos os itens dele de uma vez", () => {
    const depois = aplicarMenuOculto(grupos(), [chaveDeGrupo("ia")]);
    expect(depois.map((g) => g.group.id)).not.toContain("ia");
    expect(hrefs(depois)).not.toContain("/app/ai/agents");
  });

  it("grupo com todos os itens escondidos some, sem cabeçalho órfão", () => {
    const canais = grupos().find((g) => g.group.id === "canais")!;
    const depois = aplicarMenuOculto(grupos(), canais.items.map((i) => i.href));
    expect(depois.map((g) => g.group.id)).not.toContain("canais");
  });

  it("⭐ só esconde: tela que o papel não vê não volta, mesmo listada", () => {
    // `agent` não vê Conexões (admin). Uma preferência estranha não pode
    // devolvê-la — a camada pessoal só tira do que já veio.
    const doAgent = sidebarGroups(false, "agent");
    const depois = aplicarMenuOculto(doAgent, ["/app/radar"]);
    expect(hrefs(depois)).not.toContain("/app/connections");
  });

  it("valor que não casa com nada é ignorado", () => {
    expect(hrefs(aplicarMenuOculto(grupos(), ["/app/nao-existe", "grupo:xyz"]))).toEqual(hrefs(grupos()));
  });
});

describe("lerMenuOculto", () => {
  it("nunca lança: lixo vira lista vazia", () => {
    expect(lerMenuOculto(null)).toEqual([]);
    expect(lerMenuOculto("x")).toEqual([]);
    expect(lerMenuOculto([1, 2])).toEqual([]);
    expect(lerMenuOculto(["/app/radar", "/app/radar"])).toEqual(["/app/radar"]);
  });

  it("a chave do navegador é por usuário e organização", () => {
    expect(chaveDoMenuOculto("u", "a")).not.toBe(chaveDoMenuOculto("u", "b"));
  });
});

describe("PATCH /api/v1/me/menu", () => {
  const user = "f2210000-0000-4000-8000-000000000001";
  const org = "f2210000-0000-4000-8000-000000000002";
  const req = (body: unknown) =>
    new NextRequest("http://local/api/v1/me/menu", { method: "PATCH", body: JSON.stringify(body) });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.support.mockResolvedValue(null);
    mocks.role.mockResolvedValue({ ok: true, user: { id: user }, org: { orgId: org } });
    mocks.rpc.mockResolvedValue({ data: { id: "m1", menu_oculto: [] }, error: null });
  });

  it("suporte somente-leitura nega antes de tudo", async () => {
    mocks.support.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await PATCH(req({ menu_oculto: [] }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("qualquer papel grava o PRÓPRIO menu (viewer é o piso)", async () => {
    await PATCH(req({ menu_oculto: ["/app/radar"] }));
    expect(mocks.role).toHaveBeenCalledWith("viewer", expect.anything());
  });

  it("⭐ a organização vem da SESSÃO, nunca do corpo — corpo com campo extra é recusado", async () => {
    expect((await PATCH(req({ menu_oculto: [], organization_id: "outra" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    await PATCH(req({ menu_oculto: ["/app/radar"] }));
    expect(mocks.rpc).toHaveBeenCalledWith("fn_definir_menu_oculto", {
      p_organization_id: org,
      p_itens: ["/app/radar"],
    });
  });

  it("formato inválido não chega ao banco", async () => {
    for (const corpo of [{}, { menu_oculto: "x" }, { menu_oculto: [1] }, { menu_oculto: Array(201).fill("a").map((a, i) => a + i) }])
      expect((await PATCH(req(corpo))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("grava, audita e devolve a lista", async () => {
    const r = await PATCH(req({ menu_oculto: ["/app/radar"] }));
    expect(r.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "me.menu_changed", organizationId: org }));
  });

  it("vínculo inexistente vira 404 e não audita", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0002" } });
    expect((await PATCH(req({ menu_oculto: [] }))).status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe("a fiação", () => {
  it("a sessão lê `menu_oculto` e o menu aplica a preferência", () => {
    expect(readFileSync("lib/auth/server.ts", "utf8")).toMatch(/menu_oculto: lerMenuOculto\(row\.menu_oculto\)/);
    expect(readFileSync("components/shell/Sidebar.tsx", "utf8")).toMatch(/aplicarMenuOculto\(/);
  });

  it("a migration e o apêndice do baseline são o mesmo texto", () => {
    const mig = readFileSync("supabase/migrations/20261002190000_9001_menu_lateral_pessoal.sql", "utf8");
    expect(readFileSync("supabase/baseline.sql", "utf8")).toContain(mig);
  });
});
