import type { NodeType } from "@/lib/followup/graph-schema";

/**
 * A linha de explicação de cada bloco no popover Ferramentas (fork jhoow, item
 * 10) — o "o que isto faz" em uma frase curta, como no Leona. Tabela constante
 * para o `t()` achar cada frase no dicionário (chave dinâmica não é traduzível).
 */
export const DESCRICAO_DO_BLOCO: Partial<Record<NodeType, string>> = {
  trigger: "Onde o fluxo começa",
  mensagem: "Envia textos, mídias e pausas",
  etiquetas: "Adiciona ou remove etiquetas do contato",
  aguardar_resposta: "Espera o cliente responder",
  intervalo: "Pausa por um tempo ou até uma data",
  condicional: "Divide o caminho por regras",
  distribuidor: "Reparte os contatos entre saídas",
  conexao_fluxo: "Continua em outro fluxo",
  kanban: "Cria, move ou remove o card no funil",
  notificacao: "Avisa a equipe no WhatsApp",
  pixel: "Envia um evento para a Meta",
  bloco_ia: "Responde ou decide com IA",
  end: "Encerra o fluxo",
};
