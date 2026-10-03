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
}

const VARIAVEL = /\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}/g;

function emTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function valorDaVariavel(nomeDaVariavel: string, ctx: ContextoDeVariaveis): string {
  const chave = nomeDaVariavel.trim();
  switch (chave) {
    case "nome":
      return (ctx.nome ?? "").trim();
    case "primeiro_nome":
      return (ctx.nome ?? "").trim().split(/\s+/)[0] ?? "";
    case "telefone":
      return ctx.telefone ?? "";
    case "last_user_message":
    case "ultima_mensagem":
      return ctx.ultimaMensagem ?? "";
    default: {
      if (chave in ctx.campos) return emTexto(ctx.campos[chave]);
      // `{ai.response}` gravado como objeto aninhado também vale.
      const partes = chave.split(".");
      let atual: unknown = ctx.campos;
      for (const p of partes) {
        if (atual && typeof atual === "object" && p in (atual as Record<string, unknown>)) {
          atual = (atual as Record<string, unknown>)[p];
        } else return "";
      }
      return emTexto(atual);
    }
  }
}

/** Troca cada `{variavel}` pelo valor; o que não existe vira vazio. Espaço duplo que sobra é aparado. */
export function interpolar(texto: string, ctx: ContextoDeVariaveis): string {
  return texto
    .replace(VARIAVEL, (_, nome: string) => valorDaVariavel(nome, ctx))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?])/g, "$1");
}

/** As variáveis que o editor sugere ao digitar `{`. */
export function variaveisSugeridas(camposDaOrganizacao: readonly string[]): string[] {
  return ["nome", "primeiro_nome", "telefone", "ultima_mensagem", ...camposDaOrganizacao];
}
