"use client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { Archive, CaretDown, CaretUp, Trash } from "@/lib/ui/icons";

import { PaletaDeCores } from "./PaletaDeCores";
import { CorDoFunil, type FunilDoSeletor } from "./CorDoFunil";

type Pedido =
  | { tipo: "editar"; id: string; patch: { name?: string; color?: string | null; depois_de?: string | null } }
  | { tipo: "arquivar"; id: string }
  | { tipo: "excluir"; id: string };

/**
 * "Gerenciar funis": os funis do CRM na ordem do seletor — renomear, trocar a
 * cor, reordenar, arquivar e excluir.
 *
 * ⚠️ AS REGRAS SÃO DA API (`lib/pipelines/pipeline-editing.ts`): o funil
 * principal não se arquiva, não se exclui e não muda de CRM; excluir de verdade
 * só passa no funil sem negócio, sem formulário e sem automação — com qualquer
 * um deles a rota recusa e manda arquivar. A recusa chega com a frase pronta e
 * aparece na linha do funil. O que o modal faz sozinho é não OFERECER arquivar
 * e excluir no principal.
 *
 * Depois de cada mudança a página relê os funis do servidor (`router.refresh`):
 * o seletor vem do carregamento da página, e espelhar o pedido aqui divergiria
 * do que o banco gravou.
 */
export function GerenciarFunisDialog({
  open,
  onOpenChange,
  funis,
  pipelineAtualId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funis: FunilDoSeletor[];
  pipelineAtualId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);
  const [paletaAberta, setPaletaAberta] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);

  const mudar = useMutation({
    mutationFn: (p: Pedido) => {
      const rota = `/api/v1/pipelines/${encodeURIComponent(p.id)}`;
      if (p.tipo === "editar") return apiClient.patch<unknown>(rota, p.patch);
      return apiClient.delete<unknown>(p.tipo === "excluir" ? `${rota}?definitivo=1` : rota);
    },
  });

  function aplicar(p: Pedido, sucesso: string) {
    setErro(null);
    mudar.mutate(p, {
      onSuccess: () => {
        toast.success(sucesso);
        setConfirmandoExclusao(null);
        // O funil aberto saiu da lista: o quadro vai para o principal do CRM.
        if (p.tipo !== "editar" && p.id === pipelineAtualId) {
          const principal = funis.find((f) => f.is_primary && f.id !== p.id);
          onOpenChange(false);
          if (principal) {
            router.push(`/app/pipelines/${principal.id}`);
            return;
          }
        }
        router.refresh();
      },
      onError: (e) =>
        setErro({
          id: p.id,
          texto:
            e instanceof ApiError && (e.status === 409 || e.status === 422)
              ? t(e.message)
              : t("Não deu para salvar agora. Tente de novo em instantes."),
        }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="gerenciar-funis-dialog">
        <DialogHeader>
          <DialogTitle>{t("Gerenciar funis")}</DialogTitle>
          <DialogDescription>
            {t("Os funis deste CRM, na ordem do seletor. O funil principal tem a Etapa de entrada e não se arquiva.")}
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border rounded-md border border-border">
          {funis.map((f, i) => (
            <li key={`${f.id}:${f.name}:${f.color ?? ""}`} className="space-y-2 p-3" data-testid={`gerenciar-${f.id}`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaletaAberta(paletaAberta === f.id ? null : f.id)}
                  className="rounded-full p-1 hover:bg-surface"
                  aria-label={`${t("Cor de")} «${f.name}»`}
                  data-testid={`cor-do-funil-${f.id}`}
                >
                  <CorDoFunil cor={f.color} className="h-3.5 w-3.5" />
                </button>
                <NomeDoFunil
                  nome={f.name}
                  desabilitado={mudar.isPending}
                  onConfirmar={(nome) =>
                    aplicar({ tipo: "editar", id: f.id, patch: { name: nome } }, t("Funil renomeado."))
                  }
                />
                {f.is_primary && (
                  <span className="rounded-sm bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    {t("Principal")}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === 0 || mudar.isPending}
                  aria-label={`${t("Subir")} «${f.name}»`}
                  data-testid={`subir-funil-${f.id}`}
                  onClick={() =>
                    aplicar({ tipo: "editar", id: f.id, patch: { depois_de: funis[i - 2]?.id ?? null } }, t("Ordem atualizada."))
                  }
                >
                  <CaretUp size={16} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === funis.length - 1 || mudar.isPending}
                  aria-label={`${t("Descer")} «${f.name}»`}
                  data-testid={`descer-funil-${f.id}`}
                  onClick={() =>
                    aplicar({ tipo: "editar", id: f.id, patch: { depois_de: funis[i + 1]!.id } }, t("Ordem atualizada."))
                  }
                >
                  <CaretDown size={16} aria-hidden />
                </Button>
                {!f.is_primary && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={mudar.isPending}
                      aria-label={`${t("Arquivar")} «${f.name}»`}
                      title={t("Arquivar")}
                      data-testid={`arquivar-funil-${f.id}`}
                      onClick={() => aplicar({ tipo: "arquivar", id: f.id }, `«${f.name}» ${t("foi arquivado.")}`)}
                    >
                      <Archive size={16} aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={mudar.isPending}
                      aria-label={`${t("Excluir")} «${f.name}»`}
                      title={t("Excluir")}
                      className="text-destructive"
                      data-testid={`excluir-funil-${f.id}`}
                      onClick={() => setConfirmandoExclusao(confirmandoExclusao === f.id ? null : f.id)}
                    >
                      <Trash size={16} aria-hidden />
                    </Button>
                  </>
                )}
              </div>

              {paletaAberta === f.id && (
                <PaletaDeCores
                  valor={f.color}
                  prefixo={`funil-${f.id}`}
                  onChange={(cor) => {
                    setPaletaAberta(null);
                    if (cor !== f.color) aplicar({ tipo: "editar", id: f.id, patch: { color: cor } }, t("Cor atualizada."));
                  }}
                />
              )}

              {confirmandoExclusao === f.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
                  <span className="flex-1">
                    {t("Excluir apaga o funil de vez. Só funciona em funil sem negócio, formulário ou automação.")}
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={mudar.isPending}
                    data-testid={`confirmar-excluir-funil-${f.id}`}
                    onClick={() => aplicar({ tipo: "excluir", id: f.id }, `«${f.name}» ${t("foi excluído.")}`)}
                  >
                    {t("Excluir de vez")}
                  </Button>
                </div>
              )}

              {erro?.id === f.id && (
                <p className="text-sm text-destructive" role="alert" data-testid={`erro-funil-${f.id}`}>
                  {erro.texto}
                </p>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** O nome editado no lugar: salva ao confirmar (Enter ou sair do campo), nunca a cada tecla. */
function NomeDoFunil({
  nome,
  desabilitado,
  onConfirmar,
}: {
  nome: string;
  desabilitado: boolean;
  onConfirmar: (nome: string) => void;
}) {
  const t = useT();
  const [rascunho, setRascunho] = useState(nome);
  return (
    <Input
      value={rascunho}
      maxLength={80}
      disabled={desabilitado}
      aria-label={`${t("Nome do funil")} «${nome}»`}
      className="h-8 min-w-0 flex-1"
      data-testid="nome-do-funil"
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        const limpo = rascunho.trim();
        if (!limpo || limpo === nome) {
          setRascunho(nome);
          return;
        }
        onConfirmar(limpo);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setRascunho(nome);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
