import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/crms/[id]/duplicate — copia o CRM com a ESTRUTURA dos funis vivos
 * (funis + etapas), sem nenhum negócio.
 *
 * A cópia roda numa transação só, em `fn_crm_duplicar` (security invoker: as
 * policies manager+ de crm_crms, crm_pipelines e crm_stages decidem). Em TS
 * seriam N+M escritas sem transação, e uma falha no meio deixaria um CRM pela
 * metade, com funis sem etapa.
 *
 * Body opcional: `{ name?, slug? }`. Sem nome, a cópia se chama "<nome> (cópia)";
 * sem slug, ele sai do nome. A cópia nunca nasce padrão. Os funis copiados
 * levam o nome do CRM novo entre parênteses — o nome de funil é único entre os
 * vivos da organização.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { NOME_MAX, normalizarSlug, slugDeCrm, validarNomeDeCrm, validarSlugDeCrm } from "@/lib/crms/crms";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import { crmDaApi, lerCrms, lerMetricas, type CrmDaApi, type LinhaDeCrm } from "../../_crms";

export const dynamic = "force-dynamic";

const ENDPOINT = "POST /api/v1/crms/[id]/duplicate";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const bodySchema = z
  .object({
    name: z.string().min(1).max(NOME_MAX).optional(),
    slug: z.string().min(1).max(41).optional(),
  })
  .strict();

/** Erro do Postgres que já tem resposta própria; o resto é 500. */
function respostaDoErro(
  erro: { code?: string; message?: string },
  nome: string,
  requestId: string,
  t: (texto: string) => string,
): Response {
  if (erro.code === "P0002") return fail("not_found", t("CRM não encontrado."), 404, { requestId });
  if (erro.code === "23505") {
    return fail(
      "state_conflict",
      `Outro CRM ocupou o nome ou o endereço de «${nome}» enquanto você duplicava. Tente de novo.`,
      409,
      { requestId },
    );
  }
  if (erro.code === "42501") {
    return fail("forbidden", t("Só manager+ duplica CRM."), 403, { requestId });
  }
  return fail("internal_error", erro.message ?? "erro", 500, { requestId });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("not_found", t("CRM não encontrado."), 404, { requestId });
  }

  // Corpo vazio é válido: tudo tem default.
  let json: unknown = {};
  const texto = await req.text();
  if (texto.trim()) {
    try {
      json = JSON.parse(texto);
    } catch {
      return fail("invalid_request", t("Corpo não é JSON válido."), 400, { requestId });
    }
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", t("Confira o nome e o endereço da cópia."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_error", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  const supabase = await createClient();
  let crms: LinhaDeCrm[];
  try {
    crms = await lerCrms(supabase, orgId);
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
  const origem = crms.find((c) => c.id === id && c.archived_at === null);
  if (!origem) return fail("not_found", t("CRM não encontrado."), 404, { requestId });

  const name = (parsed.data.name ?? `${origem.name} (cópia)`).trim().slice(0, NOME_MAX);
  const vereditoDoNome = validarNomeDeCrm(name, crms, null);
  if (!vereditoDoNome.ok) return fail("unprocessable_entity", vereditoDoNome.erro, 422, { requestId });

  let slug: string;
  if (parsed.data.slug !== undefined) {
    const normalizado = normalizarSlug(parsed.data.slug);
    const veredito = validarSlugDeCrm(normalizado ?? parsed.data.slug, crms, null);
    if (!normalizado || !veredito.ok) {
      return fail(
        "unprocessable_entity",
        veredito.ok ? t("Endereço de CRM inválido.") : veredito.erro,
        422,
        { requestId },
      );
    }
    slug = normalizado;
  } else {
    slug = slugDeCrm(name, crms.map((c) => c.slug));
  }

  async function duplicar(): Promise<{ resposta: CrmDaApi; status: number }> {
    const { data, error } = await supabase.rpc("fn_crm_duplicar", {
      p_crm: id,
      p_name: name,
      p_slug: slug,
    });
    if (error) throw respostaDoErro(error, name, requestId, t);
    const novoId = data as unknown as string;

    void audit({
      action: "crm.duplicated",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "crm_crm",
      resourceId: novoId,
      requestId,
      metadata: { origem_id: id, name, slug },
    });

    const [depois, metricas] = await Promise.all([lerCrms(supabase, orgId), lerMetricas(supabase, orgId)]);
    const novo = depois.find((c) => c.id === novoId);
    if (!novo) throw new Error("CRM duplicado não foi relido.");
    return { resposta: crmDaApi(novo, metricas.get(novoId)), status: 201 };
  }

  try {
    if (chave === null) {
      const { resposta } = await duplicar();
      return ok(resposta, { status: 201, requestId });
    }
    const desfecho = await comIdempotencia({
      db: supabase,
      organizationId: orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: { id, ...parsed.data },
      executar: duplicar,
    });
    if (desfecho.tipo === "conflito") {
      return fail(
        "idempotency_conflict",
        t("Esta chave de idempotência já foi usada com outro conteúdo."),
        409,
        { requestId },
      );
    }
    if (desfecho.tipo === "em_curso") {
      return fail(
        "idempotency_in_progress",
        t("A mesma requisição ainda está em curso. Tente de novo em instantes."),
        409,
        { requestId },
      );
    }
    return ok(desfecho.resposta, { status: 201, requestId });
  } catch (err) {
    if (err instanceof Response) return err;
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
}
