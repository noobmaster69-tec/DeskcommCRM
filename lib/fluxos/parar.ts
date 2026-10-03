import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O fluxo vivo do contato de uma conversa, e o botão de parar (fork jhoow).
 *
 * "Vivo" = `active` ou `waiting_reply`. Parar é LÓGICO: a inscrição vira
 * `cancelled` com `cancel_reason = 'parado_manualmente'` — os passos já
 * agendados na fila acordam, veem a inscrição encerrada e não fazem nada
 * (`executarPasso` ignora quem não está vivo). Com o fluxo parado o agente de
 * IA volta a receber o turno do contato (o drain só cala com fluxo vivo).
 */
export interface FluxoVivo {
  enrollmentId: string;
  fluxoId: string;
  nome: string;
  status: "active" | "waiting_reply";
  desde: string;
}

async function contatoDaConversa(admin: SupabaseClient, org: string, conversationId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("conversations")
    .select("contact_id")
    .eq("organization_id", org)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.contact_id as string | null) ?? null;
}

export async function fluxoVivoDaConversa(
  admin: SupabaseClient,
  org: string,
  conversationId: string,
): Promise<FluxoVivo | null> {
  const contato = await contatoDaConversa(admin, org, conversationId);
  if (!contato) return null;
  const { data, error } = await admin
    .from("followup_enrollments")
    .select("id, status, started_at, ponteiro:followup_flow_pointers!inner(id, name, surface)")
    .eq("organization_id", org)
    .eq("contact_id", contato)
    .eq("ponteiro.surface", "fluxo")
    .in("status", ["active", "waiting_reply"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = (data as unknown as { ponteiro: { id: string; name: string } }).ponteiro;
  return {
    enrollmentId: data.id as string,
    fluxoId: p.id,
    nome: p.name,
    status: data.status as FluxoVivo["status"],
    desde: data.started_at as string,
  };
}

export async function pararFluxoDaConversa(
  admin: SupabaseClient,
  org: string,
  conversationId: string,
  quem: string,
): Promise<FluxoVivo | null> {
  const vivo = await fluxoVivoDaConversa(admin, org, conversationId);
  if (!vivo) return null;
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("followup_enrollments")
    .update({ status: "cancelled", cancel_reason: "parado_manualmente", completed_at: agora, updated_at: agora })
    .eq("organization_id", org)
    .eq("id", vivo.enrollmentId)
    .in("status", ["active", "waiting_reply"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return null;
  await admin.from("followup_enrollment_events").insert({
    organization_id: org,
    enrollment_id: vivo.enrollmentId,
    node_id: null,
    event_type: "fluxo.encerrado",
    payload: { motivo: "parado_manualmente", por: quem },
  });
  // Quem chamou este fluxo com "voltar" (Conexão, Fase C) dorme esperando ele
  // chegar ao Fim. Parar é parar tudo: o dormente do contato sai junto, senão
  // acordaria depois e o fluxo "parado" voltaria a falar.
  const contato = await contatoDaConversa(admin, org, conversationId);
  if (contato) {
    const { data: ponteiros } = await admin
      .from("followup_flow_pointers")
      .select("id")
      .eq("organization_id", org)
      .eq("surface", "fluxo");
    const ids = (ponteiros ?? []).map((p) => p.id as string);
    if (ids.length)
      await admin
        .from("followup_enrollments")
        .update({ status: "cancelled", cancel_reason: "parado_manualmente", completed_at: agora, updated_at: agora })
        .eq("organization_id", org)
        .eq("contact_id", contato)
        .eq("status", "dormente")
        .in("pointer_id", ids);
  }
  return vivo;
}
