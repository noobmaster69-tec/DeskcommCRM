import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/crms — os CRMs vivos da organização ativa, com as métricas dos
 *                     cards (leads, funis vivos, última atualização).
 * POST /api/v1/crms — cria um CRM vazio. Os funis entram por
 *                     `POST /api/v1/pipelines` com `crm_id`.
 *
 * CRM é o nível acima do funil (migration 9004): Organização → CRMs → Funis.
 *
 * Auth: sessão por cookie. Ler é de qualquer papel (é a porta dos quadros);
 * criar é manager+, como criar funil. `organization_id` sai da sessão — nunca
 * do body.
 *
 * Métricas: consulta direta (`fn_crms_com_metricas`), sem cache. Medir antes de
 * cachear: um cache invalidado por evento exigiria tocar cada caminho que
 * escreve negócio (webhook, automação, MCP, importação, quadro, fluxos), e o
 * caminho esquecido vira número errado na tela sem ninguém notar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  COR_FORMATO,
  DESCRICAO_MAX,
  NOME_MAX,
  normalizarSlug,
  slugDeCrm,
  updatesDePadraoDeCrm,
  validarNomeDeCrm,
  validarSlugDeCrm,
} from "@/lib/crms/crms";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import { nomeDoFunilPrincipal } from "@/lib/pipelines/pipeline-editing";
import { criarFunilComEtapas, lerFunis } from "../pipelines/_funis";
import { conflitoDoBanco, crmDaApi, lerCrms, lerMetricas, type CrmDaApi, type LinhaDeCrm } from "./_crms";

export const dynamic = "force-dynamic";

/** Tag do endpoint no recibo de idempotência. */
const ENDPOINT = "POST /api/v1/crms";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const supabase = await createClient();
  try {
    const [crms, metricas] = await Promise.all([lerCrms(supabase, orgId), lerMetricas(supabase, orgId)]);
    const vivos = crms.filter((c) => c.archived_at === null).map((c) => crmDaApi(c, metricas.get(c.id)));
    return ok(vivos, { requestId });
  } catch {
    return fail("internal_error", t("Falha ao listar CRMs."), 500, { requestId });
  }
}

const bodySchema = z
  .object({
    name: z.string().min(1).max(NOME_MAX),
    /** Opcional: sem ele, sai do nome. Aceita "/clientes-girly" e caixa alta. */
    slug: z.string().min(1).max(41).optional(),
    description: z.string().max(DESCRICAO_MAX).nullable().optional(),
    avatar_bg_color: z.string().regex(COR_FORMATO).nullable().optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Corpo não é JSON válido."), 400, { requestId });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", t("Confira o nome, o endereço e a cor do CRM."), 422, {
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

  const dados = parsed.data;
  const name = dados.name.trim();
  const veredito = validarNomeDeCrm(name, crms, null);
  if (!veredito.ok) return fail("unprocessable_entity", veredito.erro, 422, { requestId });

  let slug: string;
  if (parsed.data.slug !== undefined) {
    const normalizado = normalizarSlug(parsed.data.slug);
    const vereditoDoSlug = validarSlugDeCrm(normalizado ?? parsed.data.slug, crms, null);
    if (!normalizado || !vereditoDoSlug.ok) {
      return fail(
        "unprocessable_entity",
        vereditoDoSlug.ok ? t("Endereço de CRM inválido.") : vereditoDoSlug.erro,
        422,
        { requestId },
      );
    }
    slug = normalizado;
  } else {
    slug = slugDeCrm(name, crms.map((c) => c.slug));
  }

  // O primeiro CRM da organização nasce padrão — sem padrão, todo funil criado
  // sem CRM ficaria sem destino (o gatilho criaria um "PADRÃO" por conta própria).
  const viraPadrao = parsed.data.is_default === true || crms.every((c) => c.archived_at !== null);

  /** Lança em falha: o helper de idempotência não grava recibo de operação falha. */
  async function criar(): Promise<{ resposta: CrmDaApi | { erro: Response }; status: number }> {
    const { data: criado, error } = await supabase
      .from("crm_crms")
      .insert({
        organization_id: orgId,
        name,
        slug,
        description: dados.description?.trim() || null,
        avatar_bg_color: dados.avatar_bg_color ?? null,
        is_default: false,
      })
      .select("id")
      .single();
    if (error) {
      const conflito = conflitoDoBanco(error as { code?: string }, name, requestId);
      if (conflito) return { resposta: { erro: conflito }, status: 409 };
      throw new Error(error.message);
    }
    const crmId = (criado as { id: string }).id;

    // ⚠️ O CRM NASCE COM O FUNIL PRINCIPAL, como no Kommo (Funis no modelo
    // Kommo, Fase C): sem ele o CRM abre vazio, sem quadro e sem Etapa de
    // entrada para onde mandar contato novo. É a MESMA porta de "+ Adicionar
    // funil" — o gatilho da 9007 o torna principal e cria a entrada. Se falhar,
    // o CRM recém-criado (ainda sem funil nenhum, então apagável) é desfeito:
    // um CRM sem quadro seria pior que nenhum.
    const funis = await lerFunis(supabase, orgId);
    const funil = await criarFunilComEtapas(
      supabase,
      funis,
      { orgId, crmId, name: nomeDoFunilPrincipal(name, funis), description: null, color: null },
      requestId,
    );
    if (!funil.ok) {
      await supabase.from("crm_crms").delete().eq("id", crmId).eq("organization_id", orgId);
      return { resposta: { erro: funil.resposta }, status: funil.resposta.status };
    }

    // Marcar padrão DEPOIS de existir, na ordem que o índice único cobra.
    if (viraPadrao) {
      const comNovo = [...crms, { id: crmId, name, slug, is_default: false, archived_at: null }];
      for (const u of updatesDePadraoDeCrm(comNovo, crmId)) {
        const { error: erroPadrao } = await supabase
          .from("crm_crms")
          .update(u.patch)
          .eq("id", u.crmId)
          .eq("organization_id", orgId);
        if (erroPadrao) throw new Error(erroPadrao.message);
      }
    }

    void audit({
      action: "crm.created",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "crm_crm",
      resourceId: crmId,
      requestId,
      metadata: { name, slug, is_default: viraPadrao, funil_principal_id: funil.pipelineId },
    });

    const depois = (await lerCrms(supabase, orgId)).find((c) => c.id === crmId);
    if (!depois) throw new Error("CRM criado não foi relido.");
    return { resposta: crmDaApi(depois), status: 201 };
  }

  try {
    if (chave === null) {
      const { resposta } = await criar();
      if ("erro" in resposta) return resposta.erro;
      return ok(resposta, { status: 201, requestId });
    }

    const desfecho = await comIdempotencia({
      db: supabase,
      organizationId: orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: parsed.data,
      executar: async () => {
        const r = await criar();
        // Conflito não vira recibo: a retentativa precisa poder dar certo.
        if ("erro" in r.resposta) throw r.resposta.erro;
        return r as { resposta: CrmDaApi; status: number };
      },
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
