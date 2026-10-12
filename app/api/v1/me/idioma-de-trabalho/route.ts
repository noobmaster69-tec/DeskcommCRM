/**
 * GET/PUT /api/v1/me/idioma-de-trabalho — "Meu idioma" (Configurações › Perfil).
 *
 * O idioma em que o atendente lê e escreve no Inbox: as mensagens recebidas
 * são traduzidas PARA ele, e o que ele escreve sai traduzido DELE (9022,
 * `user_preferences.operating_locale`). Não é o idioma da interface — esse
 * continua no seletor do topo.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { IDIOMAS_OFERECIDOS } from "@/lib/translation/idiomas";
import { IDIOMA_PADRAO_DO_ATENDENTE } from "@/lib/translation/traduzir-mensagem";

export const dynamic = "force-dynamic";

const corpo = z.object({ operating_locale: z.enum(IDIOMAS_OFERECIDOS) });

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "profile" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("operating_locale")
    .eq("user_id", authz.user.id)
    .maybeSingle();
  return ok({ operating_locale: data?.operating_locale ?? IDIOMA_PADRAO_DO_ATENDENTE }, { requestId });
}

export async function PUT(req: Request): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "profile" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Idioma inválido."), 422, { requestId });
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: authz.user.id, operating_locale: parsed.data.operating_locale, updated_at: new Date().toISOString() });
  if (error) return fail("internal_error", t("Não foi possível salvar o idioma."), 500, { requestId });
  return ok({ operating_locale: parsed.data.operating_locale }, { requestId });
}
