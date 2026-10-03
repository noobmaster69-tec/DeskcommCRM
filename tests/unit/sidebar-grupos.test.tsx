/**
 * Sidebar agrupado por objetivo. O que estes testes protegem:
 *
 *  - a hierarquia existe (o usuário reclamou de 17 itens no mesmo peso visual);
 *  - Funis é alcançável sem passar por Configurações — o achado que originou tudo;
 *  - agrupar não criou cabeçalho órfão (grupo cujos filhos a permissão filtrou);
 *  - colapsado não renderiza título nenhum: 6 rótulos em 64px seria ilegível.
 *
 * A regra de quem-vê-o-quê é do registro e está coberta em
 * `navegacao-registry.test.ts`; aqui é a superfície.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
}));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
// Os contadores leem pelo React Query; aqui não há provider, e o NÚMERO não é
// o objeto destes casos (mora em contador-de-casos/contador-da-fila.test.tsx).
// O dublê desenha um marcador vazio: o que se mede aqui é ONDE o Sidebar o põe.
vi.mock("@/components/shell/ContadorDeCasos", () => ({
  ContadorDeCasos: ({ compacto }: { compacto: boolean }) => (
    <span data-testid="marcador-casos" data-compacto={String(compacto)} />
  ),
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({
  ContadorDaFila: ({ compacto }: { compacto: boolean }) => (
    <span data-testid="marcador-fila" data-compacto={String(compacto)} />
  ),
}));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({
  toggleSidebar: vi.fn(),
}));
// Busca a versão via react-query; sem QueryClientProvider ele lança, e o
// rodapé de versão não é o que estes testes examinam.
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: () => null,
}));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.user = { is_platform_admin: false };
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

afterEach(cleanup);

describe("Sidebar agrupado", () => {
  it("renderiza os títulos de grupo na ordem de uso", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    const titulos = screen
      .getAllByRole("heading")
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    // Organização não tem título aqui: seu hub (Configurações) vive no rodapé
    // fixo, fora da área que rola — medido, ele caía fora da dobra até em 1080px.
    // Fork jhoow (Etapa 2): "Operações" (Fluxos) logo depois de Atendimento.
    expect(titulos).toEqual(["Atendimento", "Operações", "CRM", "Agente de IA", "Canais", "Análise"]);
  });

  it("leva às Etapas do funil pelo CRM, e não por Configurações", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    // Fork jhoow (P5): sem hub, a tela está DIRETO no grupo CRM do menu. A
    // propriedade que este teste sempre prendeu continua: a porta é o CRM,
    // nunca Configurações.
    const crm = document.querySelector('[aria-labelledby="nav-grupo-crm"]');
    const etapas = screen.getByRole("link", { name: "Etapas do funil" });
    expect(crm?.contains(etapas)).toBe(true);
  });

  it("o número de Casos mora no item de Casos, e o da Fila no item de Inbox", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    const casos = screen.getAllByTestId("marcador-casos");
    const fila = screen.getAllByTestId("marcador-fila");
    expect(casos).toHaveLength(1);
    expect(fila).toHaveLength(1);
    expect(casos[0]!.closest("a")).toHaveAttribute("href", "/app/ai/cases");
    expect(fila[0]!.closest("a")).toHaveAttribute("href", "/app/inbox");
    // Fork jhoow (P5): toda tela do grupo IA está no menu — Roteadores voltou.
    expect(screen.getByRole("link", { name: "Roteadores" })).toBeInTheDocument();
    cleanup();
    // Recolhido, o contador vira ponto — é o componente que decide, com esta dica.
    render(<Sidebar collapsed />);
    expect(screen.getByTestId("marcador-casos")).toHaveAttribute("data-compacto", "true");
  });

  it("e os dois itens de funil não disputam o mesmo nome", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    expect(screen.getByRole("link", { name: "CRMs" })).toHaveAttribute("href", "/app/crms");
  });

  it("desenterra Audit Log — e Nuvemshop está no menu (fork jhoow, P5)", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    // ⚠️ O CAMINHO MUDOU, A PROPRIEDADE NÃO. O que esta linha sempre prendeu é
    // que Audit Log deixou de existir só como card enterrado em Configurações.
    // Quando Atividades (PR #583) virou o quinto destino do grupo Análise e o
    // menu passou a rolar em 900px, a resposta foi o hub do grupo — como o
    // comentário de densidade do `Sidebar.tsx` já mandava. Audit Log foi para
    // dentro dele: a porta agora é "Ver tudo em Análise", nunca Configurações.
    //
    // Que a porta desemboca na tela é o e2e `navegacao.spec.ts` que percorre,
    // clicando; aqui prende-se que ela EXISTE, no grupo certo do sidebar.
    //
    // Canal oficial não está aqui de propósito: virou aba de Conexões no PR
    // #105, e Conexões é a porta.
    // Fork jhoow (P5): sem hub, Audit Log está direto no grupo Análise.
    const analise = document.querySelector('[aria-labelledby="nav-grupo-analise"]');
    expect(analise?.contains(screen.getByRole("link", { name: /Audit Log/ }))).toBe(true);

    // NUVEMSHOP VOLTOU AO MENU, por decisão do dono do produto no fork (P5:
    // "todas as telas no menu"). Quem não usa a esconde na preferência de menu.
    expect(screen.getByRole("link", { name: /Nuvemshop/ })).toBeInTheDocument();
  });

  it("Configurações fica no rodapé, nunca dependendo de scroll", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    const config = screen.getByRole("link", { name: /Configurações/ });
    expect(config).toHaveAttribute("href", "/app/settings");
    // Fora da <nav> que rola.
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.contains(config)).toBe(false);
  });

  it("não deixa cabeçalho órfão quando a permissão esvazia o grupo", () => {
    // CANAIS é todo manager+/admin. Um agent não pode ver o título sozinho.
    comoPapel("agent");
    render(<Sidebar collapsed={false} />);
    const titulos = screen.getAllByRole("heading").map((el) => el.textContent?.trim());
    expect(titulos).not.toContain("Canais");
    expect(titulos).toContain("Atendimento");
  });

  it("não há mais 'Ver tudo em …' no menu (fork jhoow, P5)", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    expect(screen.queryByRole("link", { name: /Ver tudo em/ })).toBeNull();
  });

  it("colapsado esconde os títulos mas mantém os links", () => {
    comoPapel("admin");
    render(<Sidebar collapsed />);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Inbox/ })).toBeTruthy();
  });

  it("marca a rota atual com aria-current", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);
    expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");
    // "Kanban" saiu da interface; o item virou "Funis" e, com os CRMs (9004), "CRMs".
    expect(screen.getByRole("link", { name: "CRMs" })).not.toHaveAttribute("aria-current");
  });
});
