"use client";
/**
 * Editar campanha — o MESMO formulário do criar (`_form/FormularioDaCampanha`).
 * Antes este arquivo tinha um formulário próprio que não carregava nem salvava
 * o funil/etapa do público, o ritmo e os números do rodízio: salvar um rascunho
 * editado apagava esses filtros.
 */
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampanha, useEditarCampanha } from "@/hooks/campanhas/useCampanhas";
import { useT } from "@/hooks/i18n/useT";

import { FormularioDaCampanha } from "../../_form/FormularioDaCampanha";
import { valoresDaCampanha } from "../../_form/valores";

export function EditarCampanha({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const campanha = useCampanha(id);
  const salvar = useEditarCampanha(id);

  if (campanha.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const c = campanha.data;
  if (!c) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center">
          <p className="text-sm text-error-fg">{t("Não foi possível carregar a campanha.")}</p>
        </Card>
      </div>
    );
  }

  if (c.status !== "draft") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Editar campanha")}</h1>
        <Card className="space-y-3 p-4">
          <p className="text-sm">
            {t(
              "Esta campanha já foi preparada: cada pessoa da lista tem o texto que vai receber guardado. Para mudar o texto ou o público, volte a campanha para rascunho — isso descarta a lista montada.",
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("O ritmo você ajusta na própria tela da campanha, sem descartar nada.")}
          </p>
          <Button variant="outline" onClick={() => router.push(`/app/campaigns/${id}`)}>
            {t("Voltar para a campanha")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <FormularioDaCampanha
      // Uma carga só: o `key` remonta o formulário se a campanha trocar, e o
      // refetch do detalhe não apaga a edição em andamento.
      key={c.id}
      titulo={t("Editar campanha")}
      subtitulo={t("Enquanto é rascunho, tudo muda. Depois de preparada, só o ritmo.")}
      inicial={valoresDaCampanha(c)}
      salvando={salvar.isPending}
      rotuloDoSalvar={t("Salvar alterações")}
      onSalvar={async (corpo) => {
        await salvar.mutateAsync(corpo);
        router.push(`/app/campaigns/${id}`);
      }}
      onCancelar={() => router.push(`/app/campaigns/${id}`)}
    />
  );
}
