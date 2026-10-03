---
impacto: capacidade_nova
secao: adicionado
titulo: Fluxos — Bloco de IA
---
Novo **Bloco de IA** no construtor de Fluxos: chama um modelo de qualquer provedor de IA › Credenciais (Anthropic, OpenAI, Google, OpenRouter, DeepSeek, Requesty ou personalizado) com instruções e a mensagem do lead, com a opção de levar a conversa recente e de entender a imagem, o PDF ou o áudio (pela transcrição) da última mensagem. A resposta pode ser enviada ao lead e é salva num campo da ficha (`{ai.response}` por padrão), que os blocos seguintes já podem usar. Com **saídas da IA** ("quer comprar", "dúvida de prazo"…), a própria IA escolhe por qual saída o contato segue; quando nenhuma serve, ele segue por "Nenhuma delas". A chave nunca fica no fluxo: o bloco usa a credencial cadastrada em IA › Credenciais (a escolhida, ou a ativa do provedor). Se a chamada falhar — sem chave, erro do provedor —, o contato segue pela saída "Falhou", que precisa estar ligada para publicar.
