/**
 * Leitura e formato compartilhados pelas rotas de CRM (`/api/v1/crms/**`).
 *
 * Um arquivo só pelo mesmo motivo de `pipelines/_funis.ts`: todas as rotas
 * precisam do MESMO recorte — os CRMs da organização INTEIROS, arquivados
 * incluídos, porque o slug de um arquivado continua ocupado
 * (`uniq_crm_crms_org_slug` não é parcial).
 *
 * O filtro explícito de `organization_id` é a convenção do repo, e aqui não é
 * redundante: a policy `crm_crms_select` libera TODAS as organizações do
 * usuário (e tudo para o platform admin). A RLS responde "pode ver?"; a rota
 * responde "é da organização ativa?".
 */
import { fail } from "@/lib/api/wrappers";
import { iniciaisDoCrm, type CrmEditavel } from "@/lib/crms/crms";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const COLUNAS = "id, name, slug, description, is_default, avatar_bg_color, archived_at, created_at, updated_at";

export interface LinhaDeCrm extends CrmEditavel {
  description: string | null;
  avatar_bg_color: string | null;
  created_at: string;
  updated_at: string;
}

/** O CRM como a API devolve: a linha + iniciais + métricas dos funis vivos. */
export interface CrmDaApi {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
  avatar_bg_color: string | null;
  initials: string;
  leads_count: number;
  funis_count: number;
  /** MAX(crm_leads.updated_at) nos funis vivos; `null` = nenhum negócio ainda. */
  last_updated_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LinhaDeMetrica {
  id: string;
  leads_count: number | string;
  funis_count: number | string;
  last_updated_at: string | null;
}

/** Os CRMs da organização, arquivados inclusive, padrão primeiro e por nome. */
export async function lerCrms(supabase: Supabase, orgId: string): Promise<LinhaDeCrm[]> {
  const { data, error } = await supabase
    .from("crm_crms")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LinhaDeCrm[];
}

/**
 * As métricas dos CRMs vivos, numa consulta só (`fn_crms_com_metricas`,
 * security invoker — a RLS de crm_leads vale para quem chama).
 *
 * `bigint` chega do PostgREST como número ou texto conforme o tamanho; o
 * `Number()` aqui é o que impede a tela de mostrar "12" + "3" = "123".
 */
export async function lerMetricas(
  supabase: Supabase,
  orgId: string,
): Promise<Map<string, Pick<CrmDaApi, "leads_count" | "funis_count" | "last_updated_at">>> {
  const { data, error } = await supabase.rpc("fn_crms_com_metricas", { p_org: orgId });
  if (error) throw new Error(error.message);
  const mapa = new Map<string, Pick<CrmDaApi, "leads_count" | "funis_count" | "last_updated_at">>();
  for (const m of (data ?? []) as LinhaDeMetrica[]) {
    mapa.set(m.id, {
      leads_count: Number(m.leads_count),
      funis_count: Number(m.funis_count),
      last_updated_at: m.last_updated_at,
    });
  }
  return mapa;
}

/** Junta a linha às métricas. CRM arquivado não tem métrica: zero, não ausência. */
export function crmDaApi(
  linha: LinhaDeCrm,
  metricas?: Pick<CrmDaApi, "leads_count" | "funis_count" | "last_updated_at">,
): CrmDaApi {
  return {
    id: linha.id,
    name: linha.name,
    slug: linha.slug,
    description: linha.description,
    is_default: linha.is_default,
    avatar_bg_color: linha.avatar_bg_color,
    initials: iniciaisDoCrm(linha.name),
    leads_count: metricas?.leads_count ?? 0,
    funis_count: metricas?.funis_count ?? 0,
    last_updated_at: metricas?.last_updated_at ?? null,
    archived_at: linha.archived_at,
    created_at: linha.created_at,
    updated_at: linha.updated_at,
  };
}

/** Quantos funis VIVOS o CRM tem — o que barra o arquivamento. */
export async function contarFunisVivos(
  supabase: Supabase,
  orgId: string,
  crmId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("crm_pipelines")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("crm_id", crmId)
    .eq("is_archived", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * 23505 vira 409 com frase: as regras de `lib/crms` validam ANTES, e o índice
 * único só pega a corrida entre duas abas — o erro cru falaria de índice.
 */
export function conflitoDoBanco(
  erro: { code?: string } | null | undefined,
  nomeDoCrm: string,
  requestId: string,
) {
  if (erro?.code !== "23505") return null;
  return fail(
    "state_conflict",
    `«${nomeDoCrm}» mudou enquanto você editava — outro CRM já ocupa esse nome, esse endereço ou o lugar de padrão. ` +
      `Recarregue a página e tente de novo.`,
    409,
    { requestId },
  );
}
