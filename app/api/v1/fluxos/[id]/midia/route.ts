import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { transcodificarNotaDeVoz } from "@/lib/messaging/media/voice-transcode";
import { midiaEhDoFluxoDaOrganizacao } from "@/lib/fluxos/motor-supabase";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

/**
 * Mídia dos blocos de FLUXO (fork jhoow, Fase B).
 *
 * POST — sobe o arquivo do bloco Mensagem (manager+): a MESMA validação e a
 *   MESMA transcodificação de voz do Inbox (`webm`/`mp3` gravado vira OGG/OPUS,
 *   que o WhatsApp toca como nota de voz). Mora em `<org>/fluxos/<fluxo>/…`; na
 *   hora do envio o motor copia para a pasta da conversa, porque a cadeia de
 *   envio só aceita mídia da conversa.
 * GET ?path= — link assinado (10 min) para a prévia no editor, só de arquivo
 *   deste fluxo nesta organização.
 */
type Ctx = { params: Promise<{ id: string }> };
const BUCKET = "whatsapp-media";

async function fluxoDaOrganizacao(orgId: string, id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) return false;
  const db = await createClient();
  const { data } = await db
    .from("followup_flow_pointers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("surface", "fluxo")
    .maybeSingle();
  return Boolean(data);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  if (!(await fluxoDaOrganizacao(authz.org.orgId, id))) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_MEDIA_BYTES + 1_048_576) return fail("payload_too_large", "Arquivo acima de 50MB.", 413, { requestId });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("validation_failed", "Envie o arquivo no campo 'file'.", 422, { requestId });
  const mime = file.type || "application/octet-stream";
  const veredito = validateOutboundMedia(mime, file.size);
  if (!veredito.ok) {
    const status = veredito.code === "payload_too_large" ? 413 : veredito.code === "unsupported_media_type" ? 415 : 422;
    return fail(veredito.code, veredito.message, status, { requestId });
  }
  const audio = await transcodificarNotaDeVoz({ buffer: Buffer.from(await file.arrayBuffer()), mime });
  const caminho = `${authz.org.orgId}/fluxos/${id}/${randomUUID()}.${extFromMime(audio.mime)}`;
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(caminho, audio.buffer, { contentType: audio.mime, upsert: false });
  if (error) return fail("internal_error", "Não foi possível guardar o arquivo.", 500, { requestId });
  void audit({
    action: "fluxo.midia_enviada",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "followup_flow_pointer",
    resourceId: id,
    requestId,
    metadata: { mime: audio.mime, bytes: audio.buffer.length },
  });
  return ok(
    { storage_path: caminho, mime: audio.mime, nome_arquivo: file.name || null, kind: veredito.kind },
    { requestId, status: 201 },
  );
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fluxos" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  const caminho = req.nextUrl.searchParams.get("path") ?? "";
  if (!midiaEhDoFluxoDaOrganizacao(caminho, authz.org.orgId) || caminho.split("/")[2] !== id)
    return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(caminho, 600);
  if (error || !data) return fail("not_found", "Arquivo não encontrado.", 404, { requestId });
  return ok({ url: data.signedUrl }, { requestId });
}
