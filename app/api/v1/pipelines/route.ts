import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/pipelines — lista os funis da org ativa (nome + slug), RLS-scoped.
 * Existia só o handler interno (usado pelo MCP); expõe REST pro Select de
 * pipeline do CreateSourceDialog (feature Webhooks). `?crm_id=<uuid>` recorta
 * para os funis de um CRM (migration 9004).
 *
 * POST /api/v1/pipelines — cria um funil COM as etapas com que ele nasce
 * (`criarFunilComEtapas`: ganho e perda; a Etapa de entrada se ele nascer
 * principal).
 * `crm_id` é OPCIONAL: sem ele, o funil entra no CRM padrão da organização (o
 * gatilho `trg_crm_pipelines_preencher_crm` decide). Obrigatório quebraria todo
 * integrador que já cria funil por aqui.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { FORMATO_DE_COR } from "@/lib/kanban/cores-de-etapa";
import { validarNomeDeFunil, type FunilEditavel } from "@/lib/pipelines/pipeline-editing";
import { createClient } from "@/lib/supabase/server";
import { corpo, criarFunilComEtapas, crmVivoDaOrg, lerFunis } from "./_funis";
import { listPipelinesHandler } from "./_handler";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "pipelines" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const crmId = req.nextUrl.searchParams.get("crm_id");
  if (crmId !== null && !z.string().uuid().safeParse(crmId).success) {
    return fail("validation_failed", t("O filtro crm_id precisa ser um uuid."), 400, { requestId });
  }

  const supabase = await createClient();
  try {
    const { pipelines } = await listPipelinesHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
      },
      crmId ? { crm_id: crmId } : {},
    );
    return ok(pipelines, { requestId });
  } catch {
    return fail("internal_error", t("Falha ao listar funis."), 500, { requestId });
  }
}

// `.max(80)`: o nome é o título de uma linha da lista e o topo do quadro, não um
// parágrafo. O banco não limita, mas a tela quebra muito antes disso.
const bodySchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(280).nullable().optional(),
    crm_id: z.string().uuid().optional(),
    /** A "cor da aba" do funil no seletor do quadro (9008). */
    color: z.string().regex(FORMATO_DE_COR).nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_pipelines" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Corpo não é JSON válido."), 400, { requestId });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", t("Dê um nome ao funil — é o que aparece na lista."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const name = parsed.data.name.trim();
  const description = parsed.data.description?.trim() || null;

  const supabase = await createClient();

  let funis: FunilEditavel[];
  try {
    funis = await lerFunis(supabase, orgId);
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }

  // ⚠️ VALIDAR ANTES DE TOCAR O BANCO. O índice único é a rede de segurança, não
  // a primeira linha: um 23505 cru não diz QUAL funil já tem esse nome.
  const veredito = validarNomeDeFunil(name, funis, null);
  if (!veredito.ok) return fail("unprocessable_entity", veredito.erro, 422, { requestId });

  const crmId = parsed.data.crm_id;
  if (crmId !== undefined) {
    try {
      if (!(await crmVivoDaOrg(supabase, orgId, crmId))) {
        return fail("unprocessable_entity", t("CRM não encontrado. Escolha um CRM ativo da organização."), 422, {
          requestId,
        });
      }
    } catch (err) {
      return fail("internal_error", (err as Error).message, 500, { requestId });
    }
  }

  const criado = await criarFunilComEtapas(
    supabase,
    funis,
    { orgId, crmId, name, description, color: parsed.data.color ?? null },
    requestId,
  );
  if (!criado.ok) return criado.resposta;
  const pipelineId = criado.pipelineId;

  void audit({
    action: "pipeline.created",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "crm_pipeline",
    resourceId: pipelineId,
    requestId,
    metadata: { name, slug: criado.slug, is_default: criado.isDefault, crm_id: crmId ?? null },
  });

  // Relê em vez de espelhar o que foi pedido: a tela mostra o que o banco tem.
  try {
    const depois = await lerFunis(supabase, orgId);
    return ok(corpo(depois), { status: 201, requestId });
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
}
