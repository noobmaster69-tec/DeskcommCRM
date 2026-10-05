import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";
import { errosDoRitmo } from "@/components/campanhas/CamposDeRitmo";
import type { ResumoDaLista } from "@/components/campanhas/ImportarLista";

/** Item 1: de onde vem o público. A consulta avançada ficou de fora (RESUMO.md). */
export type FonteDoPublico = "crm" | "etiqueta" | "importacao";
export type OperadorDeCampo = "igual" | "contem" | "preenchido" | "vazio";
export interface CondicaoDeCampo {
  chave: string;
  operador: OperadorDeCampo;
  valor: string;
}

/**
 * O que o formulário de campanha edita — UM formato para criar e editar (fork
 * jhoow). Antes eram dois formulários escritos à mão: o de editar não carregava
 * nem salvava o funil/etapa do público, o ritmo e os números do rodízio — salvar
 * um rascunho editado APAGAVA esses filtros.
 */
export interface ValoresDaCampanha {
  nome: string;
  canal: string;
  extras: string[];
  baseLegal: "consent" | "legitimate_interest";
  liaRef: string;
  comAlgumaTag: string;
  semTags: string;
  semInteracao: string;
  limite: string;
  /** Item 1: o modo da fonte e o que cada modo usa. */
  fonte: FonteDoPublico;
  /** Só recorta a lista de funis na tela; não vai para o filtro. */
  crmDoPublico: string;
  funilDoPublico: string;
  etapasDoPublico: string[];
  /** Data de entrada do negócio (AAAA-MM-DD). */
  entrouDe: string;
  entrouAte: string;
  campos: CondicaoDeCampo[];
  /** Modo etiqueta: "todas" exige todas as etiquetas; "alguma", qualquer uma. */
  todasAsTags: boolean;
  listaImportada: string;
  /** Só da tela: as contagens da importação que acabou de rodar. */
  resumoDaLista: ResumoDaLista | null;
  texto: string;
  /** Item 4: "text" manda a mensagem; "flow" inicia o fluxo `fluxo`. */
  modo: "text" | "flow";
  fluxo: string;
  funil: string;
  etapa: string;
  /** Item 3: funil/etapa onde o contato entra ao RECEBER. */
  funilDeQuemRecebe: string;
  etapaDeQuemRecebe: string;
  agente: string;
  intervalo: string;
  /** Item 7: intervalo sorteado entre mínimo e máximo, e o fuso da janela ("" = o do número). */
  minIntervalo: string;
  maxIntervalo: string;
  fuso: string;
  janelaInicio: string;
  janelaFim: string;
  tetoDiario: string;
  tetoHorario: string;
}

const juntar = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(", ") : "");
const num = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const primeiro = (v: unknown): string => (Array.isArray(v) && v.length > 0 ? String(v[0]) : "");
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const dia = (v: unknown): string => (typeof v === "string" ? v.slice(0, 10) : "");

/** A fonte de uma campanha antiga (sem `fonte` gravada) sai do que o filtro usa. */
function fonteDoFiltro(f: Record<string, unknown>): FonteDoPublico {
  if (f.fonte === "importacao" || f.lista_importada) return "importacao";
  if (f.fonte === "etiqueta" || f.fonte === "crm") return f.fonte;
  const usaFunil = lista(f.funis).length > 0 || lista(f.etapas).length > 0 || !!f.entrou_de || !!f.entrou_ate;
  const usaTag = lista(f.com_alguma_tag).length > 0 || lista(f.com_todas_tags).length > 0;
  return !usaFunil && usaTag ? "etiqueta" : "crm";
}

export function listar(bruto: string): string[] {
  return bruto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Os valores iniciais: vazios (nova) ou os da campanha (editar). */
export function valoresDaCampanha(c?: CampanhaDetalhada | null): ValoresDaCampanha {
  const f = (c?.audience_filter ?? {}) as Record<string, unknown>;
  return {
    nome: c?.name ?? "",
    canal: c?.channel_session_id ?? "",
    extras: c?.channel_session_ids ?? [],
    baseLegal: c?.base_legal === "legitimate_interest" ? "legitimate_interest" : "consent",
    liaRef: c?.lia_ref ?? "",
    comAlgumaTag: juntar(lista(f.com_todas_tags).length > 0 ? f.com_todas_tags : f.com_alguma_tag),
    semTags: juntar(f.sem_tags),
    semInteracao: num(f.sem_interacao_ha_dias),
    limite: f.limite == null ? "100" : String(f.limite),
    fonte: fonteDoFiltro(f),
    crmDoPublico: "",
    funilDoPublico: primeiro(f.funis),
    etapasDoPublico: lista(f.etapas),
    entrouDe: dia(f.entrou_de),
    entrouAte: dia(f.entrou_ate),
    campos: Array.isArray(f.campos) ? (f.campos as CondicaoDeCampo[]) : [],
    todasAsTags: lista(f.com_todas_tags).length > 0,
    listaImportada: typeof f.lista_importada === "string" ? f.lista_importada : "",
    resumoDaLista: null,
    texto: c?.message_body ?? "",
    modo: c?.mode === "flow" ? "flow" : "text",
    fluxo: c?.flow_id ?? "",
    funil: c?.pipeline_id ?? "",
    etapa: c?.stage_id ?? "",
    agente: c?.agent_id ?? "",
    funilDeQuemRecebe: c?.recipients_pipeline_id ?? "",
    etapaDeQuemRecebe: c?.recipients_stage_id ?? "",
    intervalo: num(c?.intervalo_segundos),
    minIntervalo: String(c?.min_interval_seconds ?? 60),
    maxIntervalo: String(c?.max_interval_seconds ?? 180),
    fuso: c?.timezone ?? "",
    janelaInicio: num(c?.janela_inicio_hora),
    janelaFim: num(c?.janela_fim_hora),
    tetoDiario: num(c?.teto_diario),
    tetoHorario: num(c?.teto_horario),
  };
}

/** O filtro do público, no formato de `filtroDeAudienciaSchema` — só o que o modo usa. */
export function filtroDoFormulario(v: ValoresDaCampanha) {
  const limite = Number(v.limite) || 100;
  if (v.fonte === "importacao") {
    return { fonte: "importacao" as const, lista_importada: v.listaImportada || null, limite };
  }
  const tags = listar(v.comAlgumaTag);
  const silencio = v.semInteracao ? Number(v.semInteracao) : null;
  if (v.fonte === "etiqueta") {
    return {
      fonte: "etiqueta" as const,
      com_alguma_tag: v.todasAsTags ? [] : tags,
      com_todas_tags: v.todasAsTags ? tags : [],
      sem_tags: listar(v.semTags),
      sem_interacao_ha_dias: silencio,
      limite,
    };
  }
  return {
    fonte: "crm" as const,
    com_alguma_tag: tags,
    sem_tags: listar(v.semTags),
    sem_interacao_ha_dias: silencio,
    funis: v.funilDoPublico ? [v.funilDoPublico] : [],
    etapas: v.funilDoPublico ? v.etapasDoPublico : [],
    entrou_de: v.entrouDe ? `${v.entrouDe}T00:00:00.000Z` : null,
    entrou_ate: v.entrouAte ? `${v.entrouAte}T23:59:59.999Z` : null,
    campos: v.campos
      .filter((c) => c.chave && (c.operador === "preenchido" || c.operador === "vazio" || c.valor.trim()))
      .map((c) => ({ chave: c.chave, operador: c.operador, valor: c.valor.trim() })),
    limite,
  };
}

export function temCriterio(v: ValoresDaCampanha): boolean {
  const f = filtroDoFormulario(v) as Record<string, unknown>;
  return Object.entries(f).some(
    ([k, x]) => k !== "fonte" && k !== "limite" && (Array.isArray(x) ? x.length > 0 : x !== null && x !== undefined),
  );
}

export function podeSalvar(v: ValoresDaCampanha): boolean {
  return (
    v.nome.trim() !== "" &&
    v.canal !== "" &&
    (v.modo === "flow" ? v.fluxo !== "" : v.texto.trim() !== "") &&
    temCriterio(v) &&
    (v.baseLegal !== "legitimate_interest" || v.liaRef.trim() !== "") &&
    errosDoRitmo(v).length === 0
  );
}

const ouNulo = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** O corpo do POST/PATCH — o MESMO para criar e editar. */
export function corpoDaCampanha(v: ValoresDaCampanha): Record<string, unknown> {
  return {
    name: v.nome.trim(),
    channel_session_id: v.canal,
    message_body: v.modo === "flow" ? v.texto.trim() || null : v.texto.trim(),
    mode: v.modo,
    flow_id: v.modo === "flow" ? v.fluxo || null : null,
    base_legal: v.baseLegal,
    lia_ref: v.liaRef.trim() || null,
    audience_filter: filtroDoFormulario(v),
    intervalo_segundos: ouNulo(v.intervalo),
    janela_inicio_hora: ouNulo(v.janelaInicio),
    janela_fim_hora: ouNulo(v.janelaFim),
    teto_diario: ouNulo(v.tetoDiario),
    teto_horario: ouNulo(v.tetoHorario),
    min_interval_seconds: Number(v.minIntervalo) || 60,
    max_interval_seconds: Number(v.maxIntervalo) || 180,
    timezone: v.fuso || null,
    channel_session_ids: v.extras.filter((id) => id !== v.canal),
    pipeline_id: v.funil || null,
    stage_id: v.etapa || null,
    agent_id: v.agente || null,
    recipients_pipeline_id: v.funilDeQuemRecebe || null,
    recipients_stage_id: v.funilDeQuemRecebe ? v.etapaDeQuemRecebe || null : null,
  };
}
