/**
 * GET/PATCH /api/v1/conversations/[id]/idiomas — o par de idiomas da conversa
 * (selo "🌐 Inglês ⇄ Português" do cabeçalho, no Inbox e no drawer do funil).
 *
 * GET devolve o idioma do cliente (com a origem: manual, DDI, detectado), o de
 * quem está olhando e as chaves de tradução da conversa. PATCH grava o que o
 * selo mudou: idioma do cliente (vira `manual` e dispara a re-tradução), o meu
 * idioma e as chaves de entrada/saída.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { avisarTrocaDeIdioma } from "@/lib/translation/avisar-troca-de-idioma";
import { IDIOMAS_OFERECIDOS, mesmaLingua } from "@/lib/translation/idiomas";
import { resolveContactLocale } from "@/lib/translation/locale";
import { chavesDaConversa } from "@/lib/translation/saida";
import { idiomaDoUsuario } from "@/lib/translation/traduzir-mensagem";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function conversaVisivel(id: string, org: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, contact_id, metadata")
    .eq("id", id)
    .eq("organization_id", org)
    .maybeSingle();
  return data as { id: string; contact_id: string; metadata: Record<string, unknown> | null } | null;
}

async function estado(id: string, org: string, userId: string) {
  const conv = await conversaVisivel(id, org);
  if (!conv) return null;
  const admin = createAdminClient();
  // `detectar: false`: abrir a conversa nunca chama o modelo — a detecção
  // acontece no worker, quando a mensagem chega.
  const contato = await resolveContactLocale(admin, conv.contact_id, { detectar: false });
  const meu = await idiomaDoUsuario(admin, userId);
  return {
    contato,
    meu_idioma: meu,
    traducao: chavesDaConversa(conv.metadata),
    idiomas_diferentes: contato.locale != null && !mesmaLingua(contato.locale, meu),
  };
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  const r = await estado(id, authz.org.orgId, authz.user.id);
  if (!r) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  return ok(r, { requestId });
}

const corpo = z
  .object({
    contato_locale: z.enum(IDIOMAS_OFERECIDOS).optional(),
    meu_idioma: z.enum(IDIOMAS_OFERECIDOS).optional(),
    entrada: z.boolean().optional(),
    saida: z.boolean().optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  }
  const conv = await conversaVisivel(id, authz.org.orgId);
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const admin = createAdminClient();
  const b = parsed.data;

  if (b.contato_locale) {
    const { data: antes } = await admin.from("contacts").select("locale").eq("id", conv.contact_id).maybeSingle();
    await admin
      .from("contacts")
      .update({ locale: b.contato_locale, locale_source: "manual" })
      .eq("id", conv.contact_id)
      .eq("organization_id", authz.org.orgId);
    if ((antes as { locale: string | null } | null)?.locale !== b.contato_locale) {
      await avisarTrocaDeIdioma(authz.org.orgId, conv.contact_id, b.contato_locale);
    }
  }
  if (b.meu_idioma) {
    const supabase = await createClient();
    await supabase
      .from("user_preferences")
      .upsert({ user_id: authz.user.id, operating_locale: b.meu_idioma, updated_at: new Date().toISOString() });
  }
  if (b.entrada !== undefined || b.saida !== undefined) {
    const atuais = chavesDaConversa(conv.metadata);
    const metadata = {
      ...(conv.metadata ?? {}),
      traducao: { entrada: b.entrada ?? atuais.entrada, saida: b.saida ?? atuais.saida },
    };
    await admin.from("conversations").update({ metadata }).eq("id", id).eq("organization_id", authz.org.orgId);
  }
  return ok(await estado(id, authz.org.orgId, authz.user.id), { requestId });
}
