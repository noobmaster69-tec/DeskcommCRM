import { CAMPOS_DO_CONTATO } from "./campos-do-contato";
import { idiomaDaConversa, resolverVariavel, type ContextoDoContato } from "./resolve";
import { NOMES_RESERVADOS } from "./sistema";

const MAX_CAMPOS = 30;
const MAX_CHARS = 160;

/** Chaves que não vão para a IA: técnicas, já presentes no contexto, ou sem valor de conversa. */
const FORA_DA_IA = new Set(["whatsapp", "email", "nome_completo", "ultima_interacao", "campanha_id", "idioma_contato"]);

/**
 * Os CAMPOS DO CONTATO como a IA os lê (fork jhoow): só os preenchidos, já
 * resolvidos (nome curto, nome de saudação com o tratamento confirmado), e os
 * da organização. Compacto de propósito: o contexto do lead tem orçamento de
 * tokens, e o histórico é o que mais importa.
 */
export function camposParaIA(ctx: ContextoDoContato): Record<string, string> {
  const saida: Record<string, string> = {};
  const add = (k: string, v: string) => {
    if (!v || Object.keys(saida).length >= MAX_CAMPOS) return;
    saida[k] = v.length > MAX_CHARS ? `${v.slice(0, MAX_CHARS)}…` : v;
  };
  for (const c of CAMPOS_DO_CONTATO) {
    if (FORA_DA_IA.has(c.chave)) continue;
    add(c.chave, resolverVariavel(c.chave, ctx));
  }
  for (const [k, v] of Object.entries(ctx.campos ?? {})) {
    if (k in saida || NOMES_RESERVADOS.has(k) || FORA_DA_IA.has(k)) continue;
    if (CAMPOS_DO_CONTATO.some((c) => c.chave === k)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") add(k, String(v).trim());
  }
  return saida;
}

/** O idioma da conversa para a IA: o do contexto da conversa, senão o da ficha, senão o do perfil. */
export function idiomaParaIA(ctx: ContextoDoContato, daConversa?: string | null): string | null {
  const v = (daConversa ?? "").trim();
  if (v) return v;
  const r = idiomaDaConversa(ctx);
  return r === "pt-BR" && !ctx.locale ? null : r;
}

/** O bloco do turno: o idioma em que a IA responde — e a regra de não trocar por "ok". */
export function blocoDeIdioma(idioma: string | null | undefined): string {
  if (!idioma) return "";
  return (
    `## Idioma da conversa\n` +
    `Converse em ${idioma}. Saudação, profissão e tratamento seguem esse idioma. ` +
    `Uma resposta curta ou neutra do cliente ("ok", "sim", "obrigado", um emoji) NÃO muda o idioma; ` +
    `só mude se ele escrever claramente em outro idioma.`
  );
}
