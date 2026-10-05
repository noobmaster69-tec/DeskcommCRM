import type { SupabaseClient } from "@supabase/supabase-js";

import { fusoDoContato } from "@/lib/campanhas/fuso";
import { lerVariaveisDaOrganizacao, paraRenderizar } from "./definicoes";
import { interpolarVariaveis, variaveisDoTexto, type ContextoDoContato } from "./resolve";

/**
 * As variáveis no ENVIO de texto pronto (follow-ups, modelos de mensagem) —
 * fork jhoow. O mesmo resolvedor das Campanhas e dos Fluxos: `{nome_saudacao}`
 * resolve igual em todo lugar. Sem valor: o alternativo (`{x|texto}`), senão
 * vazio com a pontuação limpa — o cliente nunca recebe "{x}" nem "undefined".
 * Cada chamada lê UM contato: valor de um destinatário nunca vaza para outro.
 */

const COLUNAS = "name, display_name, phone_number, email, custom_fields, locale, source, last_activity_at";

interface LinhaDoContato {
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
  custom_fields: Record<string, unknown> | null;
  locale: string | null;
  source: string | null;
  last_activity_at: string | null;
}

function paraContexto(l: LinhaDoContato, padroes: Record<string, string>, fusoPadrao: string, idioma?: string | null): ContextoDoContato {
  const campos = (l.custom_fields ?? {}) as Record<string, unknown>;
  return {
    nome: l.name ?? l.display_name,
    telefone: l.phone_number,
    email: l.email,
    campos,
    padroes,
    locale: l.locale,
    origem: l.source,
    ultimaInteracao: l.last_activity_at,
    quando: {
      agora: new Date(),
      fuso: fusoDoContato(l.phone_number, campos, fusoPadrao),
      ...(idioma ? { idioma } : {}),
    },
  };
}

/** Interpola `texto` para o contato (cliente Supabase). Texto sem variável não lê nada. */
export async function interpolarParaContato(
  admin: SupabaseClient,
  e: { organizationId: string; contactId: string; texto: string; fusoPadrao?: string },
): Promise<string> {
  if (variaveisDoTexto(e.texto).length === 0) return e.texto;
  const [{ data }, vars] = await Promise.all([
    admin.from("contacts").select(COLUNAS).eq("organization_id", e.organizationId).eq("id", e.contactId).maybeSingle(),
    lerVariaveisDaOrganizacao(admin, e.organizationId),
  ]);
  if (!data) return interpolarVariaveis(e.texto, { nome: null, telefone: null, campos: {} }, { vazioQuandoFalta: true }).texto;
  const ctx = paraContexto(data as LinhaDoContato, paraRenderizar(vars).padroes, e.fusoPadrao ?? "America/Sao_Paulo");
  return interpolarVariaveis(e.texto, ctx, { vazioQuandoFalta: true }).texto;
}

interface Pg {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

/** O mesmo, por `pg` (o agent-engine). */
export async function interpolarParaContatoPg(
  db: Pg,
  e: { organizationId: string; contactId: string; texto: string; fusoPadrao?: string },
): Promise<string> {
  if (variaveisDoTexto(e.texto).length === 0) return e.texto;
  const [{ rows }, padroes] = await Promise.all([
    db.query<LinhaDoContato>(`select ${COLUNAS} from contacts where organization_id = $1 and id = $2`, [e.organizationId, e.contactId]),
    db
      .query<{ key: string; default_value: string | null }>(
        `select key, default_value from contact_custom_fields where organization_id = $1 and default_value is not null`,
        [e.organizationId],
      )
      .then((r) => Object.fromEntries(r.rows.map((x) => [x.key, x.default_value ?? ""])))
      .catch(() => ({}) as Record<string, string>),
  ]);
  const l = rows[0];
  if (!l) return interpolarVariaveis(e.texto, { nome: null, telefone: null, campos: {} }, { vazioQuandoFalta: true }).texto;
  return interpolarVariaveis(e.texto, paraContexto(l, padroes, e.fusoPadrao ?? "America/Sao_Paulo"), { vazioQuandoFalta: true }).texto;
}
