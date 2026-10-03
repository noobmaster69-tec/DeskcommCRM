---
impacto: capacidade_nova
secao: adicionado
titulo: Fluxos — importar fluxo do Leona
---
O botão **Importar** da lista de Fluxos aceita o JSON de um fluxo do Leona (colado ou em arquivo .json) e cria um **rascunho** com os blocos convertidos: mensagens (texto, mídia, intervalos, figurinha), aguardar resposta, condição, distribuidor, intervalo inteligente, conexão de fluxo, kanban, notificação, etiquetas, pixel e bloco de IA. Funis, etapas e fluxos de destino são encontrados pelo nome; as mídias são copiadas para cá, para o fluxo não depender do Leona; saídas sem ligação ganham um Fim; e blocos soltos no Leona (que nunca rodavam) ficam de fora. O que não tem equivalente — integração HTTP, menu, template, pagamento — vira um Fim marcado como "não importado", e a lista de avisos mostra tudo o que precisa de revisão antes de publicar. A chave de API guardada no Bloco de IA do Leona **não** é importada: o bloco usa a credencial de IA › Credenciais.
