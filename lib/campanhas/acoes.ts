/**
 * As AÇÕES da campanha — preparar, iniciar, agendar, pausar, retomar, cancelar,
 * duplicar e testar.
 *
 * Moram aqui, e não em oito rotas, porque as oito fazem a mesma coisa em volta:
 * carregar a campanha da organização certa, perguntar à máquina de estados se a
 * transição vale, escrever, auditar. Espalhado, esse "em volta" diverge — e o
 * dia em que uma rota esquecer de conferir o estado é o dia em que uma campanha
 * cancelada volta a enviar.
 *
 * Cada função devolve `{ ok: false, codigo, mensagem, status }` em vez de lançar:
 * a rota traduz para `fail()` sem interpretar exceção, e o motivo chega ao
 * operador com o texto real (Regra nº 1).
 */
import { inscreverNoFluxo } from "@/lib/fluxos/disparar";
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiErrorCode } from "@/lib/api/errors";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";

import { baseLegalValida, consentiuMarketing, motivoParaExcluir, recusouMarketing } from "./elegibilidade";
import { ehStatusDaCampanha, podeTransitar } from "./maquina-de-estados";
import { prepararCampanha } from "./preparacao";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { renderizar } from "./renderizador";
import type { StatusDaCampanha } from "./tipos";

export interface CampanhaCarregada {
  id: string;
  organization_id: string;
  name: string;
  status: StatusDaCampanha;
  channel_session_id: string;
  message_body: string | null;
  base_legal: string;
  lia_ref: string | null;
  audience_filter: unknown;
  audience_version: number;
  content_version: number;
  scheduled_at: string | null;
  intervalo_segundos: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  teto_diario: number | null;
  teto_horario: number | null;
  description: string | null;
  /** Item 4 (9014): `flow` inscreve cada contato no fluxo `flow_id` em vez de mandar o texto. */
  mode: "text" | "flow";
  flow_id: string | null;
  /** Item 7 / 9018 / 3: o resto do que uma cópia tem de herdar. */
  timezone?: string | null;
  min_interval_seconds?: number | null;
  max_interval_seconds?: number | null;
  janela_inicio_minuto?: number | null;
  janela_fim_minuto?: number | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  agent_id?: string | null;
  recipients_pipeline_id?: string | null;
  recipients_stage_id?: string | null;
}

export type Recusa = { ok: false; codigo: ApiErrorCode; mensagem: string; status: number };
export type Desfecho<T = unknown> = ({ ok: true } & T) | Recusa;

const COLUNAS =
  "id, organization_id, name, status, channel_session_id, message_body, base_legal, lia_ref, " +
  "audience_filter, audience_version, content_version, scheduled_at, description, " +
  "intervalo_segundos, janela_inicio_hora, janela_fim_hora, teto_diario, teto_horario, mode, flow_id, " +
  "timezone, min_interval_seconds, max_interval_seconds, janela_inicio_minuto, janela_fim_minuto, " +
  "pipeline_id, stage_id, agent_id, recipients_pipeline_id, recipients_stage_id";

export async function carregarCampanha(
  admin: SupabaseClient,
  organizationId: string,
  campanhaId: string,
): Promise<Desfecho<{ campanha: CampanhaCarregada }>> {
  const { data } = await admin
    .from("campaigns")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      codigo: "campanha_nao_encontrada",
      mensagem: "Campanha não encontrada.",
      status: 404,
    };
  }
  const campanha = data as unknown as CampanhaCarregada;
  if (!ehStatusDaCampanha(campanha.status)) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: `A campanha está num estado que este sistema não conhece ("${campanha.status}").`,
      status: 409,
    };
  }
  return { ok: true, campanha };
}

function recusaDeTransicao(de: StatusDaCampanha, para: StatusDaCampanha): Recusa | null {
  const r = podeTransitar(de, para);
  return r.pode ? null : { ok: false, codigo: "campanha_estado_invalido", mensagem: r.motivo, status: 409 };
}

/** O que toda campanha precisa ter antes de qualquer envio — inclusive o de teste. */
function faltaParaEnviar(c: CampanhaCarregada): Recusa | null {
  if (c.mode === "flow") {
    if (!c.flow_id) {
      return {
        ok: false,
        codigo: "campanha_conteudo_invalido",
        mensagem: "Escolha o fluxo que a campanha vai iniciar.",
        status: 422,
      };
    }
  } else if ((c.message_body ?? "").trim() === "") {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: "Escreva a mensagem antes de preparar a campanha.",
      status: 422,
    };
  }
  if (!baseLegalValida({ baseLegal: c.base_legal, liaRef: c.lia_ref })) {
    return {
      ok: false,
      codigo: "campanha_base_legal_invalida",
      mensagem:
        "Interesse legítimo exige a referência da avaliação (LIA). Sem ela não há como responder " +
        "a quem perguntar com base em quê recebeu a mensagem.",
      status: 422,
    };
  }
  return null;
}

/**
 * Item 4: o fluxo da campanha está PUBLICADO e ativo? Conferido no preparar, no
 * iniciar e no teste — o motor só roda versão publicada, e uma campanha que
 * inscreve em fluxo pausado deixaria a lista inteira parada sem aviso.
 */
async function fluxoPronto(admin: SupabaseClient, c: CampanhaCarregada): Promise<Recusa | null> {
  if (c.mode !== "flow" || !c.flow_id) return null;
  const { data } = await admin
    .from("followup_flow_pointers")
    .select("status, active_version_id, archived_at")
    .eq("organization_id", c.organization_id)
    .eq("id", c.flow_id)
    .eq("surface", "fluxo")
    .maybeSingle();
  const f = data as { status: string; active_version_id: string | null; archived_at: string | null } | null;
  if (!f || f.status !== "active" || !f.active_version_id || f.archived_at) {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: "O fluxo escolhido não está publicado e ativo. Publique-o em Fluxos antes.",
      status: 422,
    };
  }
  return null;
}

/** Já saiu alguma mensagem desta campanha? Reconstruir snapshot depois disso é proibido. */
async function jaEnviou(admin: SupabaseClient, campanhaId: string): Promise<boolean> {
  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campanhaId)
    .not("sent_at", "is", null);
  return (count ?? 0) > 0;
}

export async function prepararAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ resumo: { total: number; elegiveis: number; excluidos: number } }>> {
  const recusa = recusaDeTransicao(c.status, "preparing") ?? faltaParaEnviar(c) ?? (await fluxoPronto(admin, c));
  if (recusa) return recusa;
  if (await jaEnviou(admin, c.id)) {
    return {
      ok: false,
      codigo: "campanha_nao_editavel",
      mensagem: "Esta campanha já enviou mensagens; refazer a lista mudaria o que já foi dito.",
      status: 409,
    };
  }

  // Compare-and-set: dois cliques simultâneos, e só um entra em `preparing`.
  const { data: entrou } = await admin
    .from("campaigns")
    .update({ status: "preparing" })
    .eq("id", c.id)
    .eq("status", "draft")
    .select("id");
  if ((entrou ?? []).length === 0) {
    return {
      ok: false,
      codigo: "campanha_preparando",
      mensagem: "A preparação desta campanha já está em andamento.",
      status: 409,
    };
  }

  try {
    const resumo = await prepararCampanha(admin, {
      campanhaId: c.id,
      organizationId: c.organization_id,
      filtro: c.audience_filter,
      // Modo fluxo não tem texto: o corpo vazio não exige variável nenhuma.
      corpo: c.mode === "flow" ? "" : (c.message_body ?? ""),
      contentVersion: c.content_version,
      exigeConsentimento: c.base_legal === "consent",
      agora,
    });
    if (resumo.total === 0) {
      await voltarAoRascunho(admin, c.id, "audiencia_vazia");
      return {
        ok: false,
        codigo: "campanha_sem_audiencia",
        mensagem: "O recorte não encontrou nenhum contato. Ajuste o filtro.",
        status: 422,
      };
    }
    if (resumo.elegiveis === 0) {
      await voltarAoRascunho(admin, c.id, "sem_elegiveis");
      return {
        ok: false,
        codigo: "campanha_sem_elegiveis",
        mensagem:
          "O recorte encontrou contatos, mas nenhum pode receber — veja os motivos na prévia.",
        status: 422,
      };
    }

    await admin
      .from("campaigns")
      .update({
        status: "ready",
        prepared_at: agora.toISOString(),
        snapshot_total: resumo.total,
        snapshot_eligible: resumo.elegiveis,
        snapshot_excluded: resumo.excluidos,
        audience_version: c.audience_version + 1,
      })
      .eq("id", c.id)
      .eq("status", "preparing");

    return { ok: true, resumo };
  } catch (err) {
    // A campanha não pode ficar presa em `preparing`: quem tentou preparar
    // precisa poder corrigir o filtro e tentar de novo.
    await voltarAoRascunho(admin, c.id, "erro_na_preparacao");
    return {
      ok: false,
      codigo: "campanha_sem_audiencia",
      mensagem: err instanceof Error ? err.message : String(err),
      status: 422,
    };
  }
}

async function voltarAoRascunho(admin: SupabaseClient, id: string, codigo: string): Promise<void> {
  await admin
    .from("campaigns")
    .update({ status: "draft", failure_code: codigo })
    .eq("id", id)
    .eq("status", "preparing");
}

export async function iniciarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ retomada: boolean }>> {
  const recusa = recusaDeTransicao(c.status, "running") ?? faltaParaEnviar(c) ?? (await fluxoPronto(admin, c));
  if (recusa) return recusa;

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", c.id)
    .eq("eligibility_status", "eligible");
  if ((count ?? 0) === 0) {
    return {
      ok: false,
      codigo: "campanha_sem_elegiveis",
      mensagem: "Nenhum destinatário elegível. Prepare a campanha antes de iniciar.",
      status: 422,
    };
  }

  const retomada = c.status === "paused";
  const { data } = await admin
    .from("campaigns")
    .update({
      status: "running",
      started_at: agora.toISOString(),
      paused_at: null,
      scheduled_at: null,
    })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  return { ok: true, retomada };
}

export async function agendarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  quando: Date,
  agora: Date,
  fuso?: string,
): Promise<Desfecho> {
  const recusa = recusaDeTransicao(c.status, "scheduled") ?? faltaParaEnviar(c);
  if (recusa) return recusa;
  if (quando.getTime() <= agora.getTime()) {
    return {
      ok: false,
      codigo: "campanha_agenda_invalida",
      mensagem: "Escolha uma data no futuro — para enviar agora, use Iniciar.",
      status: 422,
    };
  }
  const { data } = await admin
    .from("campaigns")
    .update({
      status: "scheduled",
      scheduled_at: quando.toISOString(),
      paused_at: null,
      // O fuso em que a data foi escolhida — a tela mostra "03/12/2026 12:00 em
      // Portugal" igual ao que foi digitado. O instante é o UTC, sempre.
      ...(fuso ? { timezone: fuso } : {}),
    })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  return { ok: true };
}

export async function pausarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho> {
  const recusa = recusaDeTransicao(c.status, "paused");
  if (recusa) return recusa;
  const { data } = await admin
    .from("campaigns")
    .update({ status: "paused", paused_at: agora.toISOString() })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  // Quem já estava `sending` NÃO é desfeito: a mensagem pode estar na borda
  // externa neste instante, e prometer cancelamento do que já saiu é mentir.
  return { ok: true };
}

export async function cancelarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ cancelados: number }>> {
  const recusa = recusaDeTransicao(c.status, "cancelled");
  if (recusa) return recusa;
  const { data } = await admin
    .from("campaigns")
    .update({ status: "cancelled", cancelled_at: agora.toISOString() })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();

  // A campanha já está cancelada quando esta linha roda: a rodada não escolhe
  // mais esta campanha, então não há corrida com o worker por estes pendentes.
  const { data: cancelados } = await admin
    .from("campaign_recipients")
    .update({ status: "cancelled", cancelled_at: agora.toISOString() })
    .eq("campaign_id", c.id)
    .in("status", ["pending", "queued"])
    .select("id");
  return { ok: true, cancelados: (cancelados ?? []).length };
}

export async function duplicarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  autorId: string,
): Promise<Desfecho<{ id: string }>> {
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      organization_id: c.organization_id,
      name: `${c.name} (cópia)`.slice(0, 160),
      description: c.description,
      channel_session_id: c.channel_session_id,
      message_body: c.message_body,
      base_legal: c.base_legal,
      lia_ref: c.lia_ref,
      audience_filter: c.audience_filter,
      intervalo_segundos: c.intervalo_segundos,
      janela_inicio_hora: c.janela_inicio_hora,
      janela_fim_hora: c.janela_fim_hora,
      teto_diario: c.teto_diario,
      teto_horario: c.teto_horario,
      // A cópia herda TUDO o que é configuração (modo, fluxo, ritmo sorteado,
      // fuso, janela em minutos, funil/etapa e agente) — antes perdia os itens
      // 3, 4 e 7 e voltava ao texto simples de 60–180s sem funil.
      mode: c.mode ?? "text",
      flow_id: c.flow_id ?? null,
      timezone: c.timezone ?? null,
      min_interval_seconds: c.min_interval_seconds ?? 60,
      max_interval_seconds: c.max_interval_seconds ?? 180,
      janela_inicio_minuto: c.janela_inicio_minuto ?? null,
      janela_fim_minuto: c.janela_fim_minuto ?? null,
      pipeline_id: c.pipeline_id ?? null,
      stage_id: c.stage_id ?? null,
      agent_id: c.agent_id ?? null,
      recipients_pipeline_id: c.recipients_pipeline_id ?? null,
      recipients_stage_id: c.recipients_stage_id ?? null,
      created_by: autorId,
      // Nada de destinatário, resultado, agenda ou carimbo de execução: a cópia
      // é uma INTENÇÃO nova, e herdar números faria a tela mostrar entrega de
      // mensagem que esta campanha nunca mandou.
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: error?.message ?? "Não foi possível duplicar a campanha.",
      status: 422,
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * O teste: a MESMA conexão, o MESMO renderizador, a MESMA camada de envio.
 *
 * Um teste que passasse por outro caminho provaria o outro caminho. E ele não
 * toca nos contadores da execução oficial — não cria destinatário, não gasta
 * fila —, mas gasta o ritmo do número, porque para o WhatsApp é uma mensagem
 * como qualquer outra.
 */
export async function testarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  contactId: string,
  agora: Date,
  fuso: string,
): Promise<Desfecho<{ status: string }>> {
  const recusa = faltaParaEnviar(c) ?? (await fluxoPronto(admin, c));
  if (recusa) return recusa;

  const { data: contato } = await admin
    .from("contacts")
    .select("id, name, display_name, phone_number, is_blocked, is_anonymized, consent")
    .eq("organization_id", c.organization_id)
    .eq("id", contactId)
    .maybeSingle();
  if (!contato) {
    return {
      ok: false,
      codigo: "campanha_nao_encontrada",
      mensagem: "Contato de teste não encontrado nesta organização.",
      status: 404,
    };
  }
  const linha = contato as {
    id: string;
    name: string | null;
    display_name: string | null;
    phone_number: string | null;
    is_blocked: boolean;
    is_anonymized: boolean;
    consent: unknown;
  };

  // O teste respeita os MESMOS vetos: mandar teste para quem pediu para parar
  // seria furar o opt-out pela porta dos fundos.
  const motivo = motivoParaExcluir({
    contactId: linha.id,
    telefone: linha.phone_number,
    bloqueado: linha.is_blocked,
    anonimizado: linha.is_anonymized,
    recusouMarketing: recusouMarketing(linha.consent),
    consentiu: consentiuMarketing(linha.consent),
  }, { exigeConsentimento: c.base_legal === "consent" });
  if (motivo) {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: `Este contato não pode receber: ${motivo}.`,
      status: 422,
    };
  }

  // Item 4: o teste de campanha em modo fluxo inscreve ESTE contato no fluxo.
  if (c.mode === "flow" && c.flow_id) {
    const boundaryDoTeste = await beginServiceAtOrigin(admin, c.organization_id, linha.id, c.channel_session_id);
    const r = await inscreverNoFluxo(admin, {
      organizationId: c.organization_id,
      fluxoId: c.flow_id,
      contactId: linha.id,
      conversationId: boundaryDoTeste.conversation_id,
      origem: { origem: "campanha_teste", campaign_id: c.id },
    });
    if (!r.ok) {
      return {
        ok: false,
        codigo: "campanha_conteudo_invalido",
        mensagem:
          r.codigo === "ja_em_outro_fluxo"
            ? `Este contato já está num fluxo${r.detalhe ? ` («${r.detalhe}»)` : ""}. Escolha outro para o teste.`
            : "Não foi possível colocar o contato de teste no fluxo.",
        status: 422,
      };
    }
    return { ok: true, status: "em_fluxo" };
  }

  const render = renderizar(
    c.message_body ?? "",
    { nome: nomeDoContato(linha) },
    { agora, fuso },
  );
  if (render.faltando.length > 0) {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: `Falta ${render.faltando.join(", ")} no cadastro deste contato — escolha outro para o teste.`,
      status: 422,
    };
  }

  const boundary = await beginServiceAtOrigin(admin, c.organization_id, linha.id, c.channel_session_id);
  const mensagem = await sendMessageHandler(
    admin,
    {
      organization_id: c.organization_id,
      serviceBoundary: boundary,
      proactiveContext: { organizationId: c.organization_id, contactId: linha.id },
      actor: { type: "webhook_source", id: `campaign-test:${c.id}` },
      requestId: `campaign-test:${c.id}:${randomUUID()}`,
    } as Parameters<typeof sendMessageHandler>[1],
    {
      conversation_id: boundary.conversation_id,
      type: "text",
      body: render.texto,
      metadata: { source: "campaign_test", campaign_id: c.id },
    } as Parameters<typeof sendMessageHandler>[2],
  );

  const status = (mensagem as { status?: string }).status ?? "desconhecido";
  if (status === "failed") {
    return {
      ok: false,
      codigo: "campanha_canal_indisponivel",
      mensagem: "O envio de teste falhou no canal. Verifique a conexão antes de iniciar a campanha.",
      status: 409,
    };
  }
  return { ok: true, status };
}

function conflitoDeCorrida(): Recusa {
  return {
    ok: false,
    codigo: "campanha_estado_invalido",
    mensagem: "O estado da campanha mudou enquanto esta ação era processada. Recarregue a tela.",
    status: 409,
  };
}
