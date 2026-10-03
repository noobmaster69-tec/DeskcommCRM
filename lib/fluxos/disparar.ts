import type { SupabaseClient } from "@supabase/supabase-js";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { enfileirarPassoDoFluxo } from "./fila";

/**
 * Coloca um contato num FLUXO publicado, no Início (fork jhoow, Fase B).
 *
 * Quem chama decide de onde veio a autoridade (o botão "Disparar fluxo" do Inbox
 * resolve organização e papel pela sessão); aqui toda leitura filtra a
 * organização recebida, e o fluxo, a conversa e o contato precisam ser dela.
 *
 * O enrollment de fluxo nasce com `next_eval_at = 'infinity'`: o relógio de
 * minuto do follow-up nunca o reclama — quem o move é o job `fluxo_step`.
 */
export type ResultadoDoDisparo =
  | { ok: true; enrollmentId: string }
  | { ok: false; codigo: "fluxo_inexistente" | "fluxo_nao_publicado" | "conversa_inexistente" | "ja_em_outro_fluxo"; detalhe?: string };

export async function dispararFluxo(
  admin: SupabaseClient,
  input: { organizationId: string; fluxoId: string; conversationId: string },
): Promise<ResultadoDoDisparo> {
  const org = input.organizationId;
  const [{ data: fluxo }, { data: conversa }] = await Promise.all([
    admin
      .from("followup_flow_pointers")
      .select("id, name, status, active_version_id")
      .eq("organization_id", org)
      .eq("id", input.fluxoId)
      .eq("surface", "fluxo")
      .maybeSingle(),
    admin
      .from("conversations")
      .select("id, contact_id, is_group")
      .eq("organization_id", org)
      .eq("id", input.conversationId)
      .maybeSingle(),
  ]);
  if (!fluxo) return { ok: false, codigo: "fluxo_inexistente" };
  if (fluxo.status !== "active" || !fluxo.active_version_id) return { ok: false, codigo: "fluxo_nao_publicado" };
  if (!conversa || conversa.is_group || !conversa.contact_id) return { ok: false, codigo: "conversa_inexistente" };

  const { data: versao, error: vErr } = await admin
    .from("followup_flow_versions")
    .select("graph")
    .eq("organization_id", org)
    .eq("id", fluxo.active_version_id)
    .maybeSingle();
  if (vErr || !versao) return { ok: false, codigo: "fluxo_nao_publicado" };
  const inicio = flowGraphSchema.parse(versao.graph).nodes.find((n) => n.type === "trigger");
  if (!inicio) return { ok: false, codigo: "fluxo_nao_publicado" };

  const { data: criado, error } = await admin
    .from("followup_enrollments")
    .insert({
      organization_id: org,
      pointer_id: fluxo.id,
      version_id: fluxo.active_version_id,
      contact_id: conversa.contact_id,
      conversation_id: conversa.id,
      current_node_id: inicio.id,
      status: "active",
      next_eval_at: "infinity",
    })
    .select("id")
    .single();
  if (error) {
    // Índice `one_live`: um contato tem UMA inscrição viva por organização
    // (follow-up ou fluxo). Dizer QUAL é o que deixa a pessoa decidir.
    if (error.code === "23505") {
      const { data: viva } = await admin
        .from("followup_enrollments")
        .select("followup_flow_pointers(name)")
        .eq("organization_id", org)
        .eq("contact_id", conversa.contact_id)
        .in("status", ["active", "waiting_reply", "paused_handoff", "paused_manual"])
        .maybeSingle();
      const nome = (viva as unknown as { followup_flow_pointers?: { name?: string } } | null)?.followup_flow_pointers?.name;
      return { ok: false, codigo: "ja_em_outro_fluxo", ...(nome ? { detalhe: nome } : {}) };
    }
    throw new Error(error.message);
  }

  await admin.from("followup_enrollment_events").insert({
    organization_id: org,
    enrollment_id: criado.id,
    node_id: inicio.id,
    event_type: "fluxo.iniciado",
    payload: { origem: "manual" },
  });
  await enfileirarPassoDoFluxo(admin, {
    organizationId: org,
    contactId: conversa.contact_id as string,
    enrollmentId: criado.id as string,
    motivo: { tipo: "seguir" },
  });
  return { ok: true, enrollmentId: criado.id as string };
}
