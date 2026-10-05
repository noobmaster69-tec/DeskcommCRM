import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { fusoDoContato, fusoValido } from "@/lib/campanhas/fuso";
import { idiomaDoEnvio } from "@/lib/campanhas/idioma";
import { renderizar } from "@/lib/campanhas/renderizador";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { lerVariaveisDaOrganizacao, paraRenderizar } from "@/lib/variables/definicoes";

export const dynamic = "force-dynamic";

const schema = z.strictObject({
  texto: z.string().max(4096),
  contact_id: z.string().uuid(),
  /** O idioma da campanha/fluxo (inicia o da conversa quando o contato não tem). */
  idioma: z.string().trim().max(20).nullable().optional(),
  /** O fuso da campanha — o do contato manda quando é conhecido. */
  fuso: z.string().trim().max(64).nullable().optional(),
});

/**
 * POST /api/v1/variaveis/previa — a mensagem como ESTE contato a receberia
 * agora (fork jhoow): o mesmo renderizador do envio, com os dados dele, no fuso
 * e no idioma dele. Variável sem valor fica visível (`faltando`), nunca some em
 * silêncio. Só leitura; agent+ (quem escreve mensagens).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const t = (x: string) => traduzir(x, authz.user.idioma);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  const e = parsed.data;

  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("name, display_name, phone_number, email, custom_fields, locale, source, last_activity_at")
    .eq("organization_id", authz.org.orgId)
    .eq("id", e.contact_id)
    .maybeSingle();
  if (!data) return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  const c = data as {
    name: string | null;
    display_name: string | null;
    phone_number: string | null;
    email: string | null;
    custom_fields: Record<string, unknown> | null;
    locale: string | null;
    source: string | null;
    last_activity_at: string | null;
  };
  const campos = (c.custom_fields ?? {}) as Record<string, unknown>;
  const vars = paraRenderizar(await lerVariaveisDaOrganizacao(supabase, authz.org.orgId));
  const fuso = fusoDoContato(c.phone_number, campos, fusoValido(e.fuso) ? e.fuso! : "America/Sao_Paulo");
  const idioma = idiomaDoEnvio(campos, e.idioma ?? null, c.locale);
  const r = renderizar(
    e.texto,
    {
      nome: c.name ?? c.display_name,
      telefone: c.phone_number,
      email: c.email,
      campos,
      locale: c.locale,
      origem: c.source,
      ultimaInteracao: c.last_activity_at,
      ...vars,
    },
    { agora: new Date(), fuso, ...(idioma ? { idioma } : {}) },
  );
  return ok({ texto: r.texto, faltando: r.faltando, desconhecidas: r.desconhecidas, fuso, idioma: idioma ?? null }, { requestId });
}
