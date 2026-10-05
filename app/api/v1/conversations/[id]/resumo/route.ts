import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { modeloLeveDaEmpresa } from "@/lib/ai/modelo-leve-da-empresa";
import {
  MAX_MENSAGENS_NO_RESUMO,
  resumirConversa,
  transcricaoParaResumo,
  type MensagemParaResumo,
} from "@/lib/inbox/resumo-da-conversa";
import { traduzir } from "@/lib/i18n/dicionario";
import { ok, fail } from "@/lib/api/wrappers";

export const maxDuration = 90;

/**
 * POST /api/v1/conversations/:id/resumo — o "Resumir" do composer (fork jhoow).
 * Agent+, o papel de quem atende. As mensagens são lidas com o client da
 * SESSÃO: a RLS respeita a visibilidade restrita do atendente. Nada é gravado —
 * a tela decide se o resumo vira nota interna.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const orgId = authz.org.orgId;

  const db = await createClient();
  const { data: mensagens, error } = await db
    .from("messages")
    .select("direction, body, media_derived_text, type, created_at")
    .eq("organization_id", orgId)
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(MAX_MENSAGENS_NO_RESUMO);
  if (error) return fail("internal_error", t("Não foi possível ler a conversa."), 500, { requestId });
  const transcricao = transcricaoParaResumo((mensagens ?? []) as MensagemParaResumo[]);
  if (!transcricao) return fail("validation_error", t("Ainda não há mensagens para resumir."), 422, { requestId });

  const model = await modeloLeveDaEmpresa(createAdminClient(), orgId);
  if (!model) return fail("sem_provedor", t("Configure um provedor em Credenciais para resumir."), 422, { requestId });
  try {
    return ok({ resumo: await resumirConversa(model, transcricao) }, { requestId });
  } catch {
    return fail("llm_error", t("O provedor de IA não respondeu. Tente de novo."), 502, { requestId });
  }
}
