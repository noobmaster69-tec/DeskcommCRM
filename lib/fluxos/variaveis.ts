import { VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";
import { CAMPOS_DO_CONTATO } from "@/lib/variables/campos-do-contato";
import { interpolarVariaveis, resolverVariavel } from "@/lib/variables/resolve";
import { fusoDoContato } from "@/lib/campanhas/fuso";

/**
 * Variáveis do texto dos blocos de FLUXO (fork jhoow): `{nome}`, `{campo}`…
 *
 * Regra de ouro: variável que não existe vira VAZIO, nunca o `{token}` cru — o
 * cliente não pode receber "Oi, {nome}!". O editor avisa (Fase B: sugestões ao
 * digitar); a execução não trava por causa disso.
 *
 * Nomes, em ordem de precedência:
 *   - `{nome}` / `{primeiro_nome}` / `{telefone}` — do contato;
 *   - `{last_user_message}` / `{ultima_mensagem}` — a última resposta do lead;
 *   - qualquer outro — campo da ficha do contato (`contacts.custom_fields`),
 *     inclusive com ponto (`{ai.response}`).
 */
export interface ContextoDeVariaveis {
  nome: string | null;
  telefone: string | null;
  campos: Record<string, unknown>;
  ultimaMensagem: string | null;
  /** Fork jhoow: o resto do contato, para o catálogo de campos inteiro. */
  email?: string | null;
  locale?: string | null;
  origem?: string | null;
  ultimaInteracao?: string | null;
  /** Fuso da organização — o do contato (ficha/DDI) manda quando é conhecido. */
  fuso?: string;
}

const FUSO_PADRAO = "America/Sao_Paulo";

function paraResolver(ctx: ContextoDeVariaveis) {
  return {
    nome: ctx.nome,
    telefone: ctx.telefone,
    email: ctx.email ?? null,
    campos: ctx.campos,
    ultimaMensagem: ctx.ultimaMensagem,
    locale: ctx.locale ?? null,
    origem: ctx.origem ?? null,
    ultimaInteracao: ctx.ultimaInteracao ?? null,
    // Saudação/dia/data no relógio do CONTATO (campo fuso_horario ou DDI de
    // fuso único), senão no da organização; o idioma é o da conversa (ficha).
    quando: { agora: new Date(), fuso: fusoDoContato(ctx.telefone, ctx.campos, ctx.fuso ?? FUSO_PADRAO) },
  };
}

/** O valor de UMA variável no bloco — o MESMO resolvedor das Campanhas (aliases, catálogo, `{x|alternativo}`). */
export function valorDaVariavel(nomeDaVariavel: string, ctx: ContextoDeVariaveis): string {
  return resolverVariavel(nomeDaVariavel.trim(), paraResolver(ctx));
}

/**
 * Troca cada `{variavel}` pelo valor. Sem valor: o alternativo (`{x|texto}`),
 * senão VAZIO com a pontuação órfã limpa — o cliente nunca recebe "{nome}"
 * nem "undefined". Espaço duplo que sobra é aparado.
 */
export function interpolar(texto: string, ctx: ContextoDeVariaveis): string {
  return interpolarVariaveis(texto, paraResolver(ctx), { vazioQuandoFalta: true })
    .texto.replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?])/g, "$1");
}

/** As variáveis que o editor sugere ao digitar `{`: as do sistema, a última mensagem e as da organização. */
export function variaveisSugeridas(camposDaOrganizacao: readonly string[]): string[] {
  const todas = [
    "nome",
    "primeiro_nome",
    "telefone",
    ...VARIAVEIS_DO_SISTEMA.map((v) => v.chave),
    ...CAMPOS_DO_CONTATO.map((c) => c.chave),
    "ultima_mensagem",
    ...camposDaOrganizacao,
  ];
  return [...new Set(todas)];
}
