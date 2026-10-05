"use client";
/**
 * Criar campanha (PRD §8) — o formulário é o mesmo do editar
 * (`_form/FormularioDaCampanha`); aqui só o que é de CRIAR.
 */
import { useRouter } from "next/navigation";

import { useCriarCampanha } from "@/hooks/campanhas/useCampanhas";
import { useT } from "@/hooks/i18n/useT";

import { FormularioDaCampanha } from "../_form/FormularioDaCampanha";
import { valoresDaCampanha } from "../_form/valores";

export function NovaCampanha() {
  const t = useT();
  const router = useRouter();
  const criar = useCriarCampanha();
  return (
    <FormularioDaCampanha
      titulo={t("Nova campanha")}
      subtitulo={t("Isto cria um rascunho. Nada é enviado antes de você preparar a lista e iniciar.")}
      inicial={valoresDaCampanha()}
      salvando={criar.isPending}
      rotuloDoSalvar={t("Salvar rascunho")}
      onSalvar={async (corpo) => {
        const criada = await criar.mutateAsync(corpo);
        router.push(`/app/campaigns/${criada.id}`);
      }}
      onCancelar={() => router.push("/app/campaigns")}
    />
  );
}
