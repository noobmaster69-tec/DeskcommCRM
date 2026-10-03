import { redirect } from "next/navigation";

/**
 * `/app/kanban` era a lista de funis. Desde os CRMs (migration 9004) a porta é
 * `/app/crms`: a grade dos CRMs, e dentro de cada um a lista dos funis dele.
 *
 * O endereço antigo continua respondendo para não quebrar link salvo, aba
 * aberta, notificação já entregue nem extensão que ainda aponte para ele. A
 * query vai junto — ninguém perde o que pediu no caminho.
 */
export default async function KanbanAntigo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) query.append(chave, v);
  }
  const resto = query.toString();
  redirect(resto ? `/app/crms?${resto}` : "/app/crms");
}
