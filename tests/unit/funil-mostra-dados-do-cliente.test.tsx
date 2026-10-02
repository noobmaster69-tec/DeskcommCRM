/**
 * O FUNIL MOSTRA OS DADOS DO CLIENTE — telefone, e-mail e links (Instagram, site,
 * Google Meu Negócio…) nas abas do dossiê. O card compacto (estilo Leona) mostra
 * só o telefone; e-mail e links saíram dele junto com o `ContatoNoCard`.
 *
 * Garantias que um teste só de "renderiza" não daria:
 *
 *  1. salvar links troca o `custom_fields` INTEIRO (o PATCH substitui o objeto),
 *     então o que não é link tem que ir junto — perder um campo personalizado da
 *     organização ao salvar um Instagram seria o pior tipo de defeito: silencioso;
 *  2. o card lê os dados do QUADRO, não do contato: salvar sem reler o quadro
 *     parece "não fez nada" onde a pessoa mais olha.
 *
 * Mais a fiação, lida da fonte (a mesma técnica dos irmãos deste diretório): a
 * rota lê os dados do contato na MESMA consulta dos marcadores, o card mostra o
 * telefone e o dossiê renderiza as abas.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useContact = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/contacts/useContact", () => ({ useContact }));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  chaveDoQuadro: (pipelineId: string | null) => ["kanban-board", pipelineId],
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { ContatoDoNegocio } from "@/components/kanban/ContatoDoNegocio";

const RAIZ = process.cwd();
const fonte = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8");

function comQuery(ui: ReactNode, cliente = new QueryClient()) {
  return { cliente, ...render(<QueryClientProvider client={cliente}>{ui}</QueryClientProvider>) };
}

const CONTATO = {
  id: "c-1",
  name: "Ana Souza",
  display_name: null,
  email: "ana@exemplo.com",
  phone_number: "+5511999998888",
  updated_at: "2026-09-19T10:00:00Z",
  custom_fields: { cor_favorita: "azul", link_instagram: "instagram.com/loja" } as Record<string, unknown>,
};

beforeEach(() => {
  vi.clearAllMocks();
  useContact.mockReturnValue({ data: { data: CONTATO }, isLoading: false, isError: false });
  mutateAsync.mockResolvedValue({ data: CONTATO });
});

afterEach(cleanup);

describe("ContatoDoNegocio — as abas do dossiê", () => {
  it("negócio sem contato vinculado avisa, sem consultar nada", () => {
    comQuery(<ContatoDoNegocio contactId={null} pipelineId="p-1" />);

    expect(screen.getByText("Este negócio não tem contato vinculado.")).toBeInTheDocument();
    expect(useContact).not.toHaveBeenCalled();
  });

  it("aba Dados: nome, telefone com atalho do WhatsApp, e-mail e a ficha completa", () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("+5511999998888")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511999998888",
    );
    expect(screen.getByRole("link", { name: "ana@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:ana@exemplo.com",
    );
    expect(screen.getByRole("link", { name: "Ver ficha completa do contato" })).toHaveAttribute(
      "href",
      "/app/contacts/c-1",
    );
  });

  function abrirAbaDeLinks() {
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Links" }), { button: 0 });
    return screen.getByTestId("formulario-de-links");
  }

  it("aba Links: vem preenchida com o que está gravado no contato", () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const formulario = abrirAbaDeLinks();

    expect(within(formulario).getByLabelText("Instagram")).toHaveValue("instagram.com/loja");
    expect(within(formulario).getByLabelText("Site")).toHaveValue("");
    // todos os tipos do catálogo aparecem, inclusive "Google Meu Negócio" e "Outro"
    expect(within(formulario).getByLabelText("Google Meu Negócio")).toBeInTheDocument();
    expect(within(formulario).getByLabelText("Outro")).toBeInTheDocument();
  });

  it("⭐ salvar manda o custom_fields COMPLETO e relê o quadro do funil", async () => {
    const { cliente } = comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const invalidar = vi.spyOn(cliente, "invalidateQueries");
    const formulario = abrirAbaDeLinks();

    fireEvent.change(within(formulario).getByLabelText("Site"), {
      target: { value: "exemplo.com.br" },
    });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar links" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      custom_fields: {
        cor_favorita: "azul", // o campo que NÃO é link sobrevive ao PATCH
        link_instagram: "instagram.com/loja",
        link_site: "exemplo.com.br",
      },
    });
    await waitFor(() =>
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ["kanban-board", "p-1"] }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Links salvos."));
  });

  it("apagar o texto de um link remove a chave, em vez de gravar string vazia", async () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const formulario = abrirAbaDeLinks();

    fireEvent.change(within(formulario).getByLabelText("Instagram"), { target: { value: "" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar links" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ custom_fields: { cor_favorita: "azul" } });
  });

  it("⭐ endereço inválido bloqueia o salvamento e marca o campo", async () => {
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);
    const formulario = abrirAbaDeLinks();

    fireEvent.change(within(formulario).getByLabelText("Site"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(within(formulario).getByRole("button", { name: "Salvar links" }));

    expect(await within(formulario).findByText("Endereço inválido.")).toBeInTheDocument();
    expect(within(formulario).getByLabelText("Site")).toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("enquanto o contato carrega, mostra o estado de carregamento", () => {
    useContact.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("falha ao carregar o contato é dita, não silenciada", () => {
    useContact.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    comQuery(<ContatoDoNegocio contactId="c-1" pipelineId="p-1" />);

    expect(screen.getByText("Não consegui carregar o contato.")).toBeInTheDocument();
  });
});

describe("a fiação — quem usa a regra a chama", () => {
  it("⭐ a rota lê o dado do contato na MESMA consulta dos marcadores e o aplica nos leads", () => {
    const rota = fonte("app/api/v1/pipelines/[id]/board/route.ts");
    const inicio = rota.indexOf("async function withMarcadoresDoContato");
    const fim = rota.indexOf("async function withNextActions");
    expect(inicio, "a etapa dos marcadores sumiu da rota").toBeGreaterThan(-1);
    const etapa = rota.slice(inicio, fim);

    // `display_name` e `avatar_storage_path`: a foto e o nome do WhatsApp do
    // topo do card (estilo Kommo) saem desta MESMA leitura.
    expect(etapa, "a consulta não traz telefone, e-mail, custom_fields, nome do WhatsApp e foto").toMatch(
      /\.select\(\s*"id, tags, phone_number, email, custom_fields, is_anonymized, display_name, avatar_storage_path"\s*\)/,
    );
    expect(etapa, "anexarDadosDoContato não é chamada na etapa").toMatch(
      /anexarDadosDoContato\(\s*leadsDoQuadro,\s*linhas\s*\)/,
    );
    // sem etapa nova na cadeia: `funil-filtro-de-tag-le-as-duas-caixas` e
    // `kanban-atalho-conversa` vigiam withConversas → withMarcadoresDoContato → resposta
    expect(rota).toMatch(/leads:\s*leadsComMarcadores\.leads/);
  });

  it("o card mostra o telefone e o dossiê renderiza as abas", () => {
    expect(fonte("components/kanban/KanbanCard.tsx")).toMatch(/phoneForDisplay\(lead\.contact_phone\)/);
    expect(fonte("components/kanban/LeadDossier.tsx")).toMatch(
      /<ContatoDoNegocio\s+contactId=\{lead\.contact_id\}\s+pipelineId=\{pipelineId\}/,
    );
  });
});
