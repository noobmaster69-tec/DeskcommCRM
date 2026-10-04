import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/leads/[id]/move
 *
 * Moves a lead to a stage of its pipeline — or of ANOTHER pipeline of the SAME
 * CRM (Funis no modelo Kommo, Fase E: the card moves, keeping its history).
 * Between CRMs it is still a clone (P-01): `podeMoverEntreFunis`.
 * Uses Pattern B optimistic concurrency (P-08): client sends `expected_updated_at`,
 * UPDATE filters by it, zero rows affected ⇒ 409 lead_stage_changed_concurrent.
 *
 * Status transitions are driven by trigger `fn_crm_lead_close_on_stage` (P-02);
 * this endpoint NEVER sets `status` directly.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { moveLeadSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { emitLeadActivity, stageChangeReason } from "@/lib/leads/activity-emitter";
import { registraFalhaDeAtividade } from "@/lib/leads/activity-write-failure";
import {
  decideMotivoDaPerda,
  recusaDeMotivoDaPerdaPeloBanco,
} from "@/lib/leads/motivo-da-perda";
import { lerFunisDoMovimento, podeMoverEntreFunis, type FunilDoMovimento } from "@/lib/leads/mover-entre-funis";
import { modoDeReabertura, recusaReabertura } from "@/lib/leads/reabertura";
import {
  recusaDeCamposObrigatorios,
  recusaDeMotivoDoGanho,
  settingsDoFunil,
  validaCamposExigidos,
} from "@/lib/leads/campos-exigidos";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const user = authz.user;

  let input;
  try {
    input = await validateRequest(moveLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // Fetch current lead (RLS scoped).
  const { data: lead, error: selErr } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (selErr) {
    return fail("internal_error", selErr.message, 500, { requestId });
  }
  if (!lead) {
    return fail("not_found", t("Lead não encontrado."), 404, { requestId });
  }

  // Fetch target stage to validate same pipeline (P-01) — e `is_lost`/`is_won`,
  // que decidem respectivamente o motivo da perda (#917) e se a escrita
  // REABRIRIA um negócio encerrado (issue #1538).
  const { data: stage, error: stageErr } = await supabase
    .from("crm_stages")
    .select("id, pipeline_id, name, is_lost, is_won")
    .eq("id", input.stage_id)
    .maybeSingle();

  if (stageErr) {
    return fail("internal_error", stageErr.message, 500, { requestId });
  }
  if (!stage) {
    return fail("not_found", t("Stage não encontrado."), 404, { requestId });
  }
  // ── OUTRO FUNIL: SÓ NO MESMO CRM, E O CARD VAI JUNTO (Fase E) ─────────────
  // Os dois funis são lidos para a regra decidir; o nome de cada um vai para a
  // linha do tempo ("Funil A · Etapa X → Funil B · Etapa Y").
  let funilDeOrigem: FunilDoMovimento | null = null;
  let funilDeDestino: FunilDoMovimento | null = null;
  if (stage.pipeline_id !== lead.pipeline_id) {
    const lidos = await lerFunisDoMovimento(supabase, lead.organization_id, lead.pipeline_id, stage.pipeline_id);
    if (lidos.erro) return fail("internal_error", lidos.erro, 500, { requestId });
    // Funil que não se lê (de outra org, ou sumiu) não decide "mesmo CRM": a
    // recusa é a de sempre, a que aponta o clone.
    funilDeOrigem = lidos.origem ?? { id: lead.pipeline_id, crm_id: null, is_archived: false, name: "" };
    funilDeDestino = lidos.destino ?? { id: stage.pipeline_id, crm_id: null, is_archived: false, name: "" };
    const movimento = podeMoverEntreFunis(funilDeOrigem, funilDeDestino);
    if (!movimento.ok) {
      return fail(movimento.codigo, t(movimento.mensagem), 422, {
        requestId,
        details: movimento.codigo === "pipeline_immutable_use_clone" ? { use: "/api/v1/leads/{id}/clone" } : undefined,
      });
    }
  }
  const entreFunis = funilDeDestino !== null;

  // ── O FUNIL DECIDE SE ESTA ESCRITA REABRIRIA O NEGÓCIO (issue #1538) ───────
  //
  // O arrasto é UM dos quatro caminhos; os outros três (lote, IA, automação e
  // MCP) passam pelo `moveLeadHandler`, que faz a MESMA pergunta com a mesma
  // função. Em `mesmo_registro` — o padrão, e o de todo funil que não declarou
  // nada — `recusaReabertura` devolve null e nada aqui muda.
  //
  // Vem ANTES da régua de campos: o card encerrado não reabre, então perguntar
  // pelos campos da etapa seria abrir um diálogo para uma escrita que o 409
  // abaixo recusa de qualquer jeito.
  // As regras (reabertura, campos obrigatórios, motivo de ganho) são as do funil
  // de DESTINO: é nele que o card vai estar depois desta escrita.
  const settings = await settingsDoFunil(supabase, stage.pipeline_id);
  const recusa = recusaReabertura({
    modo: modoDeReabertura(settings),
    statusAtual: (lead as { status?: string }).status,
    etapaDestino: stage,
    idioma: user.idioma,
  });
  if (recusa) {
    // 409 e não 422: o board já trata 409 como "o servidor tem outro estado e
    // a tela precisa se reconciliar com ele" — e aqui é exatamente isso, o
    // negócio encerrado que continua encerrado. O `details.use` é o ponteiro
    // para a porta que resolve, o mesmo formato do 422 do clone.
    return fail(recusa.codigo, recusa.mensagem, 409, {
      requestId,
      details: { use: "/api/v1/leads/{id}/retomar", lead_id: leadId },
    });
  }

  // ── A MESMA ETAPA É REORDENAÇÃO, NÃO ENTRADA (CR do mantenedor, #1536) ──────
  //
  // O card que já está NA coluna de destino não está ENTRANDO nela: arrastar
  // dentro da própria coluna só troca a posição. A régua abaixo pergunta "este
  // destino exige campos que o lead não tem?" e, sem esta comparação, respondia
  // 422 para um movimento que não muda de etapa — na coluna exigente o card
  // ficava preso sem ninguém conseguir reordená-lo, e com `won_reason_required`
  // valia para TODO card antigo da coluna Ganho (o `won_reason` nasce `null`,
  // então reordenar a coluna virava 422).
  //
  // Comparado AQUI, antes da régua, e não dentro dela: `campos-exigidos.ts`
  // continua não sabendo nada sobre "mesma etapa" — quem sabe é esta rota, que
  // é quem lê `lead.stage_id` ao lado do destino. As regras de vocabulário do
  // ganho e da perda (#917) SEGUEM valendo: elas decidem sobre VALORES que a
  // escrita traz, não sobre a entrada em si.
  const mesmaEtapa = input.stage_id === lead.stage_id;

  // ── OS CAMPOS OBRIGATÓRIOS (issue #1536) ────────────────────────────────────
  //
  // A mesma pergunta dos outros cinco caminhos, respondida pela MESMA função:
  // este destino exige campos que o lead não tem? Decidido ANTES do update, pela
  // mesma razão da perda abaixo — depois dele só existiria a linha recusada.
  // `details.faltando` nomeia chave e rótulo de cada campo: é ele que a tela
  // vira em diálogo (o único caminho onde dá para PREENCHER e tentar de novo).
  const vereditoDeCampos = mesmaEtapa
    ? { faltando: [] }
    : validaCamposExigidos({
        lead: lead as Record<string, unknown>,
        settingsDoFunil: settings,
        destino: {
          stageId: stage.id,
          desfecho: stage.is_won ? "won" : stage.is_lost ? "lost" : null,
        },
        motivoDeGanho: input.won_reason ?? null,
        customFieldsPropostos: input.custom_fields ?? null,
      });
  if (vereditoDeCampos.faltando.length > 0) {
    const recusa = recusaDeCamposObrigatorios(vereditoDeCampos.faltando, user.idioma);
    return fail(recusa.codigo, recusa.mensagem, 422, {
      requestId,
      details: { faltando: vereditoDeCampos.faltando },
    });
  }

  // O MOTIVO DE GANHO (issue #1536): vocabulário do funil quando há lista, e
  // obrigatoriedade opt-in (`settings.won_reason_required`) quando o funil pede.
  if (stage.is_won) {
    const recusaVocabulario = recusaDeMotivoDoGanho({
      motivo: input.won_reason,
      settingsDoFunil: settings,
      idioma: user.idioma,
    });
    if (recusaVocabulario) {
      return fail(recusaVocabulario.codigo, recusaVocabulario.mensagem, 422, {
        requestId,
      });
    }
  }

  // ── O MOTIVO DA PERDA (issue #917) ──────────────────────────────────────────
  //
  // A etapa de destino é de perda? Então esta escrita fecha o negócio, e o banco
  // exige o motivo. Decidido ANTES do update, porque depois dele o que existe é a
  // linha recusada — e a recusa do Postgres chegava ao board como 500.
  const veredito = decideMotivoDaPerda({
    etapaDeDestino: stage,
    motivo: input.lost_reason,
    motivoAtual: (lead as { lost_reason?: string | null }).lost_reason ?? null,
    idioma: user.idioma,
  });
  if (!veredito.ok) {
    return fail(veredito.codigo, veredito.mensagem, 422, { requestId });
  }

  // Sem posição pedida (o seletor do Inbox não sabe onde os cards estão), o
  // card entra no FIM da coluna de destino — a mesma régua do `moveLeadHandler`.
  let posicao = input.position_in_stage;
  if (posicao === undefined) {
    const { data: ultimo } = await supabase
      .from("crm_leads")
      .select("position_in_stage")
      .eq("stage_id", input.stage_id)
      .order("position_in_stage", { ascending: false })
      .limit(1)
      .maybeSingle();
    posicao = ultimo?.position_in_stage ? Number(ultimo.position_in_stage) + 1000 : 1000;
  }

  // OCC update (Pattern B / Spec 09 §7.2). O motivo da perda entra NA MESMA
  // escrita que muda a etapa — nunca numa segunda, que teria janela. O funil
  // também: etapa e funil do card mudam juntos ou não mudam.
  const { data: updated, error: updErr } = await supabase
    .from("crm_leads")
    .update({
      stage_id: input.stage_id,
      ...(entreFunis ? { pipeline_id: stage.pipeline_id } : {}),
      position_in_stage: posicao,
      updated_at: new Date().toISOString(),
      ...veredito.patch,
      // O motivo de ganho sai NA MESMA escrita que muda a etapa — o mesmo
      // desenho do motivo da perda (#917): uma segunda escrita teria janela.
      ...(stage.is_won && input.won_reason?.trim()
        ? { won_reason: input.won_reason.trim() }
        : {}),
      // O merge é AQUI, nunca num PATCH anterior: ver `custom_fields` em
      // `moveLeadSchema` — dois writes teriam janela e uma segunda OCC.
      ...(input.custom_fields
        ? {
            custom_fields: {
              ...(((lead as { custom_fields?: Record<string, unknown> })
                .custom_fields ?? {}) as Record<string, unknown>),
              ...input.custom_fields,
            },
          }
        : {}),
    })
    .eq("id", leadId)
    .eq("updated_at", input.expected_updated_at)
    .select("id")
    .maybeSingle();

  if (updErr) {
    // Rede de segurança (issue #917): se o banco recusar por motivo da perda mesmo
    // com a decisão acima, quem está na tela recebe a recusa de negócio. Sem isto,
    // qualquer caminho novo que escreva `stage_id` sem passar pela decisão volta a
    // chegar aqui como 500 — que é o defeito, com outro nome.
    const recusa = recusaDeMotivoDaPerdaPeloBanco(updErr, user.idioma);
    if (recusa) return fail(recusa.codigo, recusa.mensagem, 422, { requestId });
    return fail("internal_error", updErr.message, 500, { requestId });
  }

  if (!updated) {
    // Concurrent edit. Re-fetch current to surface the latest updated_at.
    const { data: current } = await supabase
      .from("crm_leads")
      .select("updated_at")
      .eq("id", leadId)
      .maybeSingle();
    return fail(
      "lead_stage_changed_concurrent",
      t("Lead foi modificado por outro usuário. Recarregue e tente novamente."),
      409,
      {
        details: { current_updated_at: current?.updated_at ?? null },
        requestId,
      },
    );
  }

  // Wave 3 (CORE 2): esta é a rota que o BOARD usa — arrastar o card passa por
  // aqui, não pelo moveLeadHandler. O emissor é o mesmo dos outros escritores
  // (lib/leads/activity-emitter), para os quatro caminhos escreverem a mesma
  // linha na timeline.
  const { data: fromStage } = await supabase
    .from("crm_stages")
    .select("name")
    .eq("id", lead.stage_id)
    .maybeSingle();

  const atividade = await emitLeadActivity(supabase, {
    organizationId: lead.organization_id,
    leadId,
    contactId: (lead as { contact_id?: string | null }).contact_id ?? null,
    type: "stage_changed",
    sourceModule: "crm",
    sourceId: leadId,
    actor: { type: "user", id: user.id },
    reason: entreFunis
      ? stageChangeReason(
          `${funilDeOrigem!.name} · ${fromStage?.name ?? "?"}`,
          `${funilDeDestino!.name} · ${stage.name}`,
        )
      : stageChangeReason(fromStage?.name ?? null, stage.name),
    payload: {
      from_stage_id: lead.stage_id,
      to_stage_id: input.stage_id,
      pipeline_id: stage.pipeline_id,
      ...(entreFunis ? { from_pipeline_id: funilDeOrigem!.id } : {}),
    },
  });
  if (!atividade.ok) {
    // Mesma política do handler: mutação já ocorrida não bloqueia, mas o rastro
    // perdido é contado em vez de sumir num log de processo.
    await registraFalhaDeAtividade(supabase, {
      organizationId: lead.organization_id,
      leadId,
      tipo: "stage_changed",
      origem: "leads/[id]/move",
      erro: atividade.error,
      requestId,
    });
  }

  // Re-SELECT so trigger-driven status/closed_at changes are reflected — e
  // DEPOIS da atividade: gravá-la dispara `trg_update_last_activity_at`, que
  // escreve no lead e troca o `updated_at` de novo. Relido antes, a resposta
  // levava um `updated_at` já vencido e o próximo arrastar do mesmo card caía
  // na OCC com 409 "modificado por outro usuário" (issue #916).
  const { data: fresh } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  const finalLead = fresh ?? lead;

  // Emit domain event (fire-and-forget; trigger NEVER does HTTP — workers do).
  await supabase
    .rpc("emit_event", {
      p_event_type: "lead.stage_changed",
      p_entity_kind: "crm_lead",
      p_entity_id: leadId,
      p_payload: {
        from_stage_id: lead.stage_id,
        to_stage_id: input.stage_id,
        position_in_stage: posicao,
        status: finalLead.status,
        ...(entreFunis ? { from_pipeline_id: funilDeOrigem!.id, to_pipeline_id: stage.pipeline_id } : {}),
      },
      p_metadata: { request_id: requestId, actor_user_id: user.id },
      p_organization_id: lead.organization_id,
    })
    .then(({ error }) => {
      if (error) console.error("[lead.move] emit_event failed", error.message);
    });

  await audit({
    action: "lead.moved",
    actorUserId: user.id,
    organizationId: lead.organization_id,
    resourceType: "crm_lead",
    resourceId: leadId,
    requestId,
    metadata: {
      from_stage_id: lead.stage_id,
      to_stage_id: input.stage_id,
      position_in_stage: posicao,
      ...(entreFunis ? { from_pipeline_id: funilDeOrigem!.id, to_pipeline_id: stage.pipeline_id } : {}),
    },
  });

  return ok(finalLead, { requestId });
}
