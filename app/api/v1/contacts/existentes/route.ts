import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ telefones: z.array(z.string().max(40)).max(5000) });

/**
 * POST /api/v1/contacts/existentes — quais destes telefones (E.164, já
 * normalizados pela prévia) JÁ são contatos desta organização, com e sem o nono
 * dígito (fork jhoow). A prévia da importação pinta essas linhas de amarelo e
 * pergunta pular/atualizar/manter. Só leitura; agent+. Cliente da sessão: RLS.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });

  const supabase = await createClient();
  const pedidos = parsed.data.telefones;
  const porVariante = new Map<string, string>();
  for (const t of pedidos) for (const v of phoneLookupVariants(t)) porVariante.set(v, t);
  const variantes = [...porVariante.keys()];
  const existentes = new Set<string>();
  for (let i = 0; i < variantes.length; i += 200) {
    const { data } = await supabase
      .from("contacts")
      .select("phone_number")
      .eq("organization_id", authz.org.orgId)
      .is("is_merged_into", null)
      .in("phone_number", variantes.slice(i, i + 200));
    for (const c of (data ?? []) as Array<{ phone_number: string }>)
      for (const v of phoneLookupVariants(c.phone_number)) {
        const original = porVariante.get(v);
        if (original) existentes.add(original);
      }
  }
  return ok({ existentes: [...existentes] }, { requestId });
}
