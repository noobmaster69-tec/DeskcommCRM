import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { ImportacaoDesfeita, importacaoSchema, importarAudiencia } from "@/lib/campanhas/importar-audiencia";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/v1/campaigns/audiences/import — importa a lista de contatos de uma
 * campanha (fork jhoow, Campanhas › item 1). Multipart: `dados` (JSON já
 * mapeado pela tela) e `arquivo` (o original, opcional, guardado para
 * auditoria no bucket privado). Manager+, o papel de quem cria campanha.
 * Admin client SEMPRE com a organização da sessão no filtro.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

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
    const extensao = /\.xlsx$/i.test(blob.name) ? "xlsx" : "csv";
    arquivo = { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type, extensao };
  }

  try {
    const resumo = await importarAudiencia(
      createAdminClient(),
      { organizationId: authz.org.orgId, userId: authz.user.id },
      parsed.data,
      arquivo,
    );
    void audit({
      action: "campaign.audience_imported",
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      resourceType: "campaign_audience_source",
      resourceId: resumo.fonteId,
      requestId,
      metadata: { ...resumo, arquivo: parsed.data.nome_do_arquivo },
    });
    return ok(resumo, { requestId, status: 201 });
  } catch (e) {
    // Tudo ou nada: uma linha que o banco recusou desfaz a importação inteira.
    if (e instanceof ImportacaoDesfeita)
      return fail("validation_failed", `${t("Nada foi importado: a linha")} ${e.linha} ${t("falhou")} (${e.motivo}).`, 422, {
        requestId,
        details: { linha: e.linha, motivo: e.motivo },
      });
    return fail("internal_error", e instanceof Error ? e.message : t("Não foi possível importar a lista."), 500, { requestId });
  }
}
