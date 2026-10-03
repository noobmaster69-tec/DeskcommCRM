/**
 * O motor dos fluxos ligado ao mundo de verdade (fork jhoow, Fase B): Supabase
 * (service role, sempre filtrando `organization_id`) e a CADEIA DE ENVIO DO
 * INBOX — `sendMessageHandler` dentro do `send_ledger` (job, seq). A mensagem do
 * fluxo grava a linha em `messages`, respeita bloqueio/opt-out, throttle e
 * idempotência exatamente como a que um atendente manda; o rótulo do balão é
 * "Automação" (ator `webhook_source`).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { sendWithLedger, supabaseSendLedger } from "@/lib/agent-engine/edge/crm/send-ledger";
import { normalizarTags } from "@/lib/contacts/tag-normalizada";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { reagirAMensagem, sinalizarPresenca } from "@/lib/messaging/presenca";
import { logger } from "@/lib/logger";
import { fusoUtilizavel } from "@/lib/tempo/fusos";
import type { DepsDoMotor, EnrollmentDoFluxo, MensagemDeSaida, MotivoDoPasso, OrigemDoFluxo } from "./motor";
import { enfileirarPassoDoFluxo } from "./fila";
import { inscreverNoFluxo } from "./disparar";
import { executarKanban } from "./kanban";
import { notificarEquipePeloCanal } from "./notificacao";
import { enviarPixelDoFluxo } from "./pixel";

const BUCKET = "whatsapp-media";

/**
 * `messages.error_code` que repetir o envio não resolve (`messages/_handler.ts`):
 * canal em modo de teste com o número fora da lista, canal excluído, contato sem
 * telefone. `pre_go_live_indisponivel` (não deu para LER o modo de teste) fica
 * de fora: é passageira.
 */
export const RECUSAS_PERMANENTES = new Set(["pre_go_live", "channel_archived", "missing_phone_number"]);

const MIME_POR_EXTENSAO: Record<string, string> = {
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

/** A mídia do fluxo mora em `<org>/fluxos/<fluxo>/…` — nada fora disso é copiado. */
export function midiaEhDoFluxoDaOrganizacao(storagePath: string, org: string): boolean {
  const partes = storagePath.split("/");
  return partes.length >= 4 && partes[0] === org && partes[1] === "fluxos" && !partes.includes("..");
}

export function criarDepsDoMotor(admin: SupabaseClient, ctx: { jobId: string }): DepsDoMotor {
  return {
    async carregarEnrollment(org, id) {
      const { data, error } = await admin
        .from("followup_enrollments")
        .select(
          "id, organization_id, version_id, pointer_id, contact_id, conversation_id, current_node_id, status, steps_taken, ponteiro:followup_flow_pointers!inner(surface)",
        )
        .eq("organization_id", org)
        .eq("id", id)
        .eq("ponteiro.surface", "fluxo")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as EnrollmentDoFluxo | null) ?? null;
    },

    async carregarGrafo(org, versionId) {
      const { data, error } = await admin
        .from("followup_flow_versions")
        .select("graph")
        .eq("organization_id", org)
        .eq("id", versionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? flowGraphSchema.parse(data.graph) : null;
    },

    async carregarContato(org, contactId) {
      const { data, error } = await admin
        .from("contacts")
        .select("name, display_name, phone_number, email, tags, custom_fields")
        .eq("organization_id", org)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        nome: data ? nomeDoContato(data) : null,
        telefone: (data?.phone_number as string | null) ?? null,
        email: (data?.email as string | null) ?? null,
        etiquetas: ((data?.tags as string[] | null) ?? []).filter((t) => typeof t === "string"),
        campos: ((data?.custom_fields as Record<string, unknown> | null) ?? {}) as Record<string, unknown>,
      };
    },

    async respostasDesde(org, conversationId, desde) {
      const { data, error } = await admin
        .from("messages")
        .select("id, body, media_derived_text, external_id, created_at")
        .eq("organization_id", org)
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .gt("created_at", desde)
        .order("created_at", { ascending: true })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []).map((m) => ({
        id: m.id as string,
        texto: ((m.body as string | null) ?? (m.media_derived_text as string | null) ?? "").trim(),
        externalId: (m.external_id as string | null) ?? null,
        criadaEm: m.created_at as string,
      }));
    },

    async enviar(org, conversationId, msg: MensagemDeSaida, seq) {
      const { data: conv } = await admin
        .from("conversations")
        .select("contact_id")
        .eq("organization_id", org)
        .eq("id", conversationId)
        .maybeSingle();
      // O hash do ledger é sobre um retrato estável do que vai sair — corpo e mídia.
      const retrato = JSON.stringify([msg.type, msg.body ?? "", msg.media_storage_path ?? msg.media_url ?? "", msg.shared_contact ?? null]);
      const r = await sendWithLedger(
        supabaseSendLedger(admin),
        { tenantId: org, leadId: (conv?.contact_id as string | undefined) ?? null, jobId: ctx.jobId, seq, body: retrato },
        async (key, messageId) =>
          sendMessageHandler(
            admin,
            { organization_id: org, actor: { type: "webhook_source", id: ctx.jobId }, internalMessageId: messageId, requestId: key },
            {
              conversation_id: conversationId,
              type: msg.type,
              ...(msg.body ? { body: msg.body } : {}),
              ...(msg.media_storage_path ? { media_storage_path: msg.media_storage_path } : {}),
              ...(msg.media_url ? { media_url: msg.media_url } : {}),
              ...(msg.media_mime ? { media_mime: msg.media_mime } : {}),
              ...(msg.reply_to_message_id ? { reply_to_message_id: msg.reply_to_message_id } : {}),
              metadata: {
                idempotency_key: key,
                origem_do_fluxo: true,
                ...(msg.shared_contact ? { shared_contact: msg.shared_contact } : {}),
              },
            },
          ),
      );
      if (r.kind === "blocked") return "bloqueada";
      if (r.kind === "failed") {
        // Falha com código PERMANENTE encerra o fluxo; o resto a fila refaz.
        const { data: falha } = r.crmMessageId
          ? await admin
              .from("messages")
              .select("error_code")
              .eq("organization_id", org)
              .eq("id", r.crmMessageId)
              .maybeSingle()
          : { data: null };
        const codigo = (falha?.error_code as string | null) ?? null;
        if (codigo && RECUSAS_PERMANENTES.has(codigo)) return { recusada: codigo };
        throw new Error(`fluxo_envio_falhou${codigo ? `: ${codigo}` : ""}`);
      }
      return "enviada";
    },

    async copiarMidia(org, conversationId, storagePath) {
      if (!midiaEhDoFluxoDaOrganizacao(storagePath, org)) throw new Error("midia_fora_do_fluxo");
      const ext = (storagePath.split(".").pop() ?? "bin").toLowerCase();
      const destino = `${org}/${conversationId}/out-${randomUUID()}.${ext}`;
      const { error } = await admin.storage.from(BUCKET).copy(storagePath, destino);
      if (error) throw new Error(`midia_copia_falhou: ${error.message}`);
      return { storage_path: destino, mime: MIME_POR_EXTENSAO[ext] ?? null };
    },

    async presenca(org, conversationId, tipo) {
      // Decorativo: o indicador falhar nunca derruba o envio.
      await sinalizarPresenca(admin, { organizationId: org, conversationId, presenca: tipo }).catch((e: unknown) =>
        logger.warn("[fluxos] presença falhou", { error: e instanceof Error ? e.message : String(e) }),
      );
    },

    async reagir(org, conversationId, mensagem, emoji) {
      if (!mensagem.externalId) return;
      await reagirAMensagem(admin, { organizationId: org, conversationId, externalId: mensagem.externalId, emoji }).catch(
        (e: unknown) => logger.warn("[fluxos] reação falhou", { error: e instanceof Error ? e.message : String(e) }),
      );
    },

    dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    async salvarCampo(org, contactId, chave, valor) {
      const { data, error } = await admin
        .from("contacts")
        .select("custom_fields")
        .eq("organization_id", org)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const campos = { ...((data?.custom_fields as Record<string, unknown> | null) ?? {}), [chave]: valor };
      const { error: up } = await admin
        .from("contacts")
        .update({ custom_fields: campos })
        .eq("organization_id", org)
        .eq("id", contactId);
      if (up) throw new Error(up.message);
    },

    async mudarEtiquetas(org, contactId, operacao, etiquetas) {
      const { data, error } = await admin
        .from("contacts")
        .select("tags")
        .eq("organization_id", org)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const atuais = normalizarTags((data?.tags as string[] | null) ?? []);
      const pedidas = normalizarTags(etiquetas);
      const novas =
        operacao === "adicionar"
          ? normalizarTags([...atuais, ...pedidas])
          : atuais.filter((t) => !pedidas.includes(t));
      const { error: up } = await admin.from("contacts").update({ tags: novas }).eq("organization_id", org).eq("id", contactId);
      if (up) throw new Error(up.message);
    },

    async atualizar(org, id, patch) {
      const { error } = await admin
        .from("followup_enrollments")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("organization_id", org)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    async evento(org, enrollmentId, nodeId, tipo, payload) {
      const { error } = await admin.from("followup_enrollment_events").insert({
        organization_id: org,
        enrollment_id: enrollmentId,
        node_id: nodeId,
        event_type: `fluxo.${tipo}`,
        payload,
      });
      if (error) throw new Error(error.message);
    },

    async eventos(org, enrollmentId, nodeId, tipo) {
      const { data, error } = await admin
        .from("followup_enrollment_events")
        .select("payload")
        .eq("organization_id", org)
        .eq("enrollment_id", enrollmentId)
        .eq("node_id", nodeId)
        .eq("event_type", `fluxo.${tipo}`)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((e) => (e.payload as Record<string, unknown>) ?? {});
    },

    async agendar(org, enrollment: EnrollmentDoFluxo, motivo: MotivoDoPasso, quando: Date) {
      await enfileirarPassoDoFluxo(admin, {
        organizationId: org,
        contactId: enrollment.contact_id,
        enrollmentId: enrollment.id,
        motivo,
        quando,
      });
    },

    agora: () => new Date(),

    // ── Fase C ────────────────────────────────────────────────────────────
    async carregarConversa(org, conversationId) {
      const { data, error } = await admin
        .from("conversations")
        .select("status, assigned_to_user_id, last_inbound_at")
        .eq("organization_id", org)
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        status: (data?.status as string | null) ?? null,
        atendente: (data?.assigned_to_user_id as string | null) ?? null,
        ultimaEntradaEm: (data?.last_inbound_at as string | null) ?? null,
      };
    },

    async fusoDaOrganizacao(org) {
      const { data } = await admin.from("organizations").select("timezone").eq("id", org).maybeSingle();
      return fusoUtilizavel(data?.timezone as string | null | undefined);
    },

    async distribuicoes(org, pointerId, noId, contactId) {
      const base = () =>
        admin
          .from("followup_enrollment_events")
          .select("payload, inscricao:followup_enrollments!inner(pointer_id)", { count: "exact" })
          .eq("organization_id", org)
          .eq("node_id", noId)
          .eq("event_type", "fluxo.distribuido")
          .eq("inscricao.pointer_id", pointerId);
      const [{ count, error }, { data: doContato, error: e2 }] = await Promise.all([
        base().limit(1),
        base().eq("payload->>contato", contactId).order("created_at", { ascending: false }).limit(1),
      ]);
      if (error) throw new Error(error.message);
      if (e2) throw new Error(e2.message);
      const saida = (doContato?.[0]?.payload as { saida?: unknown } | undefined)?.saida;
      return { total: count ?? 0, doContato: typeof saida === "string" ? saida : null };
    },

    async fluxoPublicado(org, fluxoId) {
      const { data, error } = await admin
        .from("followup_flow_pointers")
        .select("status, active_version_id")
        .eq("organization_id", org)
        .eq("id", fluxoId)
        .eq("surface", "fluxo")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data && data.status === "active" && data.active_version_id);
    },

    async iniciarFluxo(org, input) {
      const r = await inscreverNoFluxo(admin, {
        organizationId: org,
        fluxoId: input.fluxoId,
        contactId: input.contactId,
        conversationId: input.conversationId,
        origem: input.origem,
      });
      return r.ok ? { ok: true as const, enrollmentId: r.enrollmentId } : { ok: false as const, codigo: r.codigo };
    },

    async origem(org, enrollmentId) {
      const { data, error } = await admin
        .from("followup_enrollment_events")
        .select("payload")
        .eq("organization_id", org)
        .eq("enrollment_id", enrollmentId)
        .eq("event_type", "fluxo.iniciado")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.payload as OrigemDoFluxo | null) ?? null;
    },

    async retomar(org, enrollmentId, noId, contactId) {
      const { data, error } = await admin
        .from("followup_enrollments")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("organization_id", org)
        .eq("id", enrollmentId)
        .eq("status", "dormente")
        .select("id");
      if (error) {
        // 23505: o contato já está noutro fluxo vivo — quem chamou não tem como voltar.
        if (error.code === "23505") {
          await admin
            .from("followup_enrollments")
            .update({ status: "cancelled", cancel_reason: "retorno_sem_vaga", completed_at: new Date().toISOString() })
            .eq("organization_id", org)
            .eq("id", enrollmentId)
            .eq("status", "dormente");
          return false;
        }
        throw new Error(error.message);
      }
      if (!data?.length) return false;
      await enfileirarPassoDoFluxo(admin, {
        organizationId: org,
        contactId,
        enrollmentId,
        motivo: { tipo: "retorno", noId },
      });
      return true;
    },

    async cancelarChamador(org, enrollmentId, motivo) {
      const { error } = await admin
        .from("followup_enrollments")
        .update({ status: "cancelled", cancel_reason: motivo, completed_at: new Date().toISOString() })
        .eq("organization_id", org)
        .eq("id", enrollmentId)
        .eq("status", "dormente");
      if (error) throw new Error(error.message);
    },

    async kanban(org, enrollment, config) {
      return executarKanban(admin, org, enrollment.contact_id, enrollment.id, config);
    },

    async notificarEquipe(org, conversationId, numeroE164, texto) {
      return notificarEquipePeloCanal(admin, { organizationId: org, conversationId, numeroE164, texto });
    },

    async enviarPixel(org, contactId, pedido) {
      return enviarPixelDoFluxo(admin, org, contactId, pedido);
    },
  };
}
