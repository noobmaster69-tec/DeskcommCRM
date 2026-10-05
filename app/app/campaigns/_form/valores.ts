import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";

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
  funilDoPublico: string;
  etapaDoPublico: string;
  texto: string;
  /** Item 4: "text" manda a mensagem; "flow" inicia o fluxo `fluxo`. */
  modo: "text" | "flow";
  fluxo: string;
  funil: string;
  etapa: string;
  agente: string;
  intervalo: string;
  janelaInicio: string;
  janelaFim: string;
  tetoDiario: string;
  tetoHorario: string;
}

const juntar = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(", ") : "");
const num = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const primeiro = (v: unknown): string => (Array.isArray(v) && v.length > 0 ? String(v[0]) : "");

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
    comAlgumaTag: juntar(f.com_alguma_tag),
    semTags: juntar(f.sem_tags),
    semInteracao: num(f.sem_interacao_ha_dias),
    limite: f.limite == null ? "100" : String(f.limite),
    funilDoPublico: primeiro(f.funis),
    etapaDoPublico: primeiro(f.etapas),
    texto: c?.message_body ?? "",
    modo: c?.mode === "flow" ? "flow" : "text",
    fluxo: c?.flow_id ?? "",
    funil: c?.pipeline_id ?? "",
    etapa: c?.stage_id ?? "",
    agente: c?.agent_id ?? "",
    intervalo: num(c?.intervalo_segundos),
    janelaInicio: num(c?.janela_inicio_hora),
    janelaFim: num(c?.janela_fim_hora),
    tetoDiario: num(c?.teto_diario),
    tetoHorario: num(c?.teto_horario),
  };
}

/** O filtro do público, no formato de `filtroDeAudienciaSchema`. */
export function filtroDoFormulario(v: ValoresDaCampanha) {
  return {
    com_alguma_tag: listar(v.comAlgumaTag),
    sem_tags: listar(v.semTags),
    sem_interacao_ha_dias: v.semInteracao ? Number(v.semInteracao) : null,
    funis: v.funilDoPublico ? [v.funilDoPublico] : [],
    etapas: v.etapaDoPublico ? [v.etapaDoPublico] : [],
    limite: Number(v.limite) || 100,
  };
}

export function temCriterio(v: ValoresDaCampanha): boolean {
  const f = filtroDoFormulario(v);
  return (
    f.com_alguma_tag.length > 0 ||
    f.sem_tags.length > 0 ||
    f.funis.length > 0 ||
    f.etapas.length > 0 ||
    f.sem_interacao_ha_dias !== null
  );
}

export function podeSalvar(v: ValoresDaCampanha): boolean {
  return (
    v.nome.trim() !== "" &&
    v.canal !== "" &&
    (v.modo === "flow" ? v.fluxo !== "" : v.texto.trim() !== "") &&
    temCriterio(v) &&
    (v.baseLegal !== "legitimate_interest" || v.liaRef.trim() !== "")
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
    channel_session_ids: v.extras.filter((id) => id !== v.canal),
    pipeline_id: v.funil || null,
    stage_id: v.etapa || null,
    agent_id: v.agente || null,
  };
}
