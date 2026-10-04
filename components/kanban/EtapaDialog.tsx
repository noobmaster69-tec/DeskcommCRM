"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import {
  useArquivarEtapaNoQuadro,
  useCriarEtapaNoQuadro,
  useEditarEtapaNoQuadro,
  type EdicaoDeEtapa,
} from "@/hooks/kanban/useEtapasDoQuadro";
import { ApiError } from "@/lib/api/types";
import type { Stage } from "@/lib/kanban/types";
import { PaletaDeCores } from "./PaletaDeCores";

interface EtapaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  /** As colunas vivas do funil, na ordem do quadro — para os avisos e os destinos. */
  stages: Stage[];
  /** `null` = criar uma coluna nova no fim; uma etapa = editar essa. */
  etapa: Stage | null;
}

/** A frase do servidor quando é recusa de regra; texto genérico no resto. */
function mensagemDaRecusa(e: unknown, t: (texto: string) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 409 || e.status === 422) return t(e.message);
    if (e.status === 403) return t("Você não tem permissão para mudar as colunas deste funil.");
  }
  return t("Não deu para salvar agora. Tente de novo em instantes.");
}

/**
 * "+ Nova etapa" e "editar coluna" do quadro, no formato do Kommo: nome, cor da
 * paleta pastel e as duas marcações de estágio final.
 *
 * ⚠️ AS REGRAS SÃO DA API (`lib/leads/stage-operations.ts`); AQUI SÓ HÁ
 * REFLEXO. O que o modal faz por conta própria é só o que ele pode saber antes
 * de perguntar: avisar que marcar o ganho aqui o tira de outra coluna, travar a
 * caixa da coluna que JÁ é o ganho (desmarcar sem substituta é recusado — o
 * funil precisa de onde fechar negócio) e não oferecer como destino dos cards
 * uma coluna de ganho ou perda (os daria por encerrados).
 *
 * "Excluir" ARQUIVA, como em Configurações: `crm_leads_stage_id_fkey` é
 * RESTRICT e o histórico dos negócios aponta para a coluna.
 */
export function EtapaDialog({ open, onOpenChange, pipelineId, stages, etapa }: EtapaDialogProps) {
  const t = useT();
  const criar = useCriarEtapaNoQuadro(pipelineId);
  const editar = useEditarEtapaNoQuadro(pipelineId);
  const arquivar = useArquivarEtapaNoQuadro(pipelineId);

  const [nome, setNome] = useState(etapa?.name ?? "");
  const [cor, setCor] = useState<string | null>(etapa?.color ?? null);
  const [ganho, setGanho] = useState(etapa?.is_won ?? false);
  const [perda, setPerda] = useState(etapa?.is_lost ?? false);
  const [erro, setErro] = useState<string | null>(null);
  /** `null` = não está excluindo; número = a coluna tem N cards e precisa de destino. */
  const [excluindo, setExcluindo] = useState<{ negocios: number | null } | null>(null);
  const [destino, setDestino] = useState<string | null>(null);

  const ocupado = criar.isPending || editar.isPending || arquivar.isPending;
  const outras = stages.filter((s) => s.id !== etapa?.id);
  const ganhoAtual = outras.find((s) => s.is_won) ?? null;
  const perdaAtual = outras.find((s) => s.is_lost) ?? null;
  const destinos = outras.filter((s) => !s.is_won && !s.is_lost);

  function salvar() {
    const limpo = nome.trim();
    if (!limpo) {
      setErro(t("Dê um nome à etapa — é o que aparece no topo da coluna."));
      return;
    }
    setErro(null);

    if (!etapa) {
      criar.mutate(
        { name: limpo, color: cor, ...(ganho ? { is_won: true } : {}), ...(perda ? { is_lost: true } : {}) },
        {
          onSuccess: () => {
            toast.success(`«${limpo}» ${t("entrou no fim do funil.")}`);
            onOpenChange(false);
          },
          onError: (e) => setErro(mensagemDaRecusa(e, t)),
        },
      );
      return;
    }

    // SÓ O QUE MUDOU VIAJA: mandar `is_lost: false` numa coluna que já não é de
    // perda faria a API validar uma desmarcação que ninguém pediu.
    const patch: EdicaoDeEtapa = {};
    if (limpo !== etapa.name) patch.name = limpo;
    if (cor !== (etapa.color ?? null)) patch.color = cor;
    if (ganho !== etapa.is_won) patch.is_won = ganho;
    if (perda !== etapa.is_lost) patch.is_lost = perda;
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    editar.mutate(
      { stageId: etapa.id, patch },
      {
        onSuccess: () => {
          toast.success(t("Etapa atualizada."));
          onOpenChange(false);
        },
        onError: (e) => setErro(mensagemDaRecusa(e, t)),
      },
    );
  }

  function excluir(destinoId: string | null) {
    if (!etapa) return;
    setErro(null);
    arquivar.mutate(
      { stageId: etapa.id, destinoId },
      {
        onSuccess: () => {
          toast.success(`«${etapa.name}» ${t("saiu do quadro.")}`);
          onOpenChange(false);
        },
        onError: (e) => {
          // Cards parados na coluna não é recusa final: é a pergunta "para onde
          // eles vão?" — e quem diz que é esse o caso é o servidor.
          const d = e instanceof ApiError ? (e.details as Record<string, unknown> | undefined) : undefined;
          if (d?.precisa_destino === true) {
            setExcluindo({ negocios: typeof d.negocios === "number" ? d.negocios : null });
            return;
          }
          setExcluindo(null);
          setErro(mensagemDaRecusa(e, t));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="etapa-dialog">
        <DialogHeader>
          <DialogTitle>{etapa ? t("Editar etapa") : t("Nova etapa")}</DialogTitle>
          <DialogDescription>
            {etapa
              ? t("Mude o nome, a cor ou o papel desta coluna do funil.")
              : t("A coluna nova entra no fim do funil, antes das etapas finais de ganho e perda.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="etapa-nome" className="text-sm font-medium">
              {t("Nome")} *
            </label>
            <Input
              id="etapa-nome"
              value={nome}
              maxLength={80}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              data-testid="etapa-nome"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Cor")}</legend>
            <PaletaDeCores valor={cor} onChange={setCor} prefixo="etapa" />
          </fieldset>

          <div className="space-y-3">
            <Marcacao
              id="etapa-ganho"
              rotulo={t("Marcar como estágio final de ganho")}
              marcada={ganho}
              travada={etapa?.is_won === true}
              aviso={
                etapa?.is_won
                  ? t("Esta é a etapa de ganho do funil. Para mudar, marque outra coluna como ganho.")
                  : ganho && ganhoAtual
                    ? `${t("Só uma coluna pode ser a de ganho. Marcar esta desmarca")} «${ganhoAtual.name}».`
                    : null
              }
              onChange={(v) => {
                setGanho(v);
                if (v) setPerda(false);
              }}
            />
            <Marcacao
              id="etapa-perda"
              rotulo={t("Marcar como estágio final de perda")}
              marcada={perda}
              travada={etapa?.is_lost === true}
              aviso={
                etapa?.is_lost
                  ? t("Esta é a etapa de perda do funil. Para mudar, marque outra coluna como perda.")
                  : perda && perdaAtual
                    ? `${t("Só uma coluna pode ser a de perda. Marcar esta desmarca")} «${perdaAtual.name}».`
                    : null
              }
              onChange={(v) => {
                setPerda(v);
                if (v) setGanho(false);
              }}
            />
          </div>

          {erro && (
            <p className="text-sm text-destructive" role="alert" data-testid="etapa-erro">
              {erro}
            </p>
          )}

          {excluindo && etapa && (
            <div className="space-y-2 rounded-md border border-border p-3" data-testid="etapa-excluir-destino">
              {destinos.length === 0 ? (
                <p className="text-sm">
                  {t("Não há outra coluna em aberto para receber os cards desta. Crie uma antes de excluir.")}
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    {excluindo.negocios !== null
                      ? `«${etapa.name}» ${t("tem")} ${excluindo.negocios} ${excluindo.negocios === 1 ? t("card") : t("cards")}. ${t("Para qual coluna eles vão?")}`
                      : t("Esta coluna tem cards. Para qual coluna eles vão?")}
                  </p>
                  <Select value={destino ?? ""} onValueChange={(v) => setDestino(v)}>
                    <SelectTrigger aria-label={t("Coluna que recebe os cards")} data-testid="etapa-destino">
                      <SelectValue placeholder={t("Escolha a coluna")} />
                    </SelectTrigger>
                    <SelectContent>
                      {destinos.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!destino || ocupado}
                    onClick={() => excluir(destino)}
                    data-testid="etapa-excluir-confirmar"
                  >
                    {t("Mover os cards e excluir")}
                  </Button>
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {etapa ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={ocupado}
                onClick={() => excluir(null)}
                data-testid="etapa-excluir"
              >
                {t("Excluir etapa")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
                {t("Cancelar")}
              </Button>
              <Button type="submit" disabled={ocupado} data-testid="etapa-salvar">
                {etapa ? t("Salvar") : t("Criar")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Marcacao({
  id,
  rotulo,
  marcada,
  travada,
  aviso,
  onChange,
}: {
  id: string;
  rotulo: string;
  marcada: boolean;
  travada: boolean;
  aviso: string | null;
  onChange: (marcada: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={marcada}
          disabled={travada}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-accent"
          data-testid={id}
        />
        {rotulo}
      </label>
      {aviso && <p className="pl-6 text-xs text-text-muted">{aviso}</p>}
    </div>
  );
}
