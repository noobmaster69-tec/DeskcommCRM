import { randomUUID } from "node:crypto";

import { requireRole } from "@/lib/auth/require-role";
import { generateImportTemplate } from "@/lib/campanhas/import-xlsx";

export const dynamic = "force-dynamic";

/** GET /api/v1/campaigns/import-template — o XLSX modelo (aba "Contatos" com as 18 colunas + aba "Guia"). */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const bytes = generateImportTemplate();
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-contatos.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
