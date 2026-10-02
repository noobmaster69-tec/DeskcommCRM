import { describe, expect, it } from "vitest";

import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import {
  NAV_DESTINATIONS,
  NAV_GROUPS,
  canSee,
  hubSections,
  searchable,
  sidebarGroups,
} from "@/lib/navigation/registry";

/**
 * O registro é a fonte única da navegação. Estes testes cobrem as projeções
 * puras — quem renderiza (sidebar, hub, ⌘K) não decide nada, só desenha o que
 * sai daqui. A completude do registro contra as rotas de verdade é assunto de
 * `navegacao-completude.test.ts`.
 */

const ADMIN = { platform: false, role: "admin" as const };
const MANAGER = { platform: false, role: "manager" as const };
const AGENT = { platform: false, role: "agent" as const };
const VIEWER = { platform: false, role: "viewer" as const };

function dest(href: string) {
  const d = NAV_DESTINATIONS.find((x) => x.href === href);
  if (!d) throw new Error(`destino ausente do registro: ${href}`);
  return d;
}

describe("integridade do registro", () => {
  it("não tem href duplicado", () => {
    const vistos = new Map<string, number>();
    for (const d of NAV_DESTINATIONS) vistos.set(d.href, (vistos.get(d.href) ?? 0) + 1);
    const duplicados = [...vistos.entries()].filter(([, n]) => n > 1).map(([href]) => href);
    expect(duplicados).toEqual([]);
  });

  it("todo destino aponta para um grupo declarado", () => {
    const ids = new Set(NAV_GROUPS.map((g) => g.id));
    const orfaos = NAV_DESTINATIONS.filter((d) => !ids.has(d.group)).map((d) => d.href);
    expect(orfaos).toEqual([]);
  });

  it("todo destino tem descrição — é o que o hub e o ⌘K mostram", () => {
    const semTexto = NAV_DESTINATIONS.filter((d) => d.description.trim() === "").map((d) => d.href);
    expect(semTexto).toEqual([]);
  });

  it("todo destino de um grupo com hub declara sua seção", () => {
    const comHub = new Set(NAV_GROUPS.filter((g) => g.hub).map((g) => g.id));
    const semSecao = NAV_DESTINATIONS.filter((d) => comHub.has(d.group) && !d.section).map(
      (d) => d.href,
    );
    expect(semSecao).toEqual([]);
  });
});

describe("canSee", () => {
  it("nega quem está abaixo do minRole", () => {
    expect(canSee(dest("/app/audit"), MANAGER.platform, MANAGER.role)).toBe(true);
    expect(canSee(dest("/app/audit"), AGENT.platform, AGENT.role)).toBe(false);
  });

  it("destino sem minRole é visível até para viewer", () => {
    expect(canSee(dest("/app/inbox"), VIEWER.platform, VIEWER.role)).toBe(true);
  });

  it("platform admin vê tudo, inclusive sem org ativa", () => {
    for (const d of NAV_DESTINATIONS) expect(canSee(d, true, null)).toBe(true);
  });

  it("sem papel e sem ser platform admin não vê nada", () => {
    expect(canSee(dest("/app/inbox"), false, null)).toBe(false);
  });
});

describe("sidebarGroups", () => {
  it("devolve os grupos na ordem declarada em NAV_GROUPS", () => {
    const ordem = sidebarGroups(true, null).map((g) => g.group.id);
    const esperada = NAV_GROUPS.map((g) => g.id).filter((id) => ordem.includes(id));
    expect(ordem).toEqual(esperada);
  });

  it("lista TODO destino visível do grupo — fork jhoow (P5), sem hub no menu", () => {
    const hrefs = sidebarGroups(true, null).flatMap((g) => g.items.map((i) => i.href));
    // Conhecimento era só do hub; agora está no menu, e quem esconde é a
    // preferência de menu da pessoa.
    expect(hrefs).toContain("/app/ai/knowledge/sources");
    expect(hrefs).toContain("/app/ai/agents");
    // O grupo do rodapé continua sendo só o link de Configurações.
    expect(sidebarGroups(true, null).find((g) => g.group.id === "organizacao")?.items).toEqual([]);
  });

  it("Etapas do funil é CRM, não Configurações — o achado que originou esta mudança", () => {
    // ⚠️ ESTA ASSERÇÃO MUDOU DE SUPERFÍCIE, e a propriedade guardada é a mesma.
    // Ela cobrava presença no SIDEBAR, que era só o jeito de a tela deixar de
    // ser "um card perdido em Configurações". Com o hub do CRM (`/app/crm`),
    // ela mora atrás de "Ver tudo em CRM" — continua sendo CRM, continua fora
    // de Configurações, e o caminho tem um clique a mais porque desenhar as
    // colunas do funil é trabalho de montagem, não de todo dia.
    //
    // O que NÃO pode voltar é o destino trocar de grupo: é isso que a primeira
    // asserção prende, e ela não depende de onde o item é desenhado.
    expect(dest("/app/settings/tenant/pipelines").group).toBe("crm");
    const hub = hubSections("crm", true, null).flatMap((s) => s.items.map((i) => i.href));
    expect(hub).toContain("/app/settings/tenant/pipelines");
  });

  it("o CRM lista todas as telas, com o uso diário no topo — fork jhoow (P5)", () => {
    // O upstream escondia o resto do CRM atrás de "Ver tudo em CRM" para o menu
    // caber em 900px. O dono do fork pediu o contrário: tudo no menu, e quem
    // poda é a preferência de cada pessoa. O que se mantém é o TOPO do grupo:
    // os três destinos de uso diário, na ordem de sempre.
    const crm = sidebarGroups(true, null).find((g) => g.group.id === "crm");
    const hrefs = crm?.items.map((i) => i.href) ?? [];
    expect(hrefs.slice(0, 3)).toEqual(["/app/kanban", "/app/contacts", "/app/tasks"]);
    expect(hrefs).toContain("/app/comandas");
    expect(hrefs).toContain("/app/settings/tenant/pipelines");
    expect(NAV_GROUPS.find((g) => g.id === "crm")?.hub).toBeUndefined();
  });

  it("omite o grupo inteiro quando o papel não vê nenhum item dele", () => {
    // CANAIS é todo manager+/admin: um agent não deve ver o título órfão.
    const ids = sidebarGroups(AGENT.platform, AGENT.role).map((g) => g.group.id);
    expect(ids).not.toContain("canais");
    expect(ids).toContain("atendimento");
  });

  it("a ordem dentro do grupo de IA começa pelo uso real: agentes, follow-ups, casos", () => {
    // Fork jhoow (P5): o resto da IA (Roteadores, Provedores, Execuções…) vem
    // logo abaixo, no menu, em vez de atrás de "Ver tudo em IA".
    const ia = sidebarGroups(true, null).find((g) => g.group.id === "ia");
    const hrefs = ia?.items.map((i) => i.href) ?? [];
    expect(hrefs.slice(0, 3)).toEqual(["/app/ai/agents", "/app/ai/followups", "/app/ai/cases"]);
    expect(hrefs.length).toBeGreaterThan(3);
  });
});

describe("hubSections", () => {
  it("o hub do CRM é inventário: as telas do grupo, nas duas seções", () => {
    // As seções são a régua do sidebar escrita por extenso — o que se abre todo
    // dia contra o que se define uma vez. Lista EXATA: `toContain` deixaria uma
    // tela nova entrar sem que ninguém decidisse de que lado dela ela cai.
    const secoes = hubSections("crm", true, null);
    expect(secoes.map((s) => s.section)).toEqual(["O dia a dia da venda", "Preparar a venda", "Fechar a venda"]);
    expect(secoes.flatMap((s) => s.items.map((i) => i.href))).toEqual([
      "/app/prospecting",
      "/app/kanban",
      "/app/campaigns",
      "/app/contacts",
      "/app/companies",
      "/app/people",
      "/app/tasks",
      "/app/calls",
      "/app/comandas",
      "/app/products",
      "/app/imports",
      "/app/settings/tenant/pipelines",
      "/app/proposals",
    ]);
  });

  it("empresas, pessoas e importação só existem com o módulo crm_b2b ligado (doc 68)", () => {
    const B2B = ["/app/companies", "/app/people", "/app/imports"];
    const hrefs = (modulos: readonly ModuloOpcional[]) =>
      hubSections("crm", true, null, undefined, modulos).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs([]).filter((h) => B2B.includes(h))).toEqual([]);
    expect(hrefs(["crm_b2b"]).filter((h) => B2B.includes(h))).toEqual(B2B);
  });

  it("agrupa a IA nas três etapas da jornada, na ordem", () => {
    const secoes = hubSections("ia", true, null).map((s) => s.section);
    expect(secoes).toEqual(["Montar o agente", "Ensinar o agente", "Acompanhar o agente"]);
  });

  it("o hub mostra também o que já está no sidebar — é inventário, não sobra", () => {
    const hrefs = hubSections("ia", true, null).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/app/ai/agents");
    expect(hrefs).toContain("/app/ai/knowledge/sources");
  });

  it("não vaza destino acima do papel", () => {
    const hrefs = hubSections("organizacao", VIEWER.platform, VIEWER.role).flatMap((s) =>
      s.items.map((i) => i.href),
    );
    expect(hrefs).not.toContain("/app/settings/api-tokens");
    expect(hrefs).toContain("/app/settings/profile");
  });

  it("some com a seção que ficou vazia pela permissão", () => {
    /**
     * Esta asserção era `expect(secoes).not.toContain("Dados e acesso")`, e o
     * que a fazia passar era um ACIDENTE do catálogo: por um tempo, os dois
     * destinos daquela seção eram `admin`. Quando "Dados externos" entrou nela
     * SEM `minRole` — o banco externo é lido por qualquer autenticado, decisão
     * do dono no #1130 —, a seção passou a existir para o `viewer` e o teste
     * ficou vermelho. Ele não pegou defeito nenhum: reprovou o CATÁLOGO por uma
     * mudança que a projeção tratou certo.
     *
     * A propriedade não é sobre uma seção nomeada; é sobre TODA seção, em todo
     * grupo, para todo papel. Escrita assim, ela não envelhece quando alguém
     * acrescenta, move ou reclassifica um destino.
     */
    for (const grupo of NAV_GROUPS) {
      for (const quem of [VIEWER, AGENT, MANAGER, ADMIN]) {
        for (const s of hubSections(grupo.id, quem.platform, quem.role)) {
          expect(
            s.items.length,
            `${grupo.id} / "${s.section}" veio vazia para ${quem.role}`,
          ).toBeGreaterThan(0);
        }
      }
    }

    /**
     * E a testemunha de que a projeção está mesmo sendo exercitada: precisa
     * existir ALGUMA seção que o admin vê e o viewer não. Sem isto, o laço
     * acima seguiria verde num catálogo onde nada é gateado — verde por
     * ausência de caso, que se lê igual a verde por acerto. A seção sai do
     * catálogo, nunca escrita à mão.
     */
    const secoesDe = (quem: typeof VIEWER | typeof ADMIN) =>
      new Set(
        NAV_GROUPS.flatMap((g) =>
          hubSections(g.id, quem.platform, quem.role).map((s) => `${g.id}/${s.section}`),
        ),
      );
    const doViewer = secoesDe(VIEWER);
    const somemParaOViewer = [...secoesDe(ADMIN)].filter((s) => !doViewer.has(s));
    expect(
      somemParaOViewer.length,
      "nenhuma seção some para o viewer — a projeção por papel deixou de ser exercitada",
    ).toBeGreaterThan(0);
  });
});

describe("searchable", () => {
  it("expõe todo destino visível, do sidebar ou não", () => {
    const hrefs = searchable(ADMIN.platform, ADMIN.role).map((d) => d.href);
    expect(hrefs).toContain("/app/ai/knowledge/sources");
    expect(hrefs).toContain("/app/inbox");
  });

  it("respeita o papel", () => {
    const hrefs = searchable(AGENT.platform, AGENT.role).map((d) => d.href);
    expect(hrefs).not.toContain("/app/audit");
  });
});
