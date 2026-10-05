/**
 * O texto que vai para a pessoa.
 *
 * ═══ O vocabulário não é novo ═══
 *
 * `{{nome}}` e `{{primeiro_nome}}` são as MESMAS variáveis de
 * `lib/inbox/template-vars.ts`. Campanha não inventa vocabulário próprio: quem
 * aprendeu a escrever template no Inbox escreve igual aqui. A única que a
 * campanha acrescenta é `{{saudacao}}`, que sai do relógio.
 *
 * ═══ Por que `{{saudacao}}` é resolvida no ENVIO, e não na preparação ═══
 *
 * A janela de envio cobre o dia inteiro e a campanha anda devagar de propósito.
 * Um "Bom dia!" cravado no texto (ou congelado às 9h) chega às 16h dizendo bom
 * dia — numa mensagem que se apresenta como alguém escrevendo, isso denuncia o
 * disparo automático na primeira palavra, que é o que a lista não perdoa. Foi o
 * defeito do primeiro piloto desta feature.
 *
 * ═══ Por que variável sem valor PULA a pessoa ═══
 *
 * "Olá , tudo bem?" é pior que não mandar: é a mesma denúncia, com o agravante
 * de ir para um contato que se queima uma vez só. O renderizador devolve o que
 * faltou e quem chama decide — na preparação vira exclusão visível
 * (`variavel_ausente`), com o operador vendo o número antes de apertar.
 *
 * Sem `eval`, sem HTML, sem travessia de propriedade: é `replace` sobre um mapa
 * fechado de resolvedores.
 */

import { horaNoFuso } from "./relogio";
import { chaveCanonica, VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";
import {
  BURACO,
  ehVariavelConhecida,
  limparPontuacaoOrfa,
  partesDoToken,
  resolverVariavel,
  TOKEN_DE_VARIAVEL,
  VARIAVEIS_DE_TEMPO,
} from "@/lib/variables/resolve";

/** As variáveis que existem. Oferecer uma que não resolve é prometer dado que não há. */
/**
 * As variáveis que a tela de campanha oferece: as do SISTEMA (lib/variables) —
 * os nomes antigos `nome`, `primeiro_nome` e `saudacao` continuam valendo
 * (aliases). As personalizadas da organização entram por `personalizadas`.
 */
export const VARIAVEIS_DA_CAMPANHA = VARIAVEIS_DO_SISTEMA.map((v) => v.chave);

export type VariavelDaCampanha = string;

export const DESCRICAO_DA_VARIAVEL: Record<string, string> = Object.fromEntries(
  VARIAVEIS_DO_SISTEMA.map((v) => [v.chave, v.descricao]),
);

export interface ValoresDoDestinatario {
  nome: string | null;
  telefone?: string | null;
  email?: string | null;
  /** `contacts.custom_fields` do destinatário (dados importados e variáveis personalizadas). */
  campos?: Record<string, unknown>;
  /** Chaves das variáveis personalizadas DEFINIDAS na organização (9013) — sem valor vira "faltando". */
  personalizadas?: readonly string[];
  /** Valores padrão das personalizadas (chave → valor). */
  padroes?: Record<string, string>;
  /** `contacts.locale` / `source` / `last_activity_at` e a campanha que envia. */
  locale?: string | null;
  origem?: string | null;
  ultimaInteracao?: string | null;
  campanhaId?: string | null;
}

export interface TextoRenderizado {
  texto: string;
  /** Variáveis usadas no texto que não tinham valor. Vazio = pode enviar. */
  faltando: string[];
  /** Tokens que não são variáveis conhecidas — ficam literais, como no Inbox. */
  desconhecidas: string[];
}

/**
 * Monta o texto da campanha. Aceita `{{chave}}` e `{chave}`.
 *
 * - Variável de TEMPO (saudação, dia, data) sem instante (prévia/preparação)
 *   fica literal e não é falta: quem resolve é o envio, no relógio do contato.
 * - Variável conhecida sem valor fica literal e entra em `faltando` — a
 *   campanha não manda mensagem com buraco.
 * - Token desconhecido fica literal e entra em `desconhecidas`.
 */
export function renderizar(
  template: string,
  valores: ValoresDoDestinatario,
  quando?: { agora: Date; fuso: string; idioma?: string },
): TextoRenderizado {
  const faltando = new Set<string>();
  const desconhecidas = new Set<string>();
  const campos = valores.campos ?? {};
  const personalizadas = new Set(valores.personalizadas ?? []);
  const ctx = {
    nome: valores.nome,
    telefone: valores.telefone ?? null,
    email: valores.email ?? null,
    campos,
    padroes: valores.padroes,
    locale: valores.locale ?? null,
    origem: valores.origem ?? null,
    ultimaInteracao: valores.ultimaInteracao ?? null,
    campanhaId: valores.campanhaId ?? null,
    quando,
  };
  let apagou = false;

  const texto = template.replace(TOKEN_DE_VARIAVEL, (literal, ...grupos: (string | undefined)[]) => {
    const { nome, alternativo } = partesDoToken([literal, ...grupos]);
    const sistema = chaveCanonica(nome);
    if (sistema && VARIAVEIS_DE_TEMPO.has(sistema) && !quando) return literal;
    const conhecida = ehVariavelConhecida(nome, personalizadas, campos);
    const v = conhecida ? resolverVariavel(nome, ctx) : "";
    if (v !== "") return v;
    if (!conhecida) desconhecidas.add(nome);
    // `{x|texto}`: o alternativo é o fallback SEGURO escrito por quem fez o texto.
    if (alternativo !== null) {
      if (alternativo !== "") return alternativo;
      apagou = true;
      return BURACO;
    }
    if (conhecida) faltando.add(sistema ? nome.toLowerCase() : nome);
    return literal;
  });

  return { texto: apagou ? limparPontuacaoOrfa(texto) : texto, faltando: [...faltando], desconhecidas: [...desconhecidas] };
}

/** As variáveis do SISTEMA que o texto usa (como escritas), sem repetir. */
export function variaveisUsadas(template: string): string[] {
  const achadas = new Set<string>();
  for (const m of template.matchAll(TOKEN_DE_VARIAVEL)) {
    const chave = partesDoToken(m).nome.toLowerCase();
    if (chaveCanonica(chave)) achadas.add(chave);
  }
  return [...achadas];
}

export function saudacaoDaHora(agora: Date, fuso: string): string {
  const hora = horaNoFuso(agora, fuso);
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
