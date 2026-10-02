import { z } from "zod";

/**
 * Os 11 blocos do construtor de FLUXOS (fork jhoow, Etapa 2 do master plan) —
 * só o FORMATO de cada `config`. Os tipos entram na união de
 * `graph-schema.ts` (`flowNodeSchema`) e são liberados só para a superfície
 * `fluxo` (`NOS_DA_SUPERFICIE`); o editor de follow-up nunca os oferece e o
 * publish de follow-up os recusa.
 *
 * Fase A entrega só o formato. Executores, saídas nomeadas (`nodeBranches`) e
 * modais chegam bloco a bloco nas fases B, C e D — e cada fase pode apertar o
 * formato do seu bloco, porque nenhum grafo publicado usa estes tipos ainda.
 *
 * Decisões que valem para todos:
 *  - Texto livre aceita variáveis `{nome}` / `{campo}` — interpoladas na
 *    execução, nunca validadas aqui (a lista de campos é da organização).
 *  - Mídia aponta para o Storage (`storage_path`) ou para uma URL pública
 *    https; nunca base64 dentro do grafo (o grafo é versionado e exportável).
 *  - NENHUM segredo mora no grafo: o Bloco de IA usa a credencial cadastrada
 *    pela empresa (IA › Credenciais), decisão do dono do produto.
 */

const idDeItem = z.string().min(1).max(40);
const textoComVariaveis = (max: number) => z.string().min(1).max(max);

/** Mídia de um item: arquivo no Storage da organização ou URL https pública. */
export const midiaDoFluxoSchema = z
  .strictObject({
    storage_path: z.string().min(1).max(500).optional(),
    url: z.string().url().max(2000).startsWith("https://").optional(),
    nome_arquivo: z.string().min(1).max(200).optional(),
    mime: z.string().min(1).max(120).optional(),
  })
  .refine((m) => Boolean(m.storage_path) !== Boolean(m.url), {
    message: "informe o arquivo enviado OU um link https — um dos dois",
  });

// ── #1 Mensagem ─────────────────────────────────────────────────────────────
export const itemDaMensagemSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ id: idDeItem, tipo: z.literal("texto"), texto: textoComVariaveis(4000) }),
  z.strictObject({ id: idDeItem, tipo: z.literal("imagem"), midia: midiaDoFluxoSchema, legenda: z.string().max(1000).optional() }),
  z.strictObject({ id: idDeItem, tipo: z.literal("video"), midia: midiaDoFluxoSchema, legenda: z.string().max(1000).optional() }),
  z.strictObject({ id: idDeItem, tipo: z.literal("audio"), midia: midiaDoFluxoSchema }),
  z.strictObject({ id: idDeItem, tipo: z.literal("arquivo"), midia: midiaDoFluxoSchema }),
  z.strictObject({ id: idDeItem, tipo: z.literal("sticker"), midia: midiaDoFluxoSchema }),
  z.strictObject({
    id: idDeItem,
    tipo: z.literal("contato"),
    nome: z.string().min(1).max(120),
    telefone: z.string().regex(/^\+?\d{8,15}$/, "telefone com DDI, só dígitos"),
  }),
  z.discriminatedUnion("modo", [
    z.strictObject({ id: idDeItem, tipo: z.literal("intervalo"), modo: z.literal("fixo"), segundos: z.number().int().min(1).max(300) }),
    z.strictObject({
      id: idDeItem,
      tipo: z.literal("intervalo"),
      modo: z.literal("aleatorio"),
      min_segundos: z.number().int().min(1).max(300),
      max_segundos: z.number().int().min(1).max(300),
    }),
  ]).refine((i) => i.modo !== "aleatorio" || i.max_segundos >= i.min_segundos, {
    message: "o máximo do intervalo não pode ser menor que o mínimo",
  }),
]);
export type ItemDaMensagem = z.infer<typeof itemDaMensagemSchema>;

export const mensagemConfigSchema = z.strictObject({
  itens: z.array(itemDaMensagemSchema).min(1).max(30),
});

// ── #2 Etiquetas ────────────────────────────────────────────────────────────
export const OPERACOES_DE_ETIQUETA = ["adicionar", "remover"] as const;
export const etiquetasConfigSchema = z.strictObject({
  operacao: z.enum(OPERACOES_DE_ETIQUETA).default("adicionar"),
  etiquetas: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
});

// ── #3 Aguardar resposta ────────────────────────────────────────────────────
export const UNIDADES_DE_ESPERA = ["minutos", "horas", "dias"] as const;
const MAX_ESPERA_MIN = 31 * 24 * 60;
const minutosDe = (valor: number, unidade: (typeof UNIDADES_DE_ESPERA)[number]) =>
  valor * (unidade === "dias" ? 1440 : unidade === "horas" ? 60 : 1);

export const aguardarRespostaConfigSchema = z
  .strictObject({
    sem_limite: z.boolean().default(false),
    tempo: z.strictObject({ valor: z.number().int().min(1), unidade: z.enum(UNIDADES_DE_ESPERA) }).optional(),
    buffer: z.strictObject({ ativo: z.boolean(), segundos: z.number().int().min(1).max(120) }).optional(),
    responder_citando: z.boolean().default(false),
    reagir: z.strictObject({ ativo: z.boolean(), emoji: z.string().min(1).max(16).optional() }).optional(),
    /** Chave do campo da ficha onde a resposta é gravada (cria se não existir). */
    salvar_em: z.string().regex(/^[a-z][a-z0-9_.]*$/).max(60).optional(),
    mensagem_antes: z.string().max(4000).optional(),
  })
  .refine((c) => c.sem_limite || c.tempo !== undefined, {
    message: "defina o tempo máximo ou marque 'aguardar indefinidamente'",
    path: ["tempo"],
  })
  .refine((c) => !c.tempo || minutosDe(c.tempo.valor, c.tempo.unidade) <= MAX_ESPERA_MIN, {
    message: "o tempo máximo é 31 dias",
    path: ["tempo"],
  });

// ── #4 Notificação (para a EQUIPE, não para o lead) ─────────────────────────
export const notificacaoConfigSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  ddi: z.string().regex(/^\d{1,4}$/).default("55"),
  numero: z.string().regex(/^\d{8,13}$/, "número só com dígitos, sem o DDI"),
  mensagem: textoComVariaveis(4000),
});

// ── #5 Condicional ──────────────────────────────────────────────────────────
export const OPERADORES_DA_CONDICAO = [
  "igual",
  "diferente",
  "contem",
  "nao_contem",
  "maior",
  "menor",
  "entre",
  "vazio",
  "nao_vazio",
] as const;

export const campoDaCondicaoSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("etiqueta") }),
  z.strictObject({ tipo: z.literal("dia_semana") }),
  z.strictObject({ tipo: z.literal("hora") }),
  z.strictObject({ tipo: z.literal("data") }),
  z.strictObject({ tipo: z.literal("janela_24h") }),
  z.strictObject({ tipo: z.literal("status_atendimento") }),
  z.strictObject({ tipo: z.literal("atendente") }),
  z.strictObject({ tipo: z.literal("nome") }),
  z.strictObject({ tipo: z.literal("numero") }),
  z.strictObject({ tipo: z.literal("email") }),
  z.strictObject({ tipo: z.literal("campo_custom"), chave: z.string().min(1).max(60) }),
]);

export const condicaoDoFluxoSchema = z.strictObject({
  id: idDeItem,
  campo: campoDaCondicaoSchema,
  operador: z.enum(OPERADORES_DA_CONDICAO),
  /** Ausente nos operadores que não comparam (`vazio`, `nao_vazio`). */
  valor: z.union([z.string().max(500), z.number(), z.array(z.string().max(200)).max(20)]).optional(),
  valor_ate: z.union([z.string().max(200), z.number()]).optional(),
});

export const REGRAS_DA_CONDICIONAL = ["todas", "qualquer"] as const;
export const condicionalConfigSchema = z.strictObject({
  regra: z.enum(REGRAS_DA_CONDICIONAL).default("todas"),
  condicoes: z.array(condicaoDoFluxoSchema).min(1).max(20),
});

// ── #6 Distribuidor ─────────────────────────────────────────────────────────
export const MODOS_DO_DISTRIBUIDOR = ["proximo", "fixo_por_contato"] as const;
export const distribuidorConfigSchema = z
  .strictObject({
    /** `proximo` = round-robin puro; `fixo_por_contato` = quem já passou volta pela mesma saída. */
    modo: z.enum(MODOS_DO_DISTRIBUIDOR).default("fixo_por_contato"),
    saidas: z.array(z.strictObject({ id: idDeItem, nome: z.string().min(1).max(40) })).min(2).max(10),
  })
  .refine((c) => new Set(c.saidas.map((s) => s.id)).size === c.saidas.length, {
    message: "saídas com id repetido",
    path: ["saidas"],
  });

// ── #7 Conexão de fluxo ─────────────────────────────────────────────────────
export const conexaoFluxoConfigSchema = z.strictObject({
  fluxo_id: z.string().uuid(),
  retornar: z.boolean().default(false),
});

// ── #8 Pixel (Meta Conversions API) ─────────────────────────────────────────
export const EVENTOS_DO_PIXEL = [
  "Purchase",
  "Lead",
  "InitiateCheckout",
  "AddToCart",
  "ViewContent",
  "CompleteRegistration",
] as const;

export const pixelConfigSchema = z
  .strictObject({
    /** Id da configuração de conversão da organização (Configurações › Conversões). */
    pixel_id: z.string().min(1).max(80),
    evento: z.enum(EVENTOS_DO_PIXEL),
    page_id: z.string().min(1).max(200),
    valor: z.string().min(1).max(200).optional(),
    moeda: z.string().regex(/^[A-Z]{3}$/).default("BRL"),
  })
  .refine((c) => c.evento !== "Purchase" || Boolean(c.valor), {
    message: "evento Compra exige o valor do item",
    path: ["valor"],
  });

// ── #9 Intervalo inteligente ────────────────────────────────────────────────
const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
export const UNIDADES_DO_INTERVALO = ["segundos", "minutos", "horas", "dias"] as const;

export const intervaloConfigSchema = z.discriminatedUnion("modo", [
  z
    .strictObject({
      modo: z.literal("duracao"),
      valor: z.number().int().min(1),
      unidade: z.enum(UNIDADES_DO_INTERVALO),
    })
    .refine(
      (c) => c.valor * { segundos: 1, minutos: 60, horas: 3600, dias: 86400 }[c.unidade] <= 31 * 86400,
      { message: "o intervalo máximo é 31 dias", path: ["valor"] },
    ),
  /** Data/hora ISO ou variável (`{data_sessao}`), resolvida na execução. */
  z.strictObject({ modo: z.literal("data"), quando: z.string().min(1).max(200) }),
  z.strictObject({
    modo: z.literal("horarios"),
    janelas: z
      .array(z.strictObject({ dia: z.number().int().min(0).max(6), inicio: horaHHMM, fim: horaHHMM }))
      .min(1)
      .max(21),
  }),
]);

// ── #10 Bloco de IA ─────────────────────────────────────────────────────────
export const PROVEDORES_DO_BLOCO_DE_IA = ["openai", "google", "anthropic", "groq"] as const;

export const blocoIaConfigSchema = z.strictObject({
  provedor: z.enum(PROVEDORES_DO_BLOCO_DE_IA),
  /** Credencial cadastrada pela empresa; ausente = a escada de chaves da organização. */
  credencial_id: z.string().uuid().optional(),
  modelo: z.string().min(1).max(120),
  mensagem: z.string().min(1).max(4000).default("{last_user_message}"),
  salvar_em: z.string().regex(/^[a-z][a-z0-9_.]*$/).max(60).default("ai.response"),
  enviar_resposta: z.boolean().default(true),
  prompt: z.string().max(8000).default(""),
  entender: z
    .strictObject({ audio: z.boolean(), imagem: z.boolean(), pdf: z.boolean() })
    .default({ audio: false, imagem: false, pdf: false }),
  condicionais: z
    .array(z.strictObject({ id: idDeItem, nome: z.string().min(1).max(60), descricao: z.string().min(1).max(500) }))
    .max(10)
    .default([]),
  contexto: z
    .strictObject({ ativo: z.boolean(), interacoes: z.number().int().min(1).max(20) })
    .default({ ativo: false, interacoes: 5 }),
});

// ── #11 Kanban ──────────────────────────────────────────────────────────────
export const kanbanConfigSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("adicionar"), pipeline_id: z.string().uuid(), stage_id: z.string().uuid().optional() }),
  z.strictObject({ acao: z.literal("mover"), pipeline_id: z.string().uuid(), stage_id: z.string().uuid() }),
  z.strictObject({ acao: z.literal("remover"), pipeline_id: z.string().uuid() }),
]);

/** Os 11 tipos, na ordem do painel de ferramentas. */
export const TIPOS_DE_BLOCO_DO_FLUXO = [
  "mensagem",
  "etiquetas",
  "aguardar_resposta",
  "notificacao",
  "condicional",
  "distribuidor",
  "conexao_fluxo",
  "pixel",
  "intervalo",
  "bloco_ia",
  "kanban",
] as const;
export type TipoDeBlocoDoFluxo = (typeof TIPOS_DE_BLOCO_DO_FLUXO)[number];

/** O `config` de cada tipo — a fonte da união em `graph-schema.ts`. */
export const CONFIG_DO_BLOCO = {
  mensagem: mensagemConfigSchema,
  etiquetas: etiquetasConfigSchema,
  aguardar_resposta: aguardarRespostaConfigSchema,
  notificacao: notificacaoConfigSchema,
  condicional: condicionalConfigSchema,
  distribuidor: distribuidorConfigSchema,
  conexao_fluxo: conexaoFluxoConfigSchema,
  pixel: pixelConfigSchema,
  intervalo: intervaloConfigSchema,
  bloco_ia: blocoIaConfigSchema,
  kanban: kanbanConfigSchema,
} as const satisfies Record<TipoDeBlocoDoFluxo, z.ZodTypeAny>;
