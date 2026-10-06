import { fail } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";

/**
 * A falha ao GRAVAR uma credencial de IA virando resposta HTTP (fork jhoow).
 * Antes, cifragem e banco caíam no mesmo "Erro interno" — e a causa real
 * (AI_CRED_AES_KEY em hex, que o código só lia em base64) ficou invisível.
 * Agora: log estruturado com o requestId (sem a chave, nunca) e uma frase que
 * diz o que fazer. Cifragem é configuração da INSTALAÇÃO, não de quem cadastra.
 */
export function respostaDeFalhaAoGuardar(
  motivo: "cifragem" | "banco" | string,
  detalhe: string | undefined,
  { requestId, t, operacao }: { requestId: string; t: (s: string) => string; operacao: "criar" | "atualizar" },
) {
  logger.error("[ai.credentials] falha ao gravar credencial", { requestId, operacao, motivo, detalhe });
  if (motivo === "cifragem") {
    return fail(
      "credencial_cifra_indisponivel",
      t(
        "A chave de criptografia do servidor (AI_CRED_AES_KEY) está ausente ou em formato inválido, então nenhuma chave de API pode ser guardada. Isso é configuração da instalação — avise o administrador.",
      ),
      500,
      { requestId },
    );
  }
  return fail(
    "internal_error",
    t("Não foi possível gravar a chave no banco. Tente de novo; se continuar, informe o ID abaixo ao suporte."),
    500,
    { requestId },
  );
}
