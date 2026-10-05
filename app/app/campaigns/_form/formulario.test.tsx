import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/campanhas/useCampanhas", () => ({ usePreviaDaAudiencia: () => ({ mutate: vi.fn(), isPending: false, data: undefined }) }));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [{ id: "c1", display_name: "Principal" }] }),
  channelLabel: (c: { display_name: string }) => c.display_name,
}));
vi.mock("@/hooks/campanhas/useDestinoDaCampanha", () => ({
  useFunis: () => ({ data: [{ id: "f1", name: "Vendas" }] }),
  useEtapas: () => ({ data: [{ id: "e1", name: "Entrada", is_won: false, is_lost: false }] }),
  useAgentesPublicados: () => ({ data: [] }),
  useCrms: () => ({ data: [{ id: "k1", name: "Comercial", is_default: true }] }),
  useVariaveisDaOrganizacao: () => ({ data: [] }),
}));

import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";
import { FormularioDaCampanha } from "./FormularioDaCampanha";
import { corpoDaCampanha, valoresDaCampanha } from "./valores";

const salva = {
  id: "x",
  name: "Reativação",
  channel_session_id: "c1",
  channel_session_ids: ["c2"],
  base_legal: "consent",
  lia_ref: null,
  message_body: "Oi {primeiro_nome}",
  audience_filter: { com_alguma_tag: ["vip"], funis: ["f1"], etapas: ["e1"], sem_interacao_ha_dias: 30, limite: 200 },
  pipeline_id: "f1",
  stage_id: "e1",
  agent_id: null,
  intervalo_segundos: 120,
  janela_inicio_hora: 9,
  janela_fim_hora: 18,
  teto_diario: 50,
  teto_horario: null,
} as unknown as CampanhaDetalhada;

describe("formulário único de campanha", () => {
  it("editar e salvar DEVOLVE os mesmos filtros, ritmo e números (antes o editar apagava funil/etapa)", () => {
    const corpo = corpoDaCampanha(valoresDaCampanha(salva));
    expect(corpo.audience_filter).toEqual({
      fonte: "crm",
      campos: [],
      entrou_de: null,
      entrou_ate: null,
      com_alguma_tag: ["vip"],
      sem_tags: [],
      sem_interacao_ha_dias: 30,
      funis: ["f1"],
      etapas: ["e1"],
      limite: 200,
    });
    expect(corpo).toMatchObject({
      intervalo_segundos: 120,
      // 9018: a janela volta em minutos (09:00–18:00) e a de horas é zerada.
      janela_inicio_minuto: 540,
      janela_fim_minuto: 1080,
      janela_inicio_hora: null,
      janela_fim_hora: null,
      scheduled_at: null,
      teto_diario: 50,
      teto_horario: null,
      channel_session_ids: ["c2"],
      pipeline_id: "f1",
      stage_id: "e1",
    });
  });

  it("carrega os valores da campanha e salva pelo callback", () => {
    const onSalvar = vi.fn();
    render(
      <FormularioDaCampanha
        titulo="Editar campanha"
        subtitulo=""
        inicial={valoresDaCampanha(salva)}
        salvando={false}
        rotuloDoSalvar="Salvar alterações"
        onSalvar={onSalvar}
        onCancelar={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("Reativação")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("salvar-campanha"));
    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ name: "Reativação", message_body: "Oi {primeiro_nome}" }));
  });
});
