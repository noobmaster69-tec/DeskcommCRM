"use client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

import { PaletaDeCores } from "./PaletaDeCores";

interface FunilCriado {
  id: string;
  name: string;
  crm_id: string | null;
}

/**
 * "+ Adicionar funil": nome e cor, no MESMO CRM do quadro aberto. O funil nasce
 * com "Ganho" e "Perdido" (`POST /api/v1/pipelines`), e o quadro dele já abre
 * para o usuário criar as colunas do meio.
 */
export function NovoFunilDialog({
  open,
  onOpenChange,
  crmId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crmId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: (corpo: { name: string; crm_id: string; color: string | null }) =>
      apiClient.post<{ data: { pipelines: FunilCriado[] } }>("/api/v1/pipelines", corpo),
  });

  function salvar() {
    const limpo = nome.trim();
    if (!limpo) {
      setErro(t("Dê um nome ao funil — é o que aparece na lista e no topo do quadro."));
      return;
    }
    setErro(null);
    criar.mutate(
      { name: limpo, crm_id: crmId, color: cor },
      {
        onSuccess: (res) => {
          // A rota devolve a lista relida; o novo é o deste CRM com este nome
          // (nome de funil é único entre os vivos da organização).
          const novo = res.data.pipelines.find((f) => f.crm_id === crmId && f.name === limpo);
          toast.success(`«${limpo}» ${t("foi criado.")}`);
          onOpenChange(false);
          if (novo) router.push(`/app/pipelines/${novo.id}`);
          else router.refresh();
        },
        onError: (e) =>
          setErro(
            e instanceof ApiError && (e.status === 409 || e.status === 422)
              ? t(e.message)
              : t("Não deu para salvar agora. Tente de novo em instantes."),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="novo-funil-dialog">
        <DialogHeader>
          <DialogTitle>{t("Novo funil")}</DialogTitle>
          <DialogDescription>
            {t("O funil nasce com as etapas finais de ganho e perda; as colunas do meio você cria no quadro.")}
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
            <label htmlFor="funil-nome" className="block text-sm font-medium">
              {t("Nome")} *
            </label>
            <Input
              id="funil-nome"
              value={nome}
              maxLength={80}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              data-testid="funil-nome"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Cor da aba")}</legend>
            <PaletaDeCores valor={cor} onChange={setCor} prefixo="funil" />
          </fieldset>
          {erro && (
            <p className="text-sm text-destructive" role="alert" data-testid="funil-erro">
              {erro}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={criar.isPending} data-testid="funil-salvar">
              {t("Criar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
