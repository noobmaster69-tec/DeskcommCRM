/**
 * FLUXOS — Fase A (fork jhoow, Etapa 2 do master plan): a fundação.
 *
 * O que estes casos prendem:
 *  - os 11 blocos têm formato, e o formato recusa o que o pedido do dono proíbe
 *    (Compra sem valor, espera de 32 dias, distribuidor de uma saída…);
 *  - os blocos só existem na superfície `fluxo`: a paleta e o publish de
 *    follow-up não os aceitam, e vice-versa;
 *  - o grafo aceita fluxo de venda grande (o do Leona tem 111 blocos), mas o
 *    follow-up continua limitado a 60 na publicação;
 *  - a tela de Follow-ups e o seletor de fluxos nunca listam um fluxo (o mesmo
 *    defeito do #1130, agora com a quarta superfície).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG_DO_BLOCO, TIPOS_DE_BLOCO_DO_FLUXO } from "@/lib/followup/blocos-do-fluxo";
import { flowGraphSchema, MAX_NOS_DO_GRAFO, NODE_TYPES, type FlowGraph } from "@/lib/followup/graph-schema";
import { NOS_DA_SUPERFICIE, LIMITE_DE_NOS_DA_SUPERFICIE, validateFlowForPublish } from "@/lib/followup/validate-publish";

const erros = (g: FlowGraph, surface: "followup" | "fluxo") => {
  const r = validateFlowForPublish(g, { surface });
  return r.ok ? [] : r.errors;
};
import { FOLLOWUP_FLOW_SURFACES, SUPERFICIES_DO_RELOGIO } from "@/lib/followup/api-schemas";
import { grafoInicialDoFluxo } from "@/lib/followup/grafo-inicial-do-fluxo";
import { contarBlocos, passaNoFiltro, proximoNomeDeFluxo } from "@/lib/fluxos/lista";
import { arvoreDePastas, idsDaPastaEDescendentes } from "@/lib/fluxos/pastas";
import { NAV_CATALOG, NAV_GROUPS } from "@/lib/navigation/catalogo";
import { NODE_VISUALS } from "@/app/app/ai/followups/[id]/_components/nodes/nodeVisuals";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("os 11 blocos — formato", () => {
  it("⭐ são exatamente os 11 do pedido, todos na união do grafo", () => {
    expect(TIPOS_DE_BLOCO_DO_FLUXO).toEqual([
      "mensagem",
      "etiquetas",
      "aguardar_resposta",
      "notificacao",
      "condicional",
      "distribuidor",
      "conexao_fluxo",
      "pixel",
      "intervalo",
      "bloco_ia",
      "kanban",
    ]);
    for (const tipo of TIPOS_DE_BLOCO_DO_FLUXO) expect(NODE_TYPES).toContain(tipo);
  });

  it("⭐ o config padrão de cada bloco no editor é válido (o rascunho salva)", () => {
    for (const tipo of TIPOS_DE_BLOCO_DO_FLUXO) {
      const r = CONFIG_DO_BLOCO[tipo].safeParse(NODE_VISUALS[tipo].defaultConfig());
      expect(r.success, `${tipo}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    }
  });

  it("mensagem: texto, mídia e intervalo aleatório; mídia exige arquivo OU link https", () => {
    const ok = CONFIG_DO_BLOCO.mensagem.safeParse({
      itens: [
        { id: "a", tipo: "texto", texto: "Oi, {nome}! Sou o Jonatas 📸" },
        { id: "b", tipo: "intervalo", modo: "fixo", segundos: 2 },
        { id: "c", tipo: "imagem", midia: { storage_path: "org/x/retratos.jpg" } },
        { id: "d", tipo: "intervalo", modo: "aleatorio", min_segundos: 1, max_segundos: 3 },
        { id: "e", tipo: "audio", midia: { url: "https://cdn.exemplo.com/a.ogg" } },
      ],
    });
    expect(ok.success).toBe(true);
    const semMidia = CONFIG_DO_BLOCO.mensagem.safeParse({ itens: [{ id: "x", tipo: "imagem", midia: {} }] });
    expect(semMidia.success).toBe(false);
    const http = CONFIG_DO_BLOCO.mensagem.safeParse({ itens: [{ id: "x", tipo: "video", midia: { url: "http://x.com/v.mp4" } }] });
    expect(http.success, "link sem https").toBe(false);
    const invertido = CONFIG_DO_BLOCO.mensagem.safeParse({
      itens: [{ id: "x", tipo: "intervalo", modo: "aleatorio", min_segundos: 5, max_segundos: 2 }],
    });
    expect(invertido.success, "máximo menor que o mínimo").toBe(false);
  });

  it("aguardar resposta: tempo obrigatório salvo 'indefinidamente', teto de 31 dias", () => {
    expect(CONFIG_DO_BLOCO.aguardar_resposta.safeParse({ sem_limite: false }).success).toBe(false);
    expect(CONFIG_DO_BLOCO.aguardar_resposta.safeParse({ sem_limite: true }).success).toBe(true);
    expect(CONFIG_DO_BLOCO.aguardar_resposta.safeParse({ tempo: { valor: 31, unidade: "dias" } }).success).toBe(true);
    expect(CONFIG_DO_BLOCO.aguardar_resposta.safeParse({ tempo: { valor: 32, unidade: "dias" } }).success).toBe(false);
  });

  it("pixel: Compra exige valor; os outros eventos não", () => {
    const base = { page_id: "{page_id}" };
    expect(CONFIG_DO_BLOCO.pixel.safeParse({ ...base, evento: "Purchase" }).success).toBe(false);
    expect(CONFIG_DO_BLOCO.pixel.safeParse({ ...base, evento: "Purchase", valor: "{valor_pacote}" }).success).toBe(true);
    expect(CONFIG_DO_BLOCO.pixel.safeParse({ ...base, evento: "Lead" }).success).toBe(true);
  });

  it("distribuidor: de 2 a 10 saídas, ids únicos", () => {
    const saidas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, nome: `Saída ${i + 1}` }));
    expect(CONFIG_DO_BLOCO.distribuidor.safeParse({ saidas: saidas(1) }).success).toBe(false);
    expect(CONFIG_DO_BLOCO.distribuidor.safeParse({ saidas: saidas(10) }).success).toBe(true);
    expect(CONFIG_DO_BLOCO.distribuidor.safeParse({ saidas: saidas(11) }).success).toBe(false);
    expect(
      CONFIG_DO_BLOCO.distribuidor.safeParse({ saidas: [{ id: "a", nome: "1" }, { id: "a", nome: "2" }] }).success,
    ).toBe(false);
  });

  it("intervalo: duração até 31 dias, data, e horários por dia da semana", () => {
    expect(CONFIG_DO_BLOCO.intervalo.safeParse({ modo: "duracao", valor: 31, unidade: "dias" }).success).toBe(true);
    expect(CONFIG_DO_BLOCO.intervalo.safeParse({ modo: "duracao", valor: 32, unidade: "dias" }).success).toBe(false);
    expect(CONFIG_DO_BLOCO.intervalo.safeParse({ modo: "data", quando: "{data_sessao}" }).success).toBe(true);
    expect(
      CONFIG_DO_BLOCO.intervalo.safeParse({ modo: "horarios", janelas: [{ dia: 1, inicio: "09:00", fim: "18:00" }] }).success,
    ).toBe(true);
    expect(
      CONFIG_DO_BLOCO.intervalo.safeParse({ modo: "horarios", janelas: [{ dia: 1, inicio: "9h", fim: "18:00" }] }).success,
    ).toBe(false);
  });

  it("⭐ bloco de IA: sem campo de chave de API no grafo (decisão do dono)", () => {
    const comChave = CONFIG_DO_BLOCO.bloco_ia.safeParse({ provedor: "openai", modelo: "gpt-4o", api_key: "sk-123" });
    expect(comChave.success, "chave digitada não pode morar no grafo").toBe(false);
    expect(CONFIG_DO_BLOCO.bloco_ia.safeParse({ provedor: "openai", modelo: "gpt-4o" }).success).toBe(true);
  });

  it("kanban: mover exige a etapa; adicionar não", () => {
    expect(CONFIG_DO_BLOCO.kanban.safeParse({ acao: "mover", pipeline_id: UUID }).success).toBe(false);
    expect(CONFIG_DO_BLOCO.kanban.safeParse({ acao: "adicionar", pipeline_id: UUID }).success).toBe(true);
  });
});

describe("superfície `fluxo`", () => {
  it("existe no vocabulário, e a tela de Follow-ups NÃO a lista", () => {
    expect(FOLLOWUP_FLOW_SURFACES).toContain("fluxo");
    expect(SUPERFICIES_DO_RELOGIO).toEqual(["followup", "crm_automation"]);
  });

  it("⭐ blocos de fluxo não entram em follow-up; caixa de follow-up não entra em fluxo", () => {
    for (const tipo of TIPOS_DE_BLOCO_DO_FLUXO) {
      expect(NOS_DA_SUPERFICIE.followup).not.toContain(tipo);
      expect(NOS_DA_SUPERFICIE.atendimento).not.toContain(tipo);
    }
    expect(NOS_DA_SUPERFICIE.fluxo).not.toContain("action");
    expect(NOS_DA_SUPERFICIE.fluxo).not.toContain("ai_classify");
  });

  it("⭐ fluxo novo nasce Início → Fim, salva e publica na superfície fluxo", () => {
    const g = grafoInicialDoFluxo();
    expect(flowGraphSchema.safeParse(g).success).toBe(true);
    expect(erros(g, "fluxo")).toEqual([]);
    expect(contarBlocos(g), "Início e Fim não contam como blocos").toBe(0);
  });

  it("⭐ grafo grande: o formato aceita 111 blocos; o follow-up continua no teto de 60", () => {
    expect(MAX_NOS_DO_GRAFO).toBeGreaterThanOrEqual(111);
    expect(LIMITE_DE_NOS_DA_SUPERFICIE.followup).toBe(60);
    expect(LIMITE_DE_NOS_DA_SUPERFICIE.fluxo).toBeGreaterThanOrEqual(111);
    const nos = Array.from({ length: 70 }, (_, i) =>
      i === 0
        ? { id: "n0", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} }
        : { id: `n${i}`, type: "end", label: "Fim", position: { x: 0, y: i * 10 }, config: { outcome: "custom" } },
    ) as FlowGraph["nodes"];
    const grande: FlowGraph = { nodes: nos, edges: [{ id: "e", source: "n0", target: "n1", priority: 0, condition: { type: "always" } }] };
    expect(flowGraphSchema.safeParse(grande).success).toBe(true);
    const errosFollowup = erros(grande, "followup");
    expect(errosFollowup.some((e) => e.code === "grafo_grande_demais")).toBe(true);
    const errosFluxo = erros(grande, "fluxo");
    expect(errosFluxo.some((e) => e.code === "grafo_grande_demais")).toBe(false);
  });
});

describe("lista de Fluxos — regras puras", () => {
  it("filtro de status: Ativos, Pausados, Todos (rascunho só em Todos)", () => {
    expect(passaNoFiltro("active", "ativos")).toBe(true);
    expect(passaNoFiltro("disabled", "pausados")).toBe(true);
    expect(passaNoFiltro("draft", "ativos")).toBe(false);
    expect(passaNoFiltro("draft", "todos")).toBe(true);
  });

  it("nome do fluxo novo não colide (o nome é único na organização)", () => {
    expect(proximoNomeDeFluxo([])).toBe("Novo fluxo");
    expect(proximoNomeDeFluxo(["Novo fluxo", "novo fluxo 2"])).toBe("Novo fluxo 3");
  });

  it("pastas: árvore com contagem que soma as subpastas, e o filtro alcança as descendentes", () => {
    const arvore = arvoreDePastas(
      [
        { id: "a", nome: "Vendas", parent_id: null, posicao: 0 },
        { id: "b", nome: "Retrato 97", parent_id: "a", posicao: 0 },
        { id: "c", nome: "Entrega", parent_id: null, posicao: 1 },
        { id: "d", nome: "órfã", parent_id: "sumiu", posicao: 2 },
      ],
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 4],
      ]),
    );
    expect(arvore.map((n) => n.id)).toEqual(["a", "c", "d"]);
    expect(arvore[0]!.total).toBe(3);
    expect(arvore[0]!.filhas[0]!.id).toBe("b");
    expect([...idsDaPastaEDescendentes(arvore, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("menu e fiação", () => {
  it("⭐ grupo Operações logo depois de Atendimento, com Fluxos (manager+)", () => {
    expect(NAV_GROUPS.map((g) => g.id).slice(0, 2)).toEqual(["atendimento", "operacoes"]);
    const fluxos = NAV_CATALOG.find((d) => d.href === "/app/fluxos");
    expect(fluxos).toMatchObject({ group: "operacoes", minRole: "manager", label: "Fluxos" });
  });

  it("⭐ 'Fluxos de atendimento' virou 'Perguntas da IA' (para não confundir com Fluxos)", () => {
    expect(NAV_CATALOG.find((d) => d.href === "/app/ai/atendimento")?.label).toBe("Perguntas da IA");
  });

  it("⭐ a tela e o editor de Follow-ups nunca abrem um fluxo do construtor", () => {
    for (const arquivo of ["app/app/ai/followups/page.tsx", "app/app/ai/followups/[id]/page.tsx"]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, arquivo).toMatch(/\.in\("surface", \[\.\.\.SUPERFICIES_DO_RELOGIO\]\)/);
      expect(fonte, arquivo).not.toMatch(/\.neq\("surface", "atendimento"\)/);
    }
    const rota = readFileSync("app/api/v1/ai/followup-flows/route.ts", "utf8");
    expect(rota).toMatch(/base\.in\("surface", \[\.\.\.SUPERFICIES_DO_RELOGIO\]\)/);
  });

  it("o editor de Fluxos só abre a superfície fluxo", () => {
    expect(readFileSync("app/app/fluxos/[id]/page.tsx", "utf8")).toMatch(/\.eq\("surface", "fluxo"\)/);
  });

  it("migration 9002 e o apêndice do baseline são o mesmo texto — salvo o CHECK, que mora no bloco único", () => {
    const mig = readFileSync("supabase/migrations/20261002200000_9002_fluxos_fundacao.sql", "utf8");
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    const ini = mig.indexOf("-- 1. a superfície\n");
    const fim = mig.indexOf("-- 2. as pastas\n");
    expect(ini).toBeGreaterThan(0);
    const nota =
      "-- 1. a superfície: o CHECK `followup_flow_pointers_surface_check` mora no seu\n" +
      "--    BLOCO ÚNICO (migration 0196 acima), que já lista 'fluxo'.\n\n";
    expect(baseline).toContain(mig.slice(0, ini) + nota + mig.slice(fim));
    // …e o bloco único é que carrega a superfície nova.
    expect(baseline).toContain("check (surface in ('followup', 'crm_automation', 'atendimento', 'fluxo'));");
  });
});
