---
impacto: capacidade_nova
secao: adicionado
titulo: Fluxos — bloco Pixel
---
Novo bloco **Pixel** no construtor de Fluxos: manda um evento para a Meta (Compra, Lead, Início de pagamento, Adicionar ao carrinho, Ver conteúdo ou Cadastro concluído) pela conexão de **Configurações › Conversões**. Se o contato veio de um anúncio clique-para-WhatsApp, o evento é atribuído ao clique (o Lead sai como lead de conversa); se não, sai identificado pelo telefone. O valor aceita variável e formatos como `R$ 29,90`, e a Compra exige valor. Um pixel que falha fica registrado nas execuções e não interrompe o fluxo.
