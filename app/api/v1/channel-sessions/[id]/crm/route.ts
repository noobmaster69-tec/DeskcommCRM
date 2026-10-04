import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PUT /api/v1/channel-sessions/[id]/crm — liga um número de WhatsApp a um CRM, ou
 * desliga (Funis no modelo Kommo, Fase D).
 *
 * Corpo: `{ crm_id: "<uuid>" }` liga (ou troca); `{ crm_id: null }` desliga, e o
 * número volta a mandar o contato novo para o CRM PADRÃO. Quem lê o vínculo é
 * `crmDaConversa` (`lib/leads/nascimento-do-lead.ts`), na hora em que o lead nasce.
 * Trocar o CRM de um número não move os leads que já existem — só os novos vão
 * para o CRM novo.
 *
 * Auth: sessão por cookie, papel manager+ — o mesmo corte da tabela
 * `crm_waha_session_bindings` (RLS espelhada de `crm_crms`, 9007) e das telas de
 * CRM. Ligar um número a um CRM é configuração do CRM, não do canal: conectar,
 * reconectar e excluir o número seguem sendo do admin, em Conexões.
 * `organization_id` sai da sessão — nunca do corpo; o número e o CRM são
 * conferidos como desta organização antes de escrever (e as FKs compostas
 * recusariam de qualquer jeito).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({ crm_id: z.string().uuid().nullable() }).strict();

export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "crm_waha_session_bindings" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const { id: sessaoId } = await ctx.params;
  if (!z.string().uuid().safeParse(sessaoId).success) {
    return fail("not_found", t("Número não encontrado."), 404, { requestId });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Corpo não é JSON válido."), 400, { requestId });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", t("Escolha um CRM, ou desvincule o número."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const crmId = parsed.data.crm_id;

  const supabase = await createClient();

  // O número é desta organização? Número de outra responde igual a inexistente.
  const { data: sessao, error: sessaoErr } = await supabase
    .from("channel_sessions")
    .select("id, waha_session_name, phone_number, display_name")
    .eq("organization_id", orgId)
    .eq("id", sessaoId)
    .maybeSingle();
  if (sessaoErr) return fail("internal_error", sessaoErr.message, 500, { requestId });
  if (!sessao) return fail("not_found", t("Número não encontrado."), 404, { requestId });

  const { data: atual, error: atualErr } = await supabase
    .from("crm_waha_session_bindings")
    .select("crm_id")
    .eq("organization_id", orgId)
    .eq("channel_session_id", sessaoId)
    .maybeSingle();
  if (atualErr) return fail("internal_error", atualErr.message, 500, { requestId });
  const crmAnterior = (atual as { crm_id?: string } | null)?.crm_id ?? null;

  // Pedir o que já é o estado não é fato novo: responde sem escrever nem auditar.
  if (crmAnterior === crmId) {
    return ok({ channel_session_id: sessaoId, crm_id: crmId }, { requestId });
  }

  if (crmId === null) {
    const { error } = await supabase
      .from("crm_waha_session_bindings")
      .delete()
      .eq("organization_id", orgId)
      .eq("channel_session_id", sessaoId);
    if (error) return fail("internal_error", error.message, 500, { requestId });
  } else {
    const { data: crm, error: crmErr } = await supabase
      .from("crm_crms")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("id", crmId)
      .is("archived_at", null)
      .maybeSingle();
    if (crmErr) return fail("internal_error", crmErr.message, 500, { requestId });
    if (!crm) {
      return fail("unprocessable_entity", t("CRM não encontrado. Escolha um CRM ativo da organização."), 422, {
        requestId,
      });
    }
    // Um número, um CRM: `unique (channel_session_id)`. Trocar é reescrever a
    // MESMA linha, não criar outra. Uma corrida com outra aba que já criou o
    // vínculo bate no índice único (23505) e responde 409 — recarregar resolve.
    const { error } = crmAnterior
      ? await supabase
          .from("crm_waha_session_bindings")
          .update({ crm_id: crmId })
          .eq("organization_id", orgId)
          .eq("channel_session_id", sessaoId)
      : await supabase
          .from("crm_waha_session_bindings")
          .insert({ organization_id: orgId, channel_session_id: sessaoId, crm_id: crmId, created_by: authz.user.id });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return fail("state_conflict", t("Este número acabou de ser vinculado em outra aba. Recarregue a página."), 409, {
          requestId,
        });
      }
      return fail("internal_error", error.message, 500, { requestId });
    }
  }

  void audit({
    action: crmId === null ? "crm.number_unbound" : "crm.number_bound",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "channel_session",
    resourceId: sessaoId,
    requestId,
    metadata: {
      numero: (sessao as { phone_number?: string | null }).phone_number ?? null,
      crm_anterior: crmAnterior,
      crm_novo: crmId,
    },
  });

  return ok({ channel_session_id: sessaoId, crm_id: crmId }, { requestId });
}
