/**
 * EXCLUIR um CRM de vez (fork jhoow, menu "⋯" do card; migration 9012). Arquivar
 * é para quem tem história; excluir só passa num CRM que nunca recebeu negócio
 * e que nada do resto do sistema aponta. A régua é a do excluir FUNIL
 * (`lerDependencias`), aplicada a todo funil do CRM, vivo ou arquivado.
 */
export interface DependenciasDoFunilDoCrm {
  nome: string;
  negocios: number;
  fontesDeWebhook: string[];
  regrasAtivas: string[];
}

export type VereditoDaExclusao = { ok: true } | { ok: false; erro: string };

export function validarExclusaoDeCrm(
  crm: { name: string; is_default: boolean },
  funis: readonly DependenciasDoFunilDoCrm[],
): VereditoDaExclusao {
  if (crm.is_default)
    return { ok: false, erro: `«${crm.name}» é o CRM padrão. Marque OUTRO CRM como padrão antes de excluir este.` };
  const negocios = funis.reduce((s, f) => s + f.negocios, 0);
  if (negocios > 0)
    return {
      ok: false,
      erro: `«${crm.name}» tem ${negocios} ${negocios === 1 ? "negócio" : "negócios"}. Arquive em vez de excluir — excluir apagaria o histórico.`,
    };
  const fonte = funis.find((f) => f.fontesDeWebhook.length > 0);
  if (fonte)
    return {
      ok: false,
      erro: `O funil «${fonte.nome}» recebe leads da captura «${fonte.fontesDeWebhook[0]}». Aponte a captura para outro funil antes de excluir.`,
    };
  const regra = funis.find((f) => f.regrasAtivas.length > 0);
  if (regra)
    return {
      ok: false,
      erro: `A automação «${regra.regrasAtivas[0]}» usa o funil «${regra.nome}». Ajuste a automação antes de excluir.`,
    };
  return { ok: true };
}

/** A frase de cada recusa do banco (`fn_crm_excluir`). */
export const RECUSA_DO_BANCO: Record<string, string> = {
  crm_padrao: "Este é o CRM padrão. Marque OUTRO CRM como padrão antes de excluir.",
  crm_com_negocios: "Este CRM tem negócios. Arquive em vez de excluir.",
  crm_com_captura: "Um funil deste CRM recebe leads de uma captura. Aponte a captura para outro funil antes.",
  crm_com_conversao: "Uma etapa deste CRM é regra de conversão do Google Ads. Ajuste a regra antes.",
  crm_sem_permissao: "Você não tem permissão para excluir este CRM.",
};
