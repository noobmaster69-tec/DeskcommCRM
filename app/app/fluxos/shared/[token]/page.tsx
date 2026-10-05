import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { ArrowLeft, Eye } from "@/lib/ui/icons";
import { FluxoSomenteLeituraDinamico } from "../../_editor/FluxoSomenteLeituraDinamico";

export const dynamic = "force-dynamic";

/**
 * /app/fluxos/shared/[token] — o fluxo compartilhado, somente leitura (fork
 * jhoow, item 2). Quem abre pode ser de outra organização: a leitura passa por
 * `fn_fluxo_compartilhado` (migration 9010), que devolve só nome e grafo. Exige
 * login — o link não é público na internet.
 */
export default async function FluxoCompartilhadoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireAuth();
  if (!z.string().uuid().safeParse(token).success) notFound();
  const t = (texto: string) => traduzir(texto, user.idioma);

  const supabase = await createClient();
  const { data } = await supabase.rpc("fn_fluxo_compartilhado", { p_token: token });
  const linha = (Array.isArray(data) ? data[0] : null) as { nome: string; grafo: unknown } | null;
  const grafo = linha ? flowGraphSchema.safeParse(linha.grafo) : null;
  if (!linha || !grafo?.success) notFound();

  return (
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-[420px] flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link href="/app/fluxos" className="text-text-muted hover:text-text" aria-label={t("Voltar para Fluxos")}>
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold">{linha.nome}</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-muted">
          <Eye size={12} aria-hidden />
          {t("Somente leitura")}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <FluxoSomenteLeituraDinamico grafo={grafo.data} />
      </div>
    </div>
  );
}
