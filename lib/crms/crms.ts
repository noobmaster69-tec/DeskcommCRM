/**
 * Regras puras dos CRMs — o nível acima dos funis (migration 9004).
 *
 * Organização → CRMs → Funis → Etapas → Cards. Um CRM agrupa funis que
 * compartilham público ou marca. Este arquivo não fala com o banco: as rotas
 * de `app/api/v1/crms/` leem, decidem aqui e escrevem.
 *
 * O slug segue a MESMA régua do funil (`crm_crms_slug_format` =
 * `crm_pipelines_slug_format`), e por isso a conta é a de `slugDeNome` — uma
 * segunda cópia divergiria no primeiro ajuste.
 */
import { chaveDeNome, slugDeNome } from "@/lib/leads/stage-editing";

/** O que as regras precisam de cada CRM. Arquivados entram: ocupam o slug. */
export interface CrmEditavel {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  archived_at: string | null;
}

export type Resultado = { ok: true } | { ok: false; erro: string };

export const NOME_MAX = 80;
export const DESCRICAO_MAX = 280;
export const SLUG_FORMATO = /^[a-z0-9_-]{2,40}$/;
export const COR_FORMATO = /^#[0-9a-fA-F]{6}$/;

function vivos(crms: CrmEditavel[]): CrmEditavel[] {
  return crms.filter((c) => c.archived_at === null);
}

/**
 * Slug a partir do nome. `slugsExistentes` inclui os ARQUIVADOS:
 * `uniq_crm_crms_org_slug` não é parcial.
 */
export function slugDeCrm(nome: string, slugsExistentes: string[] = []): string {
  return slugDeNome(nome, slugsExistentes, "crm");
}

/**
 * O slug que o usuário digitou, normalizado para a régua do banco.
 *
 * Aceita a barra da tela ("/clientes-girly"), maiúsculas e acento — tudo o que
 * se lê como o mesmo endereço. Devolve `null` quando nem assim cabe no formato,
 * para a rota responder com a frase certa em vez de um 23514 cru.
 */
export function normalizarSlug(entrada: string): string | null {
  const slug = entrada
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
  return SLUG_FORMATO.test(slug) ? slug : null;
}

/**
 * As iniciais do avatar: duas letras maiúsculas.
 *
 * Duas palavras ou mais → a primeira letra das duas primeiras ("Clientes
 * Girly" → "CG"). Uma palavra só → as duas primeiras letras ("PADRÃO" →
 * "PA"). Só se contam letras e dígitos: "PA Advogados - EUROPA" dá "PA", e o
 * hífen solto não vira inicial.
 */
export function iniciaisDoCrm(nome: string): string {
  const palavras = nome
    .normalize("NFC")
    .split(/\s+/)
    .map((p) => Array.from(p).filter((ch) => /[\p{L}\p{N}]/u.test(ch)).join(""))
    .filter(Boolean);
  if (palavras.length === 0) return "?";
  const letras =
    palavras.length >= 2
      ? [Array.from(palavras[0]!)[0]!, Array.from(palavras[1]!)[0]!]
      : Array.from(palavras[0]!).slice(0, 2);
  return letras.join("").toLocaleUpperCase("pt-BR");
}

/** Recusa o nome que o usuário leria como duplicado (sem acento, sem caixa). */
export function validarNomeDeCrm(nome: string, crms: CrmEditavel[], crmId: string | null): Resultado {
  if (!nome.trim()) {
    return { ok: false, erro: "Dê um nome ao CRM — é o que aparece no card." };
  }
  if (nome.trim().length > NOME_MAX) {
    return { ok: false, erro: `O nome do CRM cabe em até ${NOME_MAX} caracteres.` };
  }
  const chave = chaveDeNome(nome);
  const colisao = vivos(crms).find((c) => c.id !== crmId && chaveDeNome(c.name) === chave);
  if (colisao) {
    return { ok: false, erro: `Já existe um CRM chamado «${colisao.name}». Escolha outro nome.` };
  }
  return { ok: true };
}

/** Recusa o slug já ocupado — arquivado inclusive, como o índice único. */
export function validarSlugDeCrm(slug: string, crms: CrmEditavel[], crmId: string | null): Resultado {
  if (!SLUG_FORMATO.test(slug)) {
    return {
      ok: false,
      erro: "O endereço do CRM usa de 2 a 40 letras minúsculas, números, hífen ou sublinhado.",
    };
  }
  const dono = crms.find((c) => c.id !== crmId && c.slug === slug);
  if (dono) {
    const onde = dono.archived_at === null ? "" : " (arquivado)";
    return { ok: false, erro: `O endereço /${slug} já é do CRM «${dono.name}»${onde}. Escolha outro.` };
  }
  return { ok: true };
}

/**
 * Recusa o arquivamento que deixaria a organização sem destino.
 *
 * O padrão é para onde vai todo funil criado sem CRM — arquivá-lo é proibido
 * também pelo banco (`crm_crms_padrao_nao_arquiva`), mas aqui a frase diz o que
 * fazer. Funil vivo dentro também barra: arquivar o CRM esconderia quadros em
 * uso.
 */
/** Um funil vivo do CRM, com o que o amarra ao resto do sistema. */
export interface FunilDoCrmArquivado {
  name: string;
  /** O funil padrão da ORGANIZAÇÃO — destino do negócio criado sem funil escolhido. */
  is_default: boolean;
  /** Formulários (fontes de webhook) que mandam lead para ele. */
  fontesDeWebhook: string[];
  /** Automações ativas que mandam card para ele. */
  regrasAtivas: string[];
}

/**
 * Recusa arquivar o CRM que deixaria uma entrada de lead sem destino.
 *
 * ⚠️ ARQUIVAR O CRM ARQUIVA OS FUNIS DELE JUNTO, o principal inclusive (Funis no
 * modelo Kommo, Fase D — `fn_crm_arquivar`, migration 9009). A regra antiga
 * exigia "zero funil vivo", e com o funil principal fixo (9007) isso tornou todo
 * CRM inarquivável. Os negócios ficam como histórico, como no arquivar de funil.
 * O que continua barrando é o que barra arquivar um funil: ser o padrão, ou ter
 * formulário/automação mandando lead para ele — senão o lead que chegasse por
 * ali ficaria sem quadro.
 */
export function validarArquivamentoDeCrm(crm: CrmEditavel, funis: FunilDoCrmArquivado[]): Resultado {
  if (crm.is_default) {
    return {
      ok: false,
      erro: `«${crm.name}» é o CRM padrão. Marque OUTRO CRM como padrão antes de arquivar este.`,
    };
  }
  const padrao = funis.find((f) => f.is_default);
  if (padrao) {
    return {
      ok: false,
      erro:
        `O funil «${padrao.name}» deste CRM é o funil padrão da organização. Marque OUTRO funil como padrão ` +
        `antes de arquivar o CRM.`,
    };
  }
  const comFormulario = funis.find((f) => f.fontesDeWebhook.length > 0);
  if (comFormulario) {
    return {
      ok: false,
      erro:
        `O funil «${comFormulario.name}» recebe lead do formulário ${comFormulario.fontesDeWebhook.map((n) => `«${n}»`).join(", ")}. ` +
        `Aponte o formulário para outro funil antes de arquivar o CRM.`,
    };
  }
  const comAutomacao = funis.find((f) => f.regrasAtivas.length > 0);
  if (comAutomacao) {
    return {
      ok: false,
      erro:
        `A automação ${comAutomacao.regrasAtivas.map((n) => `«${n}»`).join(", ")} manda card para o funil ` +
        `«${comAutomacao.name}». Ajuste a automação antes de arquivar o CRM.`,
    };
  }
  return { ok: true };
}

/**
 * Os updates para eleger `alvoId` como padrão, NA ORDEM em que precisam rodar.
 *
 * `uniq_crm_crms_org_default` é imediato (não deferível): marcar o novo antes
 * de liberar o antigo é 23505. O antigo pode estar arquivado? Não — o CHECK
 * `crm_crms_padrao_nao_arquiva` impede —, mas a busca não filtra por isso, para
 * a regra não depender de outra.
 */
export function updatesDePadraoDeCrm(
  crms: CrmEditavel[],
  alvoId: string,
): Array<{ crmId: string; patch: { is_default: boolean } }> {
  const atual = crms.find((c) => c.is_default);
  if (atual?.id === alvoId) return [];
  const updates: Array<{ crmId: string; patch: { is_default: boolean } }> = [];
  if (atual) updates.push({ crmId: atual.id, patch: { is_default: false } });
  updates.push({ crmId: alvoId, patch: { is_default: true } });
  return updates;
}
