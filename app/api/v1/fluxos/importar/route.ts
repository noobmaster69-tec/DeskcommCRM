import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { converterFluxoDoLeona, type ContextoDaImportacao } from "@/lib/fluxos/importar-leona";
import { copiarMidiaImportada } from "@/lib/fluxos/copiar-midia-importada";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/fluxos/importar — cria um fluxo (RASCUNHO) a partir do JSON de
 * um fluxo do Leona (fork jhoow, Fase D). manager+.
 *
 * O rascunho nunca é publicado aqui: o que não tem equivalente vira aviso e
 * bloco "⚠", e quem importou revisa no editor antes de publicar. A mídia é
 * copiada para o Storage da organização (`copiarMidiaImportada`).
 *
 * Funis e fluxos do contexto são lidos pelo admin client COM a organização no
 * filtro — o conversor casa por nome e nunca pode ver o funil de outra empresa.
 */
const corpoSchema = z.object({
  leona: z.unknown(),
  pasta_id: z.string().uuid().nullish(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const org = authz.org.orgId;

  const bruto = await req.json().catch(() => null);
  const corpo = corpoSchema.safeParse(bruto);
  if (!corpo.success) return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });

  const admin = createAdminClient();
  const [funisRes, etapasRes, fluxosRes] = await Promise.all([
    admin.from("crm_pipelines").select("id, name").eq("organization_id", org).eq("is_archived", false),
    admin.from("crm_stages").select("id, name, pipeline_id").eq("organization_id", org).eq("is_archived", false).order("position"),
    admin.from("followup_flow_pointers").select("id, name").eq("organization_id", org).eq("surface", "fluxo"),
  ]);
  if (funisRes.error || etapasRes.error || fluxosRes.error)
    return fail("internal_error", "Não foi possível ler os funis e fluxos.", 500, { requestId });
  const contexto: ContextoDaImportacao = {
    funis: (funisRes.data ?? []).map((f) => ({
      id: f.id as string,
      nome: f.name as string,
      etapas: (etapasRes.data ?? []).filter((e) => e.pipeline_id === f.id).map((e) => ({ id: e.id as string, nome: e.name as string })),
    })),
    fluxos: (fluxosRes.data ?? []).map((f) => ({ id: f.id as string, nome: f.name as string })),
  };

  const convertido = converterFluxoDoLeona(corpo.data.leona, contexto);
  if ("erro" in convertido) return fail("validation_failed", t(convertido.erro), 422, { requestId });
  const grafo = flowGraphSchema.safeParse(convertido.grafo);
  if (!grafo.success)
    return fail("validation_failed", t("O fluxo do Leona não pôde ser convertido."), 422, {
      requestId,
      details: grafo.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });

  // Gravação pelo client da sessão (RLS de manager, como a criação comum);
  // o admin fica para a leitura do contexto e o Storage.
  const db = await createClient();
  // O nome é único na organização (follow-ups inclusive): o importado ganha um sufixo.
  let criado: { id: string; name: string } | null = null;
  for (let i = 0; i < 6 && !criado; i++) {
    const sufixo = i === 0 ? "" : i === 1 ? " (importado)" : ` (importado ${i})`;
    const nome = `${convertido.nome.slice(0, 80 - sufixo.length)}${sufixo}`;
    const { data, error } = await db
      .from("followup_flow_pointers")
      .insert({ organization_id: org, name: nome, surface: "fluxo", draft_graph: grafo.data, pasta_id: corpo.data.pasta_id ?? null })
      .select("id, name")
      .single();
    if (data) criado = data as { id: string; name: string };
    else if (error?.code === "23503") return fail("not_found", t("Pasta não encontrada."), 404, { requestId });
    else if (error?.code !== "23505") return fail("internal_error", error?.message ?? "insert_failed", 500, { requestId });
  }
  if (!criado) return fail("conflict", t("Já existe um fluxo com este nome."), 409, { requestId });

  const copia = await copiarMidiaImportada(admin, org, criado.id, grafo.data, convertido.midias);
  const final = flowGraphSchema.safeParse(copia.grafo);
  if (final.success && convertido.midias.length > 0) {
    await db.from("followup_flow_pointers").update({ draft_graph: final.data }).eq("organization_id", org).eq("id", criado.id);
  }

  void audit({
    action: "followup_flow.created",
    actorUserId: authz.user.id,
    organizationId: org,
    resourceType: "followup_flow_pointer",
    resourceId: criado.id,
    requestId,
    metadata: { name: criado.name, origem: "importado_do_leona", blocos: grafo.data.nodes.length, avisos: convertido.avisos.length },
  });

  return ok(
    { id: criado.id, nome: criado.name, blocos: grafo.data.nodes.length, avisos: [...copia.avisos, ...convertido.avisos] },
    { requestId, status: 201 },
  );
}
