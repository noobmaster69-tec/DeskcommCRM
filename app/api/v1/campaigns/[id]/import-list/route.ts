import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ImportacaoDesfeita, importacaoSchema, importarAudiencia } from "@/lib/campanhas/importar-audiencia";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/v1/campaigns/:id/import-list — importa a planilha (modelo de 18
 * colunas ou mapeamento livre) DIRETO numa campanha que já existe e ainda é
 * rascunho (fork jhoow): grava os contatos (tudo ou nada), a lista
 * (`campaign_audience_sources`, ligada a esta campanha) e troca o público da
 * campanha para "Importar lista". Multipart: `dados` (JSON mapeado) e
 * `arquivo`. Manager+.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (x: string) => traduzir(x, authz.user.idioma);
  const admin = createAdminClient();

  const { data: campanha } = await admin
    .from("campaigns")
    .select("id, status, audience_filter")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!campanha) return fail("not_found", t("Campanha não encontrada."), 404, { requestId });
  if ((campanha as { status: string }).status !== "draft")
    return fail("campanha_nao_editavel", t("Só um rascunho aceita mudar o texto e o público. O ritmo você pode ajustar a qualquer momento."), 409, { requestId });

  const form = await req.formData().catch(() => null);
  if (!form) return fail("validation_failed", t("Envie a lista no formato esperado."), 422, { requestId });
  let bruto: unknown = null;
  try {
    bruto = JSON.parse(String(form.get("dados") ?? "null"));
  } catch {
    bruto = null;
  }
  const parsed = importacaoSchema.safeParse(bruto);
  if (!parsed.success)
    return fail("validation_failed", t("A lista não passou na validação. Confira o mapeamento das colunas."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  let arquivo: { bytes: Uint8Array; tipo: string; extensao: string } | null = null;
  const f = form.get("arquivo");
  if (f && typeof f === "object" && "arrayBuffer" in f) {
    const blob = f as File;
    if (blob.size > MAX_BYTES) return fail("payload_too_large", t("O arquivo passa de 10 MB."), 413, { requestId });
    arquivo = { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type, extensao: /\.xlsx$/i.test(blob.name) ? "xlsx" : "csv" };
  }

  try {
    const resumo = await importarAudiencia(admin, { organizationId: authz.org.orgId, userId: authz.user.id }, parsed.data, arquivo);
    if (resumo.fonteId) {
      await admin.from("campaign_audience_sources").update({ campaign_id: id }).eq("organization_id", authz.org.orgId).eq("id", resumo.fonteId);
      const filtro = ((campanha as { audience_filter?: Record<string, unknown> }).audience_filter ?? {}) as Record<string, unknown>;
      const total = resumo.criados + resumo.atualizados + resumo.mantidos;
      await admin
        .from("campaigns")
        .update({
          audience_filter: {
            fonte: "importacao",
            lista_importada: resumo.fonteId,
            limite: Math.min(5000, Math.max(Number(filtro.limite) || 0, total || 1)),
          },
        })
        .eq("organization_id", authz.org.orgId)
        .eq("id", id)
        .eq("status", "draft");
    }
    void audit({
      action: "campaign.audience_imported",
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      resourceType: "campaign",
      resourceId: id,
      requestId,
      metadata: { ...resumo, arquivo: parsed.data.nome_do_arquivo },
    });
    return ok(resumo, { requestId, status: 201 });
  } catch (e) {
    if (e instanceof ImportacaoDesfeita)
      return fail("validation_failed", `${t("Nada foi importado: a linha")} ${e.linha} ${t("falhou")} (${e.motivo}).`, 422, {
        requestId,
        details: { linha: e.linha, motivo: e.motivo },
      });
    return fail("internal_error", e instanceof Error ? e.message : t("Não foi possível importar a lista."), 500, { requestId });
  }
}
