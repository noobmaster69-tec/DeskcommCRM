import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { montarFicha, prepararAlteracao, type ContatoDaFicha } from "@/lib/contacts/ficha-de-campos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { lerVariaveisDaOrganizacao } from "@/lib/variables/definicoes";

export const dynamic = "force-dynamic";

const COLUNAS = "id, name, display_name, phone_number, email, locale, source, last_activity_at, custom_fields, source_metadata";

const patchSchema = z.strictObject({
  valores: z.record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])),
});

/**
 * GET /api/v1/contacts/:id/campos — a FICHA DE CAMPOS (fork jhoow): "Dados do
 * contato" e "Campos personalizados", em grupos, com o valor guardado e o que
 * as mensagens usam hoje. PATCH grava os valores (por contato), validando pelo
 * tipo. Mesma porta do contato: leitura de qualquer membro, escrita agent+.
 * Cliente da SESSÃO: a RLS de `contacts` recorta a organização.
 */
async function ultimaCampanha(supabase: Awaited<ReturnType<typeof createClient>>, org: string, contactId: string) {
  const { data } = await supabase
    .from("campaign_recipients")
    .select("campaign_id, sent_at, campaigns(name)")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const linha = data as { campaign_id: string; campaigns: { name: string } | { name: string }[] | null } | null;
  if (!linha) return null;
  const c = Array.isArray(linha.campaigns) ? linha.campaigns[0] : linha.campaigns;
  return { id: linha.campaign_id, nome: c?.name ?? linha.campaign_id };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("viewer", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const t = (x: string) => traduzir(x, authz.user.idioma);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  const [defs, campanha] = await Promise.all([
    lerVariaveisDaOrganizacao(supabase, authz.org.orgId),
    ultimaCampanha(supabase, authz.org.orgId, id).catch(() => null),
  ]);
  // Rótulos e dicas do catálogo saem no idioma de quem lê (a tela não traduz texto vindo da API).
  const grupos = montarFicha(data as ContatoDaFicha, defs, campanha).map((g) => ({
    ...g,
    rotulo: t(g.rotulo),
    campos: g.campos.map((c) => ({ ...c, rotulo: t(c.rotulo), dica: c.dica ? t(c.dica) : null })),
  }));
  return ok({ contato_id: id, grupos }, { requestId });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const t = (x: string) => traduzir(x, authz.user.idioma);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, details: parsed.error.flatten() });

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("contacts")
    .select(COLUNAS + ", is_anonymized")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!atual) return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  if ((atual as { is_anonymized?: boolean }).is_anonymized)
    return fail("conflict", t("Contato anonimizado não recebe dados novos."), 409, { requestId });

  const defs = await lerVariaveisDaOrganizacao(supabase, authz.org.orgId);
  const alt = prepararAlteracao(atual as unknown as ContatoDaFicha, parsed.data.valores, defs);
  if (alt.erros.length > 0)
    return fail("validation_failed", t("Alguns campos não passaram na validação."), 422, {
      requestId,
      details: { campos: alt.erros.map((e) => ({ ...e, mensagem: t(e.mensagem) })) },
    });

  const patch: Record<string, unknown> = { ...alt.colunas };
  if (alt.customFields) patch.custom_fields = alt.customFields;
  // Nome editado à mão fica marcado: nada automático o sobrescreve depois
  // (ver `lib/followup/persistir-resposta.ts`).
  if (alt.nomeManual)
    patch.source_metadata = {
      ...(((atual as { source_metadata?: Record<string, unknown> }).source_metadata ?? {}) as Record<string, unknown>),
      nome_manual: true,
    };
  if (Object.keys(patch).length === 0) return ok({ alterados: [] }, { requestId });

  const { error } = await supabase.from("contacts").update(patch).eq("organization_id", authz.org.orgId).eq("id", id);
  if (error) {
    const msg = error.code === "23505" ? t("Esse e-mail já é de outro contato.") : error.message;
    return fail(error.code === "23505" ? "conflict" : "internal_error", msg, error.code === "23505" ? 409 : 500, { requestId });
  }
  const alterados = Object.keys(parsed.data.valores);
  void audit({
    action: "contact.updated",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "contact",
    resourceId: id,
    requestId,
    metadata: { campos: alterados, via: "ficha_de_campos" },
  });
  return ok({ alterados }, { requestId });
}
