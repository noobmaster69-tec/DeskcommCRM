/**
 * POST /api/v1/messages/[id]/traducao — "Tradução indisponível — tentar novamente?"
 *
 * Traduz AGORA a mensagem recebida, respeitando o cache (já traduzida volta
 * sem chamar o modelo). Só repete o modelo quando a anterior falhou.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { traduzirMensagemRecebida } from "@/lib/translation/traduzir-mensagem";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  }
  // A leitura pelo cliente do usuário é a prova de acesso (RLS): mensagem de
  // conversa que ele não vê não é traduzida por ele.
  const supabase = await createClient();
  const { data: visivel } = await supabase
    .from("messages")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!visivel) return fail("not_found", t("Mensagem não encontrada."), 404, { requestId });

  const admin = createAdminClient();
  const desfecho = await traduzirMensagemRecebida(admin, id, { repetirFalha: true });
  const { data } = await admin
    .from("messages")
    .select("id, content_translated, content_locale, translated_to, translated_at, translation_status")
    .eq("id", id)
    .maybeSingle();
  if (desfecho === "falhou") {
    return fail("traducao_indisponivel", t("Tradução indisponível. Tente de novo em instantes."), 502, { requestId });
  }
  return ok({ desfecho, mensagem: data }, { requestId });
}
