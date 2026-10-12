/**
 * POST /api/v1/conversations/[id]/traducao-de-saida — a prévia "SERÁ ENVIADO EM
 * INGLÊS" do composer: traduz o texto do atendente para o idioma do cliente
 * (ou para o escolhido no "Enviar em ▼"). Não envia nada.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { IDIOMAS_OFERECIDOS } from "@/lib/translation/idiomas";
import { resolveContactLocale } from "@/lib/translation/locale";
import { traduzirTextoDeSaida } from "@/lib/translation/saida";
import { idiomaDoUsuario } from "@/lib/translation/traduzir-mensagem";

export const dynamic = "force-dynamic";

const corpo = z.object({ texto: z.string().min(1).max(4096), para: z.enum(IDIOMAS_OFERECIDOS).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  }
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const admin = createAdminClient();
  const de = await idiomaDoUsuario(admin, authz.user.id);
  const para = parsed.data.para ?? (await resolveContactLocale(admin, conv.contact_id, { detectar: false })).locale;
  if (!para) return fail("sem_idioma", t("O idioma do cliente ainda não é conhecido."), 422, { requestId });
  const traducao = await traduzirTextoDeSaida(admin, {
    organizationId: authz.org.orgId,
    conversationId: id,
    texto: parsed.data.texto,
    de,
    para,
  });
  if (!traducao) return fail("traducao_indisponivel", t("Tradução indisponível. Tente de novo em instantes."), 502, { requestId });
  return ok({ traducao, de, para }, { requestId });
}
