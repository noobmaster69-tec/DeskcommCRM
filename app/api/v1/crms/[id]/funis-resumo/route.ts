import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * GET /api/v1/crms/[id]/funis-resumo — o modal "Ver funis e números" do card
 * (fork jhoow): cada funil vivo com nº de negócios, nº de etapas ativas e a
 * última atividade (o negócio mexido por último), e os números de WhatsApp
 * ligados ao CRM. Client da SESSÃO: a RLS de cada tabela vale para quem olha.
 * Contagens `head` por funil — um CRM tem poucos funis.
 */
type Ctx = { params: Promise<{ id: string }> };

export interface FunilDoResumo {
  id: string;
  name: string;
  color: string | null;
  is_primary: boolean;
  leads: number;
  etapas: number;
  ultima_atividade: string | null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_crms" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("CRM não encontrado."), 404, { requestId });

  const db = await createClient();
  const { data: funis, error } = await db
    .from("crm_pipelines")
    .select("id, name, color, is_primary, position")
    .eq("organization_id", orgId)
    .eq("crm_id", id)
    .eq("is_archived", false)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });
  if (error) return fail("internal_error", t("Não foi possível ler os funis."), 500, { requestId });

  const resumo: FunilDoResumo[] = await Promise.all(
    (funis ?? []).map(async (f) => {
      const [leads, etapas, ultimo] = await Promise.all([
        db.from("crm_leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("pipeline_id", f.id),
        db
          .from("crm_stages")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("pipeline_id", f.id)
          .eq("is_archived", false),
        db
          .from("crm_leads")
          .select("updated_at")
          .eq("organization_id", orgId)
          .eq("pipeline_id", f.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        id: f.id as string,
        name: f.name as string,
        color: (f.color as string | null) ?? null,
        is_primary: f.is_primary === true,
        leads: leads.count ?? 0,
        etapas: etapas.count ?? 0,
        ultima_atividade: (ultimo.data?.updated_at as string | undefined) ?? null,
      };
    }),
  );

  const [{ data: vinculos }, canais] = await Promise.all([
    db.from("crm_waha_session_bindings").select("channel_session_id").eq("organization_id", orgId).eq("crm_id", id),
    listSelectableChannels(db, orgId).catch(() => []),
  ]);
  const ligados = new Set(((vinculos ?? []) as Array<{ channel_session_id: string }>).map((v) => v.channel_session_id));
  const numeros = canais
    .filter((c) => ligados.has(c.id))
    .map((c) => ({ id: c.id, nome: c.display_name, telefone: c.phone_number }));

  return ok({ funis: resumo, numeros }, { requestId });
}
