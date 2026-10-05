import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { importacaoSchema, importarAudiencia } from "@/lib/campanhas/importar-audiencia";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/v1/contacts/import/mapeado — importa uma planilha (CSV/XLSX) para
 * os CONTATOS com o mapeamento visual das colunas (fork jhoow). O mesmo motor da
 * lista de campanha, sem gravar audiência: cria quem não existe, aplica a
 * política de duplicata (pular / atualizar / manter) a quem já existe — célula
 * vazia nunca apaga valor, nome editado à mão não é trocado. Agent+ (o mesmo
 * papel do import de CSV); criar VARIÁVEIS novas da empresa é de manager+ — o
 * agent importa os valores mesmo assim. Admin client SEMPRE com a organização
 * da sessão no filtro.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
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
    arquivo = { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type, extensao: /\.xlsx$/i.test(blob.name) ? "xlsx" : "csv" };
  }

  try {
    const resumo = await importarAudiencia(
      createAdminClient(),
      { organizationId: authz.org.orgId, userId: authz.user.id },
      parsed.data,
      arquivo,
      {
        gravarLista: false,
        podeCriarVariaveis: ROLE_RANK[authz.org.role] >= ROLE_RANK.manager,
        origem: "importacao_planilha",
      },
    );
    void audit({
      action: "contacts.imported",
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      resourceType: "contact",
      resourceId: null,
      requestId,
      metadata: { ...resumo, arquivo: parsed.data.nome_do_arquivo, via: "planilha_mapeada" },
    });
    return ok(resumo, { requestId, status: 201 });
  } catch (e) {
    return fail("internal_error", e instanceof Error ? e.message : t("Não foi possível importar a lista."), 500, { requestId });
  }
}
