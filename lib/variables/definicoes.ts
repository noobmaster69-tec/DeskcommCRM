import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CHAVE_DE_VARIAVEL, NOMES_RESERVADOS, TIPOS_DE_VARIAVEL } from "./sistema";

/** Uma variável personalizada da organização (tabela `contact_custom_fields`, 9013). */
export interface VariavelPersonalizada {
  id: string;
  key: string;
  label: string;
  type: (typeof TIPOS_DE_VARIAVEL)[number];
  options: string[];
  default_value: string | null;
  position: number;
  visible_in_profile: boolean;
}

export const variavelPersonalizadaSchema = z
  .strictObject({
    key: z
      .string()
      .trim()
      .regex(CHAVE_DE_VARIAVEL, "use letras minúsculas, números e _ (começando por letra)")
      .refine((k) => !NOMES_RESERVADOS.has(k), "este nome é de uma variável do sistema"),
    label: z.string().trim().min(1).max(80),
    type: z.enum(TIPOS_DE_VARIAVEL).default("texto"),
    options: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    default_value: z.string().max(500).nullable().default(null),
    position: z.number().int().min(0).max(10_000).default(0),
    visible_in_profile: z.boolean().default(true),
  })
  .refine((v) => v.type !== "selecao" || v.options.length > 0, {
    message: "seleção precisa de pelo menos uma opção",
    path: ["options"],
  });

export const editarVariavelSchema = z.strictObject({
  label: z.string().trim().min(1).max(80).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  default_value: z.string().max(500).nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  visible_in_profile: z.boolean().optional(),
});

const COLUNAS = "id, key, label, type, options, default_value, position, visible_in_profile";

/** As variáveis da organização, na ordem da tela. Falha de leitura = lista vazia (nunca derruba envio). */
export async function lerVariaveisDaOrganizacao(db: SupabaseClient, org: string): Promise<VariavelPersonalizada[]> {
  const { data, error } = await db
    .from("contact_custom_fields")
    .select(COLUNAS)
    .eq("organization_id", org)
    .order("position", { ascending: true })
    .order("label", { ascending: true });
  if (error) return [];
  return ((data ?? []) as VariavelPersonalizada[]).map((v) => ({
    ...v,
    options: Array.isArray(v.options) ? v.options.map(String) : [],
  }));
}

/** As chaves e os padrões, no formato que o renderizador pede. */
export function paraRenderizar(vars: readonly VariavelPersonalizada[]): { personalizadas: string[]; padroes: Record<string, string> } {
  const padroes: Record<string, string> = {};
  for (const v of vars) if (v.default_value) padroes[v.key] = v.default_value;
  return { personalizadas: vars.map((v) => v.key), padroes };
}

export { COLUNAS as COLUNAS_DA_VARIAVEL };
