---
impacto: capacidade_nova
secao: adicionado
titulo: Fluxos — os primeiros blocos rodando (Mensagem, Etiquetas, Aguardar resposta)
---
Os fluxos passam a rodar de verdade. Três blocos ficam disponíveis no editor: **Mensagem** (uma sequência de texto, imagem, vídeo, áudio como nota de voz, arquivo, figurinha e contato, com intervalos que mostram "digitando…" ou "gravando…"), **Etiquetas** (adiciona ou remove etiquetas do contato) e **Aguardar resposta** (pergunta, espera a resposta com tempo máximo, e segue pelas saídas "Respondeu" ou "Não respondeu"; pode juntar mensagens seguidas, salvar a resposta num campo da ficha, reagir com emoji e responder citando). Os textos aceitam variáveis como `{nome}` e `{primeiro_nome}`. Para colocar alguém num fluxo publicado, use o novo botão "Disparar fluxo" no cabeçalho da conversa do Inbox. Enquanto o contato está num fluxo, o agente de IA não responde a ele. O fluxo roda na hora, pelo worker, sem esperar o relógio de minuto dos follow-ups. Quem atualiza não precisa fazer nada: a mudança de banco (migration 9003) chega pelo `update.sh`.
