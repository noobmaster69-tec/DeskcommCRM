import type { Queryable } from "@/lib/agent-engine/queue/queue";

/**
 * O fluxo ativo do contato, visto do DRAIN (pg puro, no worker) — fork jhoow,
 * Etapa 2. Com fluxo vivo o fluxo conduz a conversa e o agente de IA NÃO recebe
 * o turno: é o desacoplamento "inbound → fluxo sem agente" do master plan.
 */
export async function fluxoAtivoDoContato(
  db: Queryable,
  organizationId: string,
  contactId: string,
): Promise<{ id: string; status: "active" | "waiting_reply" } | null> {
  const { rows } = await db.query<{ id: string; status: "active" | "waiting_reply" }>(
    `select e.id, e.status
       from followup_enrollments e
       join followup_flow_pointers p
         on p.id = e.pointer_id and p.organization_id = e.organization_id
      where e.organization_id = $1
        and e.contact_id = $2
        and p.surface = 'fluxo'
        and e.status in ('active', 'waiting_reply')
      limit 1`,
    [organizationId, contactId],
  );
  return rows[0] ?? null;
}
