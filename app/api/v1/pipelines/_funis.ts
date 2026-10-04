/**
 * Leitura compartilhada pelas rotas de funil (criar, editar, arquivar/excluir).
 *
 * Existe como arquivo único porque as três precisam do MESMO recorte: os funis
 * da organização INTEIROS, arquivados incluídos. As regras de
 * `lib/pipelines/pipeline-editing.ts` dependem disso — nenhum dos três índices
 * únicos de funil é parcial em `is_archived`: nem `uniq_crm_pipelines_org_slug`
 * (funil arquivado continua ocupando o slug), nem `uniq_crm_pipelines_org_default`,
 * nem `uniq_crm_pipelines_org_client`. Cada rota montando o próprio `select`
 * divergiria no primeiro ajuste.
 *
 * ⚠️ ESTE PARÁGRAFO AFIRMAVA QUE O DE PADRÃO É PARCIAL, e era falso: medido em
 * `supabase/baseline.sql`, ele é `where (is_default = true)` e mais nada. A
 * afirmação aparecia em três lugares e fazia `updatesDePadrao` pular o funil
 * arquivado — um update a menos, e um 23505 para quem arquivou o funil antigo
 * antes de trocar o padrão. Para conferir sem acreditar nesta linha:
 *
 *   grep -n "uniq_crm_pipelines_org_" supabase/baseline.sql
 */
import { fail } from "@/lib/api/wrappers";
import {
  ETAPAS_INICIAIS,
  posicaoEntre,
  slugDeFunil,
  regrasQueApontamPara,
  type DependenciasDoFunil,
  type FunilEditavel,
  type RegraDeAutomacao,
} from "@/lib/pipelines/pipeline-editing";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** `position` entra: a reordenação calcula em cima dela. */
const COLUNAS =
  "id, crm_id, name, slug, description, position, is_default, is_client_pipeline, is_archived, is_primary, color";

/**
 * Os funis da organização, na ordem da lista, arquivados inclusive.
 *
 * O filtro explícito de `organization_id` é a convenção do repo e a rede que
 * sobra se a policy mudar — a RLS já vale porque o client é o do usuário.
 */
export async function lerFunis(supabase: Supabase, orgId: string): Promise<FunilEditavel[]> {
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FunilEditavel[];
}

/**
 * O que amarra o funil ao resto do sistema.
 *
 * ⚠️ AS FONTES DE WEBHOOK ENTRAM ATIVAS OU NÃO, e é a régua conservadora de
 * propósito: `webhook_sources.default_pipeline_id` é `ON DELETE CASCADE`, então
 * a exclusão levaria junto até a fonte desativada — configuração do cliente
 * apagada em silêncio. Uma régua só para arquivar e excluir também evita a
 * armadilha de recusar por um motivo na primeira operação e outro na segunda.
 *
 * ⚠️ AS AUTOMAÇÕES SÃO FILTRADAS EM JS, e não por `contains` no jsonb. O
 * `pipeline_id` mora dentro de `actions` sem FK nem schema: a forma varia entre
 * versões, e um operador de contenção erraria calado (devolvendo lista vazia)
 * justamente no caso que precisa barrar. A org tem dezenas de regras, não
 * milhares — ler e filtrar é honesto e testável sem Postgres.
 */
export async function lerDependencias(
  supabase: Supabase,
  orgId: string,
  pipelineId: string,
): Promise<DependenciasDoFunil> {
  const { count, error: leadsErr } = await supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("pipeline_id", pipelineId);
  if (leadsErr) throw new Error(leadsErr.message);

  const { data: fontes, error: fontesErr } = await supabase
    .from("webhook_sources")
    .select("name")
    .eq("organization_id", orgId)
    .eq("default_pipeline_id", pipelineId);
  if (fontesErr) throw new Error(fontesErr.message);

  const { data: regras, error: regrasErr } = await supabase
    .from("automation_rules")
    .select("name, is_active, actions")
    .eq("organization_id", orgId);
  if (regrasErr) throw new Error(regrasErr.message);

  return {
    negocios: count ?? 0,
    fontesDeWebhook: ((fontes ?? []) as Array<{ name: string }>).map((f) => f.name),
    regrasAtivas: regrasQueApontamPara((regras ?? []) as RegraDeAutomacao[], pipelineId),
  };
}

/** Um funil como a tela o desenha — a MESMA forma para o vivo e para o arquivado. */
export interface FunilDoCorpo {
  id: string;
  /** O CRM do funil (migration 9004). `null` só num banco sem a 9004. */
  crm_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_default: boolean;
  is_client_pipeline: boolean;
  /** O funil principal do CRM (9007) — o da Etapa de entrada. */
  is_primary: boolean;
  /** Cor do funil no seletor do quadro (9008), ou `null`. */
  color: string | null;
}

function paraATela(f: FunilEditavel): FunilDoCorpo {
  return {
    id: f.id,
    crm_id: f.crm_id ?? null,
    name: f.name,
    slug: f.slug,
    description: f.description ?? null,
    position: f.position,
    is_default: f.is_default,
    // `?? false` e não `!` — um clone que ainda não aplicou a 0262 devolve
    // `undefined` aqui, e a tela precisa de um booleano para decidir se
    // mostra o badge. Ausente é "não é o funil de clientes", que é a
    // verdade nesse banco.
    is_client_pipeline: f.is_client_pipeline ?? false,
    is_primary: f.is_primary ?? false,
    color: f.color ?? null,
  };
}

/**
 * O que a tela recebe de volta: os vivos na ordem da lista, e os arquivados À
 * PARTE.
 *
 * ⚠️ SÃO DUAS LISTAS, E MISTURÁ-LAS SERIA REGRESSÃO. `pipelines` alimenta os
 * seletores de funil do produto inteiro (importar planilha, destino de webhook,
 * ação de automação) — funil arquivado ali é destino que não existe mais, e foi
 * exatamente isso que os PRs #941 e #944 tiraram de outras telas. Até a #979 o
 * arquivado simplesmente não saía daqui, e o efeito era o oposto e igualmente
 * ruim: quem arquivou não tinha como ver, desarquivar nem excluir o que
 * arquivou. Separar atende as duas — a lista de trabalho continua só com os
 * vivos, e quem quer o arquivo pede o arquivo.
 */
export function corpo(funis: FunilEditavel[]): {
  pipelines: FunilDoCorpo[];
  arquivados: FunilDoCorpo[];
} {
  return {
    pipelines: funis.filter((f) => !f.is_archived).map(paraATela),
    arquivados: funis.filter((f) => f.is_archived).map(paraATela),
  };
}

/**
 * O CRM pedido existe, é DESTA organização e não está arquivado?
 *
 * A chave estrangeira composta `(organization_id, crm_id)` já recusa CRM de
 * outra organização, mas com um 23503 cru; e CRM arquivado ela aceita. Conferir
 * antes é o que permite responder 422 com frase — e o filtro de
 * `organization_id` é a convenção, não redundância: a policy de leitura libera
 * todas as organizações do usuário.
 */
export async function crmVivoDaOrg(supabase: Supabase, orgId: string, crmId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("crm_crms")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", crmId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

/**
 * Recusa do banco traduzida — ou `null` se o erro não é de conflito.
 *
 * Cobre `23505`, o conflito que dois funis editados em duas abas produzem (slug
 * repetido, ou dois padrões ao mesmo tempo). Vira texto de tela em português
 * porque "duplicate key value violates unique constraint
 * uniq_crm_pipelines_org_default" não ensina nada a quem só queria trocar o
 * funil padrão. Qualquer outro erro sai como `internal_error`, com o texto do
 * Postgres em `details` e nunca colado numa frase escrita para leigo.
 */
export function conflitoDoBanco(
  erro: { code?: string } | null | undefined,
  nomeDoFunil: string,
  requestId: string,
) {
  if (erro?.code !== "23505") return null;
  return fail(
    "state_conflict",
    `«${nomeDoFunil}» mudou enquanto você editava — outro funil já ocupa esse nome ou o lugar de padrão. ` +
      `Recarregue a página e tente de novo.`,
    409,
    { requestId },
  );
}

/** O que é preciso para criar um funil — a validação do nome já foi feita por quem chama. */
export interface NovoFunil {
  orgId: string;
  /** Ausente = o gatilho `trg_crm_pipelines_preencher_crm` põe no CRM padrão. */
  crmId?: string;
  name: string;
  description: string | null;
  color: string | null;
}

/**
 * Cria o funil COM as etapas com que ele nasce (`ETAPAS_INICIAIS`: ganho e
 * perda; a Etapa de entrada, se ele nascer principal, vem do gatilho da 9007).
 *
 * É a MESMA porta para "+ Adicionar funil" (`POST /pipelines`) e para o funil
 * principal que nasce com um CRM novo (`POST /crms`): duas cópias da sequência
 * divergiriam na primeira mudança, e o sintoma seria um funil nascendo diferente
 * conforme a tela que o criou.
 *
 * ⚠️ COMPENSAÇÃO, PORQUE SÃO DUAS ESCRITAS SEM TRANSAÇÃO. Funil sem etapa é
 * quadro morto: o board abre sem coluna nenhuma e quem criou não tem como saber
 * que aquilo nasceu quebrado. O funil recém-criado ainda não tem negócio, então
 * `crm_leads_pipeline_id_fkey ON DELETE RESTRICT` não atrapalha o desfazimento.
 */
export async function criarFunilComEtapas(
  supabase: Supabase,
  funis: FunilEditavel[],
  novo: NovoFunil,
  requestId: string,
): Promise<{ ok: true; pipelineId: string; slug: string; isDefault: boolean } | { ok: false; resposta: Response }> {
  const row = {
    organization_id: novo.orgId,
    // `undefined` não vai no JSON: ausente = o gatilho decide.
    crm_id: novo.crmId,
    name: novo.name,
    description: novo.description,
    color: novo.color,
    // Arquivados entram na conta do slug: `uniq_crm_pipelines_org_slug` não é parcial.
    slug: slugDeFunil(novo.name, funis.map((f) => f.slug)),
    // No fim da lista: funil novo aparecendo no meio seria a tela decidindo por
    // quem criou. `lerFunis` vem ordenado.
    position: posicaoEntre(funis[funis.length - 1]?.position ?? null, null),
    // ⚠️ O PRIMEIRO FUNIL DA ORGANIZAÇÃO NASCE PADRÃO. Numa instalação onde o
    // gatilho de seed não rodou, a org fica sem padrão nenhum — e todo lead
    // criado sem funil escolhido não teria para onde ir. `uniq_..._org_default`
    // é parcial, então só os ativos disputam esse lugar.
    is_default: funis.filter((f) => !f.is_archived).length === 0,
  };

  const { data: criado, error } = await supabase.from("crm_pipelines").insert(row).select("id").single();
  if (error) {
    const conflito = conflitoDoBanco(error as { code?: string }, novo.name, requestId);
    return { ok: false, resposta: conflito ?? fail("internal_error", error.message, 500, { requestId }) };
  }
  const pipelineId = (criado as { id: string }).id;

  const { error: etapasErr } = await supabase.from("crm_stages").insert(
    ETAPAS_INICIAIS.map((etapa, i) => ({
      organization_id: novo.orgId,
      pipeline_id: pipelineId,
      name: etapa.name,
      slug: etapa.slug,
      position: (i + 1) * 1000,
      is_won: etapa.is_won,
      is_lost: etapa.is_lost,
    })),
  );
  if (etapasErr) {
    await supabase.from("crm_pipelines").delete().eq("id", pipelineId).eq("organization_id", novo.orgId);
    return {
      ok: false,
      resposta: fail(
        "internal_error",
        `Não consegui criar as etapas de «${novo.name}». Nada foi salvo — tente de novo.`,
        500,
        { requestId, details: { erro: etapasErr.message } },
      ),
    };
  }

  return { ok: true, pipelineId, slug: row.slug, isDefault: row.is_default };
}
