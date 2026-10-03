import { z } from "zod";
import { MAX_NOS_DO_GRAFO, nodeBranches, type BranchableNode, type FlowEdge, type FlowGraph } from "@/lib/followup/graph-schema";

/**
 * IMPORTAR DO LEONA (fork jhoow, Fase D): converte o JSON de um fluxo do Leona
 * (o formato de `get_flow`: `flow`, `nodes[].actions[]`, `connections[]`) no
 * grafo dos Fluxos.
 *
 * Função PURA: não lê banco nem rede. O que depende da organização (funis,
 * fluxos já existentes) chega no `contexto`; a mídia sai como lista para quem
 * chama copiar para o Storage — o fluxo importado não pode depender da CDN do
 * Leona depois que a conta de lá for cancelada.
 *
 * Regras que valem para todo bloco:
 *  - Nada é inventado em silêncio. O que não tem equivalente vira AVISO, e o
 *    bloco sem equivalente vira um Fim "⚠ …" — o rascunho importado não publica
 *    sem alguém olhar, e o lugar do bloco fica visível no desenho.
 *  - Chave de API NUNCA atravessa (o Bloco de IA do Leona guarda a chave da
 *    OpenAI no próprio bloco; aqui a chave mora em IA › Credenciais).
 *  - Variáveis: `{{last_user_message}}` → `{ultima_mensagem}`,
 *    `{customer.campo}` → `{campo}`.
 *  - No Leona o fluxo acaba onde o último bloco acaba; aqui o publish pede um
 *    Fim — toda saída sem ligação ganha um Fim próprio.
 *  - Bloco que o Início do Leona não alcança (sobra de edição, solto no canvas)
 *    nunca rodou lá e não é importado; o aviso diz quantos.
 */

const idLeona = z.union([z.number(), z.string()]).transform(String);
const acaoSchema = z
  .object({
    action_type: z.string(),
    order: z.number().nullish(),
    config: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();
const conexaoSchema = z
  .object({
    id: idLeona.nullish(),
    from_node_id: idLeona.optional(),
    to_node_id: idLeona,
    condition_type: z.string().nullish(),
    condition_config: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();
const noSchema = z
  .object({
    id: idLeona,
    node_type: z.string(),
    name: z.string().nullish(),
    position: z.object({ x: z.number().nullish(), y: z.number().nullish() }).passthrough().nullish(),
    actions: z.array(acaoSchema).nullish(),
    connections: z.array(conexaoSchema).nullish(),
  })
  .passthrough();
export const fluxoDoLeonaSchema = z
  .object({
    flow: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    nodes: z.array(noSchema).min(1).max(400),
    connections: z.array(conexaoSchema).nullish(),
  })
  .passthrough();

export interface ContextoDaImportacao {
  funis: Array<{ id: string; nome: string; etapas: Array<{ id: string; nome: string }> }>;
  fluxos: Array<{ id: string; nome: string }>;
}

/** Uma mídia a copiar para o Storage: `origem` é https ou `data:`. */
export interface MidiaParaCopiar {
  noId: string;
  itemId: string;
  origem: string;
  nome: string | null;
  mime: string | null;
}

export interface ResultadoDaImportacao {
  nome: string;
  grafo: FlowGraph;
  avisos: string[];
  midias: MidiaParaCopiar[];
}

/** Placeholder de mídia em `data:` até a cópia trocar por `storage_path`. */
export const URL_PROVISORIA = "https://importacao.invalid/";
const UUID_VAZIO = "00000000-0000-4000-8000-000000000000";
const MAX_ROTULO = 60;

type Cfg = Record<string, unknown>;
type NoNosso = { id: string; type: string; label: string; position: { x: number; y: number }; config: unknown };
type Ramo = { type: "always" } | { type: "branch"; branch_id: string } | null;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown, padrao: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
};
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
const rotulo = (t: string) => (t.trim() || "Bloco").slice(0, MAX_ROTULO);
const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const NOMES_DE_VARIAVEL: Record<string, string> = {
  last_user_message: "ultima_mensagem",
  last_message: "ultima_mensagem",
  "customer.name": "nome",
  "customer.nome": "nome",
  name: "nome",
  "customer.first_name": "primeiro_nome",
  first_name: "primeiro_nome",
  "customer.phone": "telefone",
  "customer.phone_number": "telefone",
  phone: "telefone",
};

/** `{{x}}` / `{x}` do Leona → `{x}` dos Fluxos, com os nomes traduzidos. */
export function converterVariaveis(texto: string): string {
  return texto.replace(/\{\{?\s*([a-zA-Z_][\w.]*)\s*\}?\}/g, (_, nome: string) => {
    const mapeado = NOMES_DE_VARIAVEL[nome] ?? (nome.startsWith("customer.") ? nome.slice("customer.".length) : nome);
    return `{${mapeado}}`;
  });
}

/** Chave de campo da ficha no formato dos Fluxos (`^[a-z][a-z0-9_.]*$`). */
export function chaveDeCampo(nome: string): string | null {
  const limpa = normalizar(nome)
    .replace(/[^a-z0-9_.]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 60);
  return limpa || null;
}

function idDeSaida(bruto: string, usados: Set<string>): string {
  let base = bruto.replace(/[^\w-]/g, "_").slice(0, 36) || "saida";
  if (base === "falha" || base === "else") base = `${base}_1`;
  let id = base;
  for (let i = 2; usados.has(id); i++) id = `${base}_${i}`;
  usados.add(id);
  return id;
}

function acoesEmOrdem(acoes: z.infer<typeof acaoSchema>[] | null | undefined) {
  return [...(acoes ?? [])].sort((a, b) => num(a.order, 0) - num(b.order, 0)).map((a) => ({ tipo: a.action_type, cfg: (a.config ?? {}) as Cfg }));
}

const TIPO_DE_MIDIA: Record<string, "imagem" | "video" | "audio" | "arquivo"> = {
  image: "imagem",
  video: "video",
  audio: "audio",
  document: "arquivo",
  file: "arquivo",
};

function urlDaMidia(cfg: Cfg): { url: string; nome: string | null; mime: string | null } | null {
  const info = (cfg.media_file_info ?? {}) as Cfg;
  const url = str(info.direct_url) || str(info.url) || str(cfg.media_url) || str(cfg.file_url) || str(cfg.url);
  if (!url) return null;
  return { url, nome: str(info.filename) || str(cfg.filename) || null, mime: str(info.content_type) || null };
}

export function converterFluxoDoLeona(entrada: unknown, ctx: ContextoDaImportacao): ResultadoDaImportacao | { erro: string } {
  const lido = fluxoDoLeonaSchema.safeParse(entrada);
  if (!lido.success) return { erro: "Isto não parece um fluxo exportado do Leona (faltam os blocos)." };
  const leona = lido.data;
  const avisos: string[] = [];
  const midias: MidiaParaCopiar[] = [];
  const nos: NoNosso[] = [];
  /** Como cada conexão que SAI de um nó do Leona vira condição de aresta aqui. */
  const ramoDe = new Map<string, (c: Cfg, tipo: string) => Ramo>();
  const semSaida = new Set<string>();
  const avisar = (bloco: string, texto: string) => avisos.push(`"${bloco}": ${texto}`);
  let temInicio = false;

  const conexoes =
    leona.connections && leona.connections.length > 0
      ? leona.connections
      : leona.nodes.flatMap((n) => (n.connections ?? []).map((c) => ({ ...c, from_node_id: c.from_node_id ?? n.id })));
  const inicio = leona.nodes.find((n) => n.node_type === "start");
  if (!inicio) return { erro: "O fluxo do Leona não tem bloco de Início." };
  const alcancados = new Set<string>([inicio.id]);
  for (let fila = [inicio.id]; fila.length > 0; ) {
    const de = fila.pop()!;
    for (const c of conexoes)
      if (String(c.from_node_id) === de && !alcancados.has(c.to_node_id)) {
        alcancados.add(c.to_node_id);
        fila.push(c.to_node_id);
      }
  }
  const soltos = leona.nodes.filter((n) => !alcancados.has(n.id));
  if (soltos.length > 0)
    avisos.push(`${soltos.length} bloco(s) solto(s) no Leona — sem ligação a partir do Início, nunca rodavam lá — não foram importados.`);

  for (const n of leona.nodes) {
    if (!alcancados.has(n.id)) continue;
    const id = `l${n.id}`;
    const nome = (n.name ?? "").trim();
    const posicao = { x: num(n.position?.x, 0), y: num(n.position?.y, 0) };
    const acoes = acoesEmOrdem(n.actions);
    const sempre: (c: Cfg, t: string) => Ramo = () => ({ type: "always" });
    const add = (type: string, label: string, config: unknown, ramo = sempre) => {
      nos.push({ id, type, label: rotulo(label), position: posicao, config });
      ramoDe.set(id, ramo);
    };

    switch (n.node_type) {
      case "start":
        if (temInicio) {
          avisar(nome || "Início", "fluxo com dois Inícios — o segundo virou Fim.");
          add("end", "⚠ Início repetido", { outcome: "exhausted" });
          semSaida.add(id);
          break;
        }
        temInicio = true;
        add("trigger", "Início", {});
        break;

      case "message":
      case "pix": {
        const itens: unknown[] = [];
        let seq = 0;
        const novoId = () => `i${++seq}`;
        for (const { tipo, cfg } of acoes) {
          if (tipo === "send_message") {
            const atraso = num(cfg.typing_delay_seconds, 0);
            if (atraso > 0) itens.push({ id: novoId(), tipo: "intervalo", modo: "fixo", segundos: limitar(atraso, 1, 300) });
            const texto = converterVariaveis(str(cfg.message_text) || str(cfg.message) || str(cfg.text)).trim();
            if (texto) itens.push({ id: novoId(), tipo: "texto", texto: texto.slice(0, 4000) });
          } else if (tipo === "send_multi_media" || tipo === "send_file") {
            const midia = urlDaMidia(cfg);
            const tipoDoItem = tipo === "send_file" ? "arquivo" : TIPO_DE_MIDIA[str(cfg.media_type)] ?? "arquivo";
            if (!midia || !/^https:\/\//.test(midia.url)) {
              avisar(nome || "Mensagem", `uma mídia sem link https foi deixada de fora.`);
              continue;
            }
            const itemId = novoId();
            const legenda = converterVariaveis(str(cfg.caption)).trim();
            itens.push({
              id: itemId,
              tipo: tipoDoItem,
              midia: { url: midia.url, ...(midia.nome ? { nome_arquivo: midia.nome.slice(0, 200) } : {}), ...(midia.mime ? { mime: midia.mime } : {}) },
              ...(legenda && (tipoDoItem === "imagem" || tipoDoItem === "video") ? { legenda: legenda.slice(0, 1000) } : {}),
            });
            midias.push({ noId: id, itemId, origem: midia.url, nome: midia.nome, mime: midia.mime });
          } else if (tipo === "send_sticker") {
            const origem = str(cfg.sticker_url) || str(cfg.url);
            if (!/^(https:\/\/|data:image\/)/.test(origem)) {
              avisar(nome || "Mensagem", "uma figurinha sem arquivo foi deixada de fora.");
              continue;
            }
            const itemId = novoId();
            itens.push({ id: itemId, tipo: "sticker", midia: { url: origem.startsWith("data:") ? `${URL_PROVISORIA}${id}/${itemId}` : origem } });
            midias.push({ noId: id, itemId, origem, nome: null, mime: origem.startsWith("data:") ? origem.slice(5, origem.indexOf(";")) : null });
          } else if (tipo === "delay_between_messages") {
            const max = num(cfg.delay_max_seconds, 0);
            const min = num(cfg.delay_min_seconds, 0);
            const fixo = num(cfg.delay_seconds, 0);
            if (max > 0) {
              const a = limitar(Math.max(1, min), 1, 300);
              itens.push({ id: novoId(), tipo: "intervalo", modo: "aleatorio", min_segundos: a, max_segundos: limitar(Math.max(a, max), a, 300) });
            } else if (fixo > 0) itens.push({ id: novoId(), tipo: "intervalo", modo: "fixo", segundos: limitar(fixo, 1, 300) });
          } else if (tipo === "send_contact") {
            const telefone = (str(cfg.contact_phone) || str(cfg.phone) || str(cfg.phone_number)).replace(/\D/g, "");
            const quem = str(cfg.contact_name) || str(cfg.name);
            if (quem && telefone.length >= 8) itens.push({ id: novoId(), tipo: "contato", nome: quem.slice(0, 120), telefone: telefone.slice(0, 15) });
            else avisar(nome || "Mensagem", "um contato compartilhado sem nome ou telefone foi deixado de fora.");
          } else if (tipo === "send_pix_button") {
            const chave = str(cfg.pix_key);
            const quem = str(cfg.merchant_name);
            const valor = str(cfg.amount);
            itens.push({ id: novoId(), tipo: "texto", texto: [`Chave PIX: ${chave}`, quem, valor ? `Valor: ${valor}` : ""].filter(Boolean).join("\n") });
            avisar(nome || "PIX", "o botão PIX virou uma mensagem de texto com a chave.");
          } else {
            avisar(nome || "Mensagem", `a ação "${tipo}" não existe aqui e foi deixada de fora.`);
          }
        }
        if (itens.length > 30) {
          avisar(nome || "Mensagem", `tinha ${itens.length} itens; ficaram os 30 primeiros.`);
          itens.length = 30;
        }
        if (itens.length === 0) {
          avisar(nome || "Mensagem", "bloco vazio — ficou um texto para você completar.");
          itens.push({ id: "i1", tipo: "texto", texto: "(complete esta mensagem)" });
        }
        add("mensagem", nome || "Mensagem", { itens });
        break;
      }

      case "wait_response": {
        const pergunta: string[] = [];
        let espera: Cfg = {};
        let salvar: string | null = null;
        for (const { tipo, cfg } of acoes) {
          if (tipo === "send_message") pergunta.push(converterVariaveis(str(cfg.message_text)).trim());
          else if (tipo === "wait_for_response") espera = cfg;
          else if (tipo === "save_user_data") salvar = chaveDeCampo(str(cfg.field_name));
        }
        const semLimite = espera.wait_indefinitely === true;
        const unidade = ({ minutes: "minutos", hours: "horas", days: "dias" } as Record<string, string>)[str(espera.timeout_unit)] ?? "dias";
        let valor = limitar(num(espera.timeout_value, 1), 1, 1_000_000);
        const emMin = valor * (unidade === "dias" ? 1440 : unidade === "horas" ? 60 : 1);
        if (!semLimite && emMin > 31 * 1440) {
          avisar(nome || "Aguardar resposta", "tempo máximo acima de 31 dias — ficou 31 dias.");
          valor = unidade === "dias" ? 31 : unidade === "horas" ? 744 : 44640;
        }
        const texto = pergunta.filter(Boolean).join("\n\n").slice(0, 4000);
        const config = {
          sem_limite: semLimite,
          ...(semLimite ? {} : { tempo: { valor, unidade } }),
          ...(espera.buffer_enabled === true ? { buffer: { ativo: true, segundos: limitar(num(espera.buffer_value, 10), 1, 120) } } : {}),
          responder_citando: espera.reply_to_lead_enabled === true,
          ...(espera.react_to_lead_check_enabled === true
            ? { reagir: { ativo: true, emoji: str(espera.react_to_lead_reaction_emoji).slice(0, 16) || "✅" } }
            : {}),
          ...(salvar ? { salvar_em: salvar } : {}),
          ...(texto ? { mensagem_antes: texto } : {}),
        };
        add("aguardar_resposta", nome || "Aguardar resposta", config, (c, t) => {
          const qual = str(c.response_type) || str(c.source_handle);
          if (qual === "timeout" || t === "timeout_or_unknown") return semLimite ? null : { type: "branch", branch_id: "sem_resposta" };
          return semLimite ? { type: "always" } : { type: "branch", branch_id: "respondeu" };
        });
        break;
      }

      case "condition": {
        const cfg = acoes.find((a) => a.tipo === "evaluate_condition")?.cfg ?? {};
        const OPERADOR: Record<string, string> = {
          equal: "igual",
          equals: "igual",
          not_equal: "diferente",
          contains: "contem",
          not_contains: "nao_contem",
          greater: "maior",
          greater_than: "maior",
          less: "menor",
          less_than: "menor",
          empty: "vazio",
          is_empty: "vazio",
          not_empty: "nao_vazio",
          is_not_empty: "nao_vazio",
        };
        const condicoes = (Array.isArray(cfg.conditions) ? (cfg.conditions as Cfg[]) : []).map((c, i) => {
          const categoria = str(c.category);
          const operador = OPERADOR[str(c.fieldOperator)] ?? "igual";
          if (!OPERADOR[str(c.fieldOperator)]) avisar(nome || "Condição", `operador "${str(c.fieldOperator)}" virou "igual" — confira.`);
          const campo =
            categoria === "tag" || categoria === "tags"
              ? { tipo: "etiqueta" }
              : { tipo: "campo_custom", chave: (str(c.fieldName) || categoria || "campo").slice(0, 60) };
          if (categoria !== "custom_field" && categoria !== "tag" && categoria !== "tags")
            avisar(nome || "Condição", `regra do tipo "${categoria}" virou comparação de campo — confira.`);
          const valor = converterVariaveis(str(c.fieldValue)).slice(0, 500);
          return {
            id: `c${i + 1}`,
            campo,
            operador,
            ...(operador === "vazio" || operador === "nao_vazio" ? {} : { valor }),
          };
        });
        if (condicoes.length === 0) {
          avisar(nome || "Condição", "sem regras — ficou uma regra para você completar.");
          condicoes.push({ id: "c1", campo: { tipo: "etiqueta" }, operador: "contem", valor: "" });
        }
        add("condicional", nome || "Condicional", { regra: str(cfg.ruleType) === "any" ? "qualquer" : "todas", condicoes: condicoes.slice(0, 20) }, (c) =>
          str(c.condition_result) === "failure" ? { type: "branch", branch_id: "nao" } : { type: "branch", branch_id: "sim" },
        );
        break;
      }

      case "distributor": {
        const cfg = acoes.find((a) => a.tipo === "distribute_contacts")?.cfg ?? {};
        const usados = new Set<string>();
        const porOrigem = new Map<string, string>();
        const saidas = (Array.isArray(cfg.outputs) ? (cfg.outputs as Cfg[]) : []).slice(0, 10).map((o, i) => {
          const sid = idDeSaida(str(o.id) || `s${i + 1}`, usados);
          porOrigem.set(str(o.id), sid);
          return { id: sid, nome: (str(o.name) || `Saída ${i + 1}`).slice(0, 40), peso: num(o.quantity, 1) };
        });
        while (saidas.length < 2) {
          const sid = idDeSaida(`s${saidas.length + 1}`, usados);
          saidas.push({ id: sid, nome: `Saída ${saidas.length + 1}`, peso: 1 });
          avisar(nome || "Distribuidor", "tinha menos de 2 saídas — foi criada uma para você ligar.");
        }
        if (new Set(saidas.map((s) => s.peso)).size > 1) avisar(nome || "Distribuidor", "as quantidades por saída foram ignoradas: aqui o rodízio é igual entre as saídas.");
        add(
          "distribuidor",
          nome || "Distribuidor",
          { modo: cfg.prevent_repeat === true ? "fixo_por_contato" : "proximo", saidas: saidas.map(({ id: sid, nome: snome }) => ({ id: sid, nome: snome })) },
          (c) => {
            const sid = porOrigem.get(str(c.output_id));
            return sid ? { type: "branch", branch_id: sid } : null;
          },
        );
        break;
      }

      case "connection_flow": {
        const cfg = acoes.find((a) => a.tipo === "execute_flow")?.cfg ?? {};
        const alvo = str(cfg.target_flow_name);
        const achado = ctx.fluxos.find((f) => normalizar(f.nome) === normalizar(alvo));
        if (!achado) avisar(nome || "Conexão de fluxo", `o fluxo "${alvo}" ainda não existe aqui — importe-o e escolha-o neste bloco.`);
        add("conexao_fluxo", nome || "Conexão de fluxo", { fluxo_id: achado?.id ?? UUID_VAZIO, retornar: false });
        semSaida.add(id);
        break;
      }

      case "kanban": {
        const acao = acoes.find((a) => a.tipo === "create_kanban_card" || a.tipo === "remove_kanban_card");
        const cfg = acao?.cfg ?? {};
        const funil = ctx.funis.find((f) => normalizar(f.nome) === normalizar(str(cfg.crm_name)));
        const etapa = funil?.etapas.find((e) => normalizar(e.nome) === normalizar(str(cfg.crm_column_name)));
        if (!funil) avisar(nome || "Kanban", `o funil "${str(cfg.crm_name).trim()}" não existe aqui — escolha o funil neste bloco.`);
        else if (!etapa && acao?.tipo !== "remove_kanban_card")
          avisar(nome || "Kanban", `a etapa "${str(cfg.crm_column_name)}" não existe no funil — o card entra na primeira etapa.`);
        const config =
          acao?.tipo === "remove_kanban_card"
            ? { acao: "remover", pipeline_id: funil?.id ?? UUID_VAZIO }
            : { acao: "adicionar", pipeline_id: funil?.id ?? UUID_VAZIO, ...(etapa ? { stage_id: etapa.id } : {}) };
        add("kanban", nome || "Kanban", config);
        break;
      }

      case "notification": {
        const cfg = acoes.find((a) => a.tipo === "send_notification")?.cfg ?? {};
        const ddi = str(cfg.country_code).replace(/\D/g, "").slice(0, 4) || "55";
        let numero = str(cfg.phone).replace(/\D/g, "");
        if (numero.startsWith(ddi) && numero.length > 11) numero = numero.slice(ddi.length);
        if (numero.length < 8 || numero.length > 13) {
          avisar(nome || "Notificação", "número de quem recebe inválido — confira.");
          numero = "11999999999";
        }
        add("notificacao", nome || "Notificação", {
          nome: (str(cfg.name) || "Equipe").slice(0, 80),
          ddi,
          numero,
          mensagem: converterVariaveis(str(cfg.message)).trim().slice(0, 4000) || "{nome} precisa de atenção.",
        });
        break;
      }

      case "tags": {
        const acao = acoes.find((a) => a.tipo === "add_tags" || a.tipo === "remove_tags");
        const cfg = acao?.cfg ?? {};
        const etiquetas = (Array.isArray(cfg.tags) ? cfg.tags : []).map((t) => str(typeof t === "object" && t ? (t as Cfg).name : t).trim().slice(0, 40)).filter(Boolean);
        if (etiquetas.length === 0) {
          avisar(nome || "Etiquetas", "sem etiquetas — ficou uma para você trocar.");
          etiquetas.push("nova_etiqueta");
        }
        const remover = acao?.tipo === "remove_tags" || str(cfg.action) === "remove";
        add("etiquetas", nome || "Etiquetas", { operacao: remover ? "remover" : "adicionar", etiquetas: etiquetas.slice(0, 20) });
        break;
      }

      case "pixel": {
        const cfg = acoes.find((a) => a.tipo === "send_pixel_event")?.cfg ?? {};
        const evento = str(cfg.event_type) === "Compra" || str(cfg.event_type) === "Purchase" ? "Purchase" : "Lead";
        const valor = converterVariaveis(str(cfg.item_value)).trim();
        if (evento === "Purchase" && !valor) avisar(nome || "Pixel", "Compra sem valor — preencha o valor.");
        const moeda = /^[A-Z]{3}$/.test(str(cfg.currency).toUpperCase()) ? str(cfg.currency).toUpperCase() : "BRL";
        add("pixel", nome || "Pixel", {
          evento,
          moeda,
          ...(valor ? { valor: valor.slice(0, 200) } : evento === "Purchase" ? { valor: "0" } : {}),
          ...(str(cfg.page_id).trim() ? { page_id: converterVariaveis(str(cfg.page_id)).trim().slice(0, 200) } : {}),
        });
        break;
      }

      case "ai": {
        const cfg = acoes.find((a) => a.tipo === "ai_call")?.cfg ?? {};
        if (str(cfg.api_key)) avisar(nome || "Bloco de IA", "a chave de API do Leona NÃO foi importada — cadastre a chave em IA › Credenciais.");
        if (cfg.understand_receipt === true) avisar(nome || "Bloco de IA", "a leitura de comprovante não existe aqui — revise as instruções.");
        const provedor = ({ gpt: "openai", openai: "openai", gemini: "google", google: "google", anthropic: "anthropic", claude: "anthropic" } as Record<string, string>)[str(cfg.provider)] ?? "openai";
        const prompt = converterVariaveis(str(cfg.system_prompt));
        if (prompt.length > 8000) avisar(nome || "Bloco de IA", "as instruções passavam de 8000 caracteres e foram cortadas.");
        const usados = new Set<string>();
        const porChave = new Map<string, string>();
        const condicionais = (Array.isArray(cfg.output_conditions) ? (cfg.output_conditions as Cfg[]) : []).slice(0, 10).map((o) => {
          const chave = str(o.output_key);
          const cid = idDeSaida(chave || "rota", usados);
          porChave.set(chave, cid);
          return { id: cid, nome: (chave || cid).slice(0, 60), descricao: (str(o.prompt) || chave || cid).slice(0, 500) };
        });
        const fallback = str(cfg.fallback_output_key);
        add(
          "bloco_ia",
          nome || "Bloco de IA",
          {
            provedor,
            modelo: (str(cfg.model) || "gpt-5.4-mini").slice(0, 120),
            mensagem: converterVariaveis(str(cfg.user_message)).trim().slice(0, 4000) || "{ultima_mensagem}",
            salvar_em: chaveDeCampo(str(cfg.response_variable) || "ai.response") ?? "ai.response",
            enviar_resposta: cfg.auto_send_response !== false,
            prompt: prompt.slice(0, 8000),
            entender: { audio: cfg.understand_audio === true, imagem: cfg.understand_image === true, pdf: cfg.understand_pdf === true },
            condicionais,
            contexto: { ativo: cfg.maintain_context === true, interacoes: limitar(num(cfg.context_interactions, 5), 1, 20) },
          },
          (c) => {
            if (str(c.condition_result) === "failure") return { type: "branch", branch_id: "falha" };
            const chave = str(c.output_key);
            if (chave && chave !== fallback && porChave.has(chave)) return { type: "branch", branch_id: porChave.get(chave)! };
            return { type: "always" };
          },
        );
        break;
      }

      case "smart_interval": {
        const cfg = acoes.find((a) => a.tipo === "smart_interval")?.cfg ?? {};
        const modo = str(cfg.schedule_type);
        let config: unknown;
        if (modo === "date" && str(cfg.scheduled_date)) config = { modo: "data", quando: converterVariaveis(str(cfg.scheduled_date)).slice(0, 200) };
        else if (modo === "weekly" && cfg.weekly_schedule && typeof cfg.weekly_schedule === "object") {
          const DIAS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
          const sem = cfg.weekly_schedule as Record<string, Cfg>;
          const janelas = DIAS.flatMap((d, dia) => {
            const j = sem[d];
            const ok = j && j.enabled === true && /^\d{2}:\d{2}$/.test(str(j.start_time)) && /^\d{2}:\d{2}$/.test(str(j.end_time));
            return ok ? [{ dia, inicio: str(j.start_time), fim: str(j.end_time) }] : [];
          });
          config = janelas.length > 0 ? { modo: "horarios", janelas } : { modo: "duracao", valor: 1, unidade: "minutos" };
          if (janelas.length === 0) avisar(nome || "Intervalo", "agenda semanal sem dias ligados — ficou 1 minuto.");
        } else {
          const unidade = ({ minutes: "minutos", hours: "horas", days: "dias", seconds: "segundos" } as Record<string, string>)[str(cfg.interval_unit)] ?? "minutos";
          const max = { segundos: 31 * 86400, minutos: 31 * 1440, horas: 31 * 24, dias: 31 }[unidade as "segundos"]!;
          config = { modo: "duracao", valor: limitar(num(cfg.interval_value, 1), 1, max), unidade };
        }
        add("intervalo", nome || "Intervalo inteligente", config);
        break;
      }

      default: {
        avisar(nome || n.node_type, `o bloco "${n.node_type}" não existe aqui — virou um Fim marcado com ⚠. Refaça-o antes de publicar.`);
        add("end", `⚠ ${nome || n.node_type}`, { outcome: "exhausted" });
        semSaida.add(id);
      }
    }
  }

  // ── Ligações ───────────────────────────────────────────────────────────
  const ids = new Set(nos.map((n) => n.id));
  const edges: FlowEdge[] = [];
  const vistas = new Set<string>();
  let descartadas = 0;
  for (const c of conexoes) {
    const source = `l${c.from_node_id}`;
    const target = `l${c.to_node_id}`;
    if (!ids.has(source) || !ids.has(target)) continue;
    if (semSaida.has(source)) {
      descartadas++;
      continue;
    }
    const ramo = ramoDe.get(source)?.((c.condition_config ?? {}) as Cfg, c.condition_type ?? "always") ?? null;
    if (!ramo) {
      descartadas++;
      continue;
    }
    const chave = `${source}|${ramo.type === "branch" ? ramo.branch_id : "always"}`;
    if (vistas.has(chave)) {
      descartadas++;
      continue;
    }
    vistas.add(chave);
    edges.push({ id: `e${edges.length + 1}`, source, target, priority: 0, condition: ramo } as FlowEdge);
  }
  if (descartadas > 0) avisos.push(`${descartadas} ligação(ões) sem equivalente aqui foram descartadas (saída repetida ou de bloco que virou Fim).`);

  // ── Saídas soltas ganham um Fim (no Leona, acabar ali é o fim do fluxo) ──
  const faltando: Array<{ no: NoNosso; ramo: Exclude<Ramo, null>; i: number }> = [];
  for (const no of nos) {
    if (no.type === "end") continue;
    const saem = edges.filter((e) => e.source === no.id);
    nodeBranches(no as unknown as BranchableNode).forEach((b, i) => {
      const ligado = saem.some((e) =>
        b.kind === "fallback" ? e.condition.type === "always" : e.condition.type === "branch" && e.condition.branch_id === b.id,
      );
      if (!ligado) faltando.push({ no, ramo: b.kind === "fallback" ? { type: "always" } : { type: "branch", branch_id: b.id }, i });
    });
  }
  // Um Fim por saída deixa o desenho legível; perto do teto do grafo, um só para todos.
  const umSo = nos.length + faltando.length > MAX_NOS_DO_GRAFO;
  if (umSo && faltando.length > 0)
    nos.push({ id: "fim", type: "end", label: "Fim do fluxo", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } });
  faltando.forEach(({ no, ramo, i }, k) => {
    const alvo = umSo ? "fim" : `fim${k + 1}`;
    if (!umSo)
      nos.push({ id: alvo, type: "end", label: "Fim do fluxo", position: { x: no.position.x + 320, y: no.position.y + i * 90 }, config: { outcome: "exhausted" } });
    edges.push({ id: `e${edges.length + 1}`, source: no.id, target: alvo, priority: 0, condition: ramo } as FlowEdge);
  });

  const nome = (leona.flow?.name ?? "").trim().slice(0, 80) || "Fluxo importado do Leona";
  return { nome, grafo: { nodes: nos, edges } as unknown as FlowGraph, avisos, midias };
}
