import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";
import { RECUSA_DO_BANCO, validarExclusaoDeCrm } from "@/lib/crms/excluir";
import { lerCrms } from "../../_crms";
import { lerDependencias, lerFunis } from "../../../pipelines/_funis";

/**
 * POST /api/v1/crms/[id]/excluir — apaga o CRM DE VEZ (fork jhoow; migration
 * 9012). Só CRM sem negócio nenhum, sem captura e sem automação apontando para
 * um funil dele (régua do excluir funil). Quem tem história ARQUIVA (DELETE
 * /api/v1/crms/[id]). Manager+. A transação e a última palavra são do banco
 * (`fn_crm_excluir`, security invoker).
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("CRM não encontrado."), 404, { requestId });

  const supabase = await createClient();
  let alvo;
  let funis;
  try {
    alvo = (await lerCrms(supabase, orgId)).find((c) => c.id === id);
    if (!alvo) return fail("not_found", t("CRM não encontrado."), 404, { requestId });
    const doCrm = (await lerFunis(supabase, orgId)).filter((f) => f.crm_id === id);
    funis = await Promise.all(
      doCrm.map(async (f) => ({ nome: f.name, ...(await lerDependencias(supabase, orgId, f.id)) })),
    );
  } catch {
    return fail("internal_error", t("Não foi possível excluir o CRM."), 500, { requestId });
  }

  const veredito = validarExclusaoDeCrm(alvo, funis);
  if (!veredito.ok) return fail("state_conflict", veredito.erro, 409, { requestId });

  const { error } = await supabase.rpc("fn_crm_excluir", { p_crm: id });
  if (error) {
    const recusa = Object.keys(RECUSA_DO_BANCO).find((k) => error.message.includes(k));
    if (recusa) return fail("state_conflict", t(RECUSA_DO_BANCO[recusa]!), 409, { requestId });
    return fail("internal_error", t("Não foi possível excluir o CRM."), 500, { requestId });
  }
  void audit({
    action: "crm.deleted",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "crm_crm",
    resourceId: id,
    requestId,
    metadata: { name: alvo.name, slug: alvo.slug, funis_excluidos: funis.map((f) => f.nome) },
  });
  return ok({ id }, { requestId });
}
