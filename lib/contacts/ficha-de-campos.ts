import { fusoValido } from "@/lib/campanhas/fuso";
import {
  CAMPOS_DO_CONTATO,
  GRUPOS,
  campoDoCatalogo,
  chavesAntigasDe,
  type CampoDoCatalogo,
  type GrupoDoCampo,
  type TipoDoCampo,
} from "@/lib/variables/campos-do-contato";
import type { VariavelPersonalizada } from "@/lib/variables/definicoes";
import { resolverVariavel } from "@/lib/variables/resolve";
import { CHAVE_DE_VARIAVEL, NOMES_RESERVADOS } from "@/lib/variables/sistema";

/**
 * A FICHA DE CAMPOS do contato (fork jhoow) — o que o Inbox, a página de
 * Contatos e o cadastro mostram e editam. Puro: a rota lê e grava, aqui só se
 * monta e se valida. Definições compartilhadas pela empresa; VALORES de cada
 * contato (`contacts.custom_fields`) — nunca um valor global igual para todos.
 */
export interface ContatoDaFicha {
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
  locale: string | null;
  source: string | null;
  last_activity_at: string | null;
  custom_fields: Record<string, unknown> | null;
}

export type ValorDoCampo = string | number | boolean | null;

export interface CampoDaFicha {
  chave: string;
  rotulo: string;
  tipo: TipoDoCampo;
  origem: "nativo" | "calculado" | "padrao" | "organizacao" | "importado";
  opcoes: string[];
  somenteLeitura: boolean;
  aceitaManual: boolean;
  dica: string | null;
  /** O valor GUARDADO (coluna ou custom_fields). Calculado sem valor manual = null. */
  valor: ValorDoCampo;
  /** O que as mensagens usam hoje (calculado/padrão resolvido) — para mostrar ao lado. */
  efetivo: string;
}

export interface GrupoDaFicha {
  id: GrupoDoCampo;
  rotulo: string;
  secao: "dados" | "personalizados";
  campos: CampoDaFicha[];
}

const proprio = (o: unknown, k: string) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

function primitivo(v: unknown): ValorDoCampo {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return null;
}

/** O valor guardado de um campo padrão: a chave nova, senão a antiga (fonte única). */
function guardado(campos: Record<string, unknown>, chave: string): ValorDoCampo {
  for (const k of [chave, ...chavesAntigasDe(chave)]) if (proprio(campos, k)) return primitivo(campos[k]);
  return null;
}

/** Monta a ficha: catálogo + definições da organização + dados importados soltos. */
export function montarFicha(
  c: ContatoDaFicha,
  defs: readonly VariavelPersonalizada[],
  ultimaCampanha: { id: string; nome: string } | null,
): GrupoDaFicha[] {
  const campos = (c.custom_fields ?? {}) as Record<string, unknown>;
  const ctx = {
    nome: c.name ?? c.display_name,
    telefone: c.phone_number,
    email: c.email,
    campos,
    locale: c.locale,
    origem: c.source,
    ultimaInteracao: c.last_activity_at,
    campanhaId: ultimaCampanha?.id ?? null,
  };
  const defPorChave = new Map(defs.map((d) => [d.key, d]));
  const grupos = new Map<GrupoDoCampo, CampoDaFicha[]>(GRUPOS.map((g) => [g.id, []]));

  const doCatalogo = (k: CampoDoCatalogo): CampoDaFicha => {
    const def = defPorChave.get(k.chave);
    let valor: ValorDoCampo = null;
    if (k.coluna === "name") valor = c.name;
    else if (k.coluna === "phone_number") valor = c.phone_number;
    else if (k.coluna === "email") valor = c.email;
    else if (k.coluna === "locale") valor = c.locale;
    else if (k.coluna === "last_activity_at") valor = c.last_activity_at;
    else if (k.origem === "padrao" || k.aceitaManual) valor = guardado(campos, k.chave);
    else if (k.chave === "campanha_id") valor = ultimaCampanha ? ultimaCampanha.nome : null;
    const tipo = (def?.type as TipoDoCampo | undefined) ?? k.tipo;
    return {
      chave: k.chave,
      rotulo: def?.label ?? k.rotulo,
      tipo,
      origem: k.origem,
      opcoes: def?.options?.length ? [...def.options] : [...(k.opcoes ?? [])],
      somenteLeitura: !!k.somenteLeitura,
      aceitaManual: !!k.aceitaManual,
      dica: k.dica ?? null,
      valor,
      efetivo: k.chave === "campanha_id" ? (ultimaCampanha?.nome ?? "") : resolverVariavel(k.chave, ctx),
    };
  };
  for (const k of CAMPOS_DO_CONTATO) {
    if (defPorChave.get(k.chave)?.visible_in_profile === false) continue;
    grupos.get(k.grupo)!.push(doCatalogo(k));
  }

  // As da organização que não estão no catálogo.
  for (const d of defs) {
    if (campoDoCatalogo(d.key) || !d.visible_in_profile) continue;
    grupos.get("outros")!.push({
      chave: d.key,
      rotulo: d.label,
      tipo: d.type,
      origem: "organizacao",
      opcoes: [...(d.options ?? [])],
      somenteLeitura: false,
      aceitaManual: false,
      dica: null,
      valor: primitivo(proprio(campos, d.key) ? campos[d.key] : null),
      efetivo: resolverVariavel(d.key, { ...ctx, padroes: d.default_value ? { [d.key]: d.default_value } : {} }),
    });
  }

  // Dados importados soltos (chave sem definição): aparecem para não sumirem.
  for (const [k, v] of Object.entries(campos)) {
    if (campoDoCatalogo(k) || defPorChave.has(k) || NOMES_RESERVADOS.has(k) || !CHAVE_DE_VARIAVEL.test(k)) continue;
    const p = primitivo(v);
    if (p === null) continue;
    grupos.get("outros")!.push({
      chave: k,
      rotulo: k,
      tipo: typeof p === "number" ? "numero" : typeof p === "boolean" ? "booleano" : "texto",
      origem: "importado",
      opcoes: [],
      somenteLeitura: false,
      aceitaManual: false,
      dica: null,
      valor: p,
      efetivo: String(p),
    });
  }

  return GRUPOS.map((g) => ({ id: g.id, rotulo: g.rotulo, secao: g.secao, campos: grupos.get(g.id)! })).filter(
    (g) => g.campos.length > 0,
  );
}

export type ErroDeCampo = { chave: string; codigo: "somente_leitura" | "desconhecido" | "invalido" | "opcao"; mensagem: string };

export interface Alteracao {
  /** Colunas de `contacts`. */
  colunas: Record<string, unknown>;
  /** O `custom_fields` inteiro, já mesclado. `null` = não mexe. */
  customFields: Record<string, unknown> | null;
  erros: ErroDeCampo[];
  /** O nome foi editado à mão (protege contra sobrescrita automática). */
  nomeManual: boolean;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LOCALE = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function normalizar(tipo: TipoDoCampo, bruto: ValorDoCampo, opcoes: readonly string[]): { ok: true; valor: ValorDoCampo } | { ok: false; motivo: string } {
  if (bruto === null || (typeof bruto === "string" && bruto.trim() === "")) return { ok: true, valor: null };
  const texto = typeof bruto === "string" ? bruto.trim() : String(bruto);
  switch (tipo) {
    case "numero": {
      const n = typeof bruto === "number" ? bruto : Number(texto.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? { ok: true, valor: n } : { ok: false, motivo: "número inválido" };
    }
    case "booleano":
      if (typeof bruto === "boolean") return { ok: true, valor: bruto };
      if (/^(true|sim|s|1|yes|x)$/i.test(texto)) return { ok: true, valor: true };
      if (/^(false|não|nao|n|0|no)$/i.test(texto)) return { ok: true, valor: false };
      return { ok: false, motivo: "use sim ou não" };
    case "data":
      return DATA.test(texto) && !Number.isNaN(Date.parse(texto)) ? { ok: true, valor: texto } : { ok: false, motivo: "data no formato AAAA-MM-DD" };
    case "email":
      return EMAIL.test(texto) ? { ok: true, valor: texto } : { ok: false, motivo: "e-mail inválido" };
    case "url":
      return /^https?:\/\/\S+$/i.test(texto) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(texto)
        ? { ok: true, valor: texto.slice(0, 1000) }
        : { ok: false, motivo: "link inválido" };
    case "selecao":
      return opcoes.length === 0 || opcoes.includes(texto) ? { ok: true, valor: texto } : { ok: false, motivo: "opção fora da lista" };
    default:
      return { ok: true, valor: texto.slice(0, 1000) };
  }
}

/**
 * Valida e prepara as alterações. Vazio/`null` LIMPA o campo (gesto explícito
 * da ficha). Escrever um campo do catálogo apaga a chave antiga equivalente —
 * um valor só por campo.
 */
export function prepararAlteracao(
  atual: Pick<ContatoDaFicha, "custom_fields">,
  valores: Record<string, ValorDoCampo>,
  defs: readonly VariavelPersonalizada[],
): Alteracao {
  const colunas: Record<string, unknown> = {};
  const campos = { ...((atual.custom_fields ?? {}) as Record<string, unknown>) };
  const erros: ErroDeCampo[] = [];
  let mexeuEmCampos = false;
  let nomeManual = false;
  const defPorChave = new Map(defs.map((d) => [d.key, d]));

  for (const [chaveBruta, bruto] of Object.entries(valores)) {
    const k = campoDoCatalogo(chaveBruta);
    const chave = k?.chave ?? chaveBruta;
    const def = defPorChave.get(chave);
    if (k?.somenteLeitura) {
      erros.push({ chave, codigo: "somente_leitura", mensagem: "Este campo não se edita pela ficha." });
      continue;
    }
    if (!k && !def && !proprio(campos, chave)) {
      if (!CHAVE_DE_VARIAVEL.test(chave) || NOMES_RESERVADOS.has(chave)) {
        erros.push({ chave, codigo: "desconhecido", mensagem: "Campo desconhecido." });
        continue;
      }
    }
    const tipo: TipoDoCampo = (def?.type as TipoDoCampo | undefined) ?? k?.tipo ?? "texto";
    const opcoes = def?.options ?? k?.opcoes ?? [];
    const n = normalizar(tipo, bruto, opcoes);
    if (!n.ok) {
      erros.push({ chave, codigo: tipo === "selecao" ? "opcao" : "invalido", mensagem: n.motivo });
      continue;
    }
    if (k?.coluna === "name") {
      colunas.name = n.valor === null ? null : String(n.valor).slice(0, 200);
      nomeManual = true;
      continue;
    }
    if (k?.coluna === "email") {
      colunas.email = n.valor;
      continue;
    }
    if (k?.coluna === "locale") {
      if (n.valor !== null && !LOCALE.test(String(n.valor))) {
        erros.push({ chave, codigo: "invalido", mensagem: "idioma no formato pt-BR, pt-PT, es, en" });
        continue;
      }
      colunas.locale = n.valor;
      continue;
    }
    if (chave === "fuso_horario" && n.valor !== null && !fusoValido(String(n.valor))) {
      erros.push({ chave, codigo: "invalido", mensagem: "fuso IANA inválido (ex.: Europe/Lisbon)" });
      continue;
    }
    mexeuEmCampos = true;
    for (const antiga of chavesAntigasDe(chave)) delete campos[antiga];
    if (n.valor === null) delete campos[chave];
    else campos[chave] = n.valor;
  }
  return { colunas, customFields: mexeuEmCampos ? campos : null, erros, nomeManual };
}
