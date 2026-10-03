import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET    /api/v1/crms/[id] — um CRM, com as métricas dos funis vivos.
 * PATCH  /api/v1/crms/[id] — nome, endereço (slug), descrição, cor do avatar e
 *                            eleger padrão.
 * DELETE /api/v1/crms/[id] — ARQUIVA (`archived_at`). Recusa o padrão e o CRM
 *                            que ainda tem funil vivo.
 *
 * `[id]` é o uuid. A tela que abre por endereço (`/app/crms/[slug]`) resolve o
 * slug na própria página; a API fica com a chave que não muda quando o CRM é
 * renomeado.
 *
 * CRM de outra organização responde 404, igual a um inexistente: dizer "existe,
 * mas não é seu" já vazaria a existência.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  COR_FORMATO,
  DESCRICAO_MAX,
  NOME_MAX,
  normalizarSlug,
  updatesDePadraoDeCrm,
  validarArquivamentoDeCrm,
  validarNomeDeCrm,
  validarSlugDeCrm,
} from "@/lib/crms/crms";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import { conflitoDoBanco, contarFunisVivos, crmDaApi, lerCrms, lerMetricas, type LinhaDeCrm } from "../_crms";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const idSchema = z.string().uuid();

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return fail("not_found", t("CRM não encontrado."), 404, { requestId });
  }

  const supabase = await createClient();
  try {
    const crm = (await lerCrms(supabase, orgId)).find((c) => c.id === id);
    if (!crm) return fail("not_found", t("CRM não encontrado."), 404, { requestId });
    const metricas = crm.archived_at === null ? (await lerMetricas(supabase, orgId)).get(id) : undefined;
    return ok(crmDaApi(crm, metricas), { requestId });
  } catch {
    return fail("internal_error", t("Falha ao ler o CRM."), 500, { requestId });
  }
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(NOME_MAX).optional(),
    slug: z.string().min(1).max(41).optional(),
    description: z.string().max(DESCRICAO_MAX).nullable().optional(),
    avatar_bg_color: z.string().regex(COR_FORMATO).nullable().optional(),
    /**
     * Só `true`. O padrão se MUDA, não se apaga: toda organização precisa de
     * um, porque é para ele que vai o funil criado sem CRM. `false` é aceito
     * pelo schema e recusado no handler, para a resposta dizer o que fazer.
     */
    is_default: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Nada para alterar." });

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return fail("not_found", t("CRM não encontrado."), 404, { requestId });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Corpo não é JSON válido."), 400, { requestId });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", t("Não entendi o que mudar neste CRM."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const pedido = parsed.data;

  const supabase = await createClient();
  let crms: LinhaDeCrm[];
  try {
    crms = await lerCrms(supabase, orgId);
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }

  const alvo = crms.find((c) => c.id === id);
  if (!alvo) return fail("not_found", t("CRM não encontrado."), 404, { requestId });

  if (alvo.archived_at !== null) {
    return fail(
      "state_conflict",
      `O CRM «${alvo.name}» está arquivado e não está mais na sua lista.`,
      409,
      { requestId },
    );
  }

  if (pedido.is_default === false) {
    return fail(
      "unprocessable_entity",
      `«${alvo.name}» é o CRM padrão e a organização precisa de um. Marque OUTRO CRM como padrão — ` +
        `o padrão se muda, não se apaga.`,
      422,
      { requestId },
    );
  }

  const patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    avatar_bg_color?: string | null;
  } = {};

  if (pedido.name !== undefined) {
    const veredito = validarNomeDeCrm(pedido.name, crms, id);
    if (!veredito.ok) return fail("unprocessable_entity", veredito.erro, 422, { requestId });
    patch.name = pedido.name.trim();
  }
  if (pedido.slug !== undefined) {
    const normalizado = normalizarSlug(pedido.slug);
    const veredito = validarSlugDeCrm(normalizado ?? pedido.slug, crms, id);
    if (!normalizado || !veredito.ok) {
      return fail(
        "unprocessable_entity",
        veredito.ok ? t("Endereço de CRM inválido.") : veredito.erro,
        422,
        { requestId },
      );
    }
    patch.slug = normalizado;
  }
  if (pedido.description !== undefined) patch.description = pedido.description?.trim() || null;
  if (pedido.avatar_bg_color !== undefined) patch.avatar_bg_color = pedido.avatar_bg_color;

  // Na ordem: liberar o padrão antigo, depois o alvo (com o resto do patch
  // junto, nunca num terceiro update). `uniq_crm_crms_org_default` é imediato.
  const updates: Array<{ crmId: string; patch: Record<string, unknown> }> =
    pedido.is_default === true ? updatesDePadraoDeCrm(crms, id) : [];
  if (Object.keys(patch).length > 0) {
    const i = updates.findIndex((u) => u.crmId === id);
    if (i >= 0) updates[i] = { crmId: id, patch: { ...updates[i]!.patch, ...patch } };
    else updates.push({ crmId: id, patch });
  }

  for (const u of updates) {
    const { error } = await supabase
      .from("crm_crms")
      .update(u.patch)
      .eq("id", u.crmId)
      .eq("organization_id", orgId);
    if (!error) continue;
    const conflito = conflitoDoBanco(error as { code?: string }, alvo.name, requestId);
    if (conflito) return conflito;
    return fail("internal_error", error.message, 500, { requestId });
  }

  if (updates.length > 0) {
    void audit({
      action: pedido.is_default === true ? "crm.default_changed" : "crm.updated",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "crm_crm",
      resourceId: id,
      requestId,
      metadata: { pedido, updates },
    });
  }

  try {
    const depois = (await lerCrms(supabase, orgId)).find((c) => c.id === id);
    if (!depois) return fail("not_found", t("CRM não encontrado."), 404, { requestId });
    return ok(crmDaApi(depois, (await lerMetricas(supabase, orgId)).get(id)), { requestId });
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return fail("not_found", t("CRM não encontrado."), 404, { requestId });
  }

  const supabase = await createClient();
  let crms: LinhaDeCrm[];
  let funisVivos: number;
  try {
    crms = await lerCrms(supabase, orgId);
    if (!crms.some((c) => c.id === id)) {
      return fail("not_found", t("CRM não encontrado."), 404, { requestId });
    }
    funisVivos = await contarFunisVivos(supabase, orgId, id);
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
  const alvo = crms.find((c) => c.id === id)!;

  // Pedir de novo o que já foi feito não é erro nem fato novo: responde o
  // estado, sem escrever nem auditar.
  if (alvo.archived_at !== null) return ok(crmDaApi(alvo), { requestId });

  const veredito = validarArquivamentoDeCrm(alvo, funisVivos);
  if (!veredito.ok) return fail("state_conflict", veredito.erro, 409, { requestId });

  const { error } = await supabase
    .from("crm_crms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "crm.archived",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "crm_crm",
    resourceId: id,
    requestId,
    metadata: { name: alvo.name, slug: alvo.slug },
  });

  try {
    const depois = (await lerCrms(supabase, orgId)).find((c) => c.id === id);
    return ok(crmDaApi(depois ?? alvo), { requestId });
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
}
