---
impacto: capacidade_nova
secao: adicionado
titulo: CRMs agrupam os funis da organização (base e API)
---
Os funis agora pertencem a um CRM: um grupo de funis com público ou marca próprios, como "Clientes Girly" ou "PA Advogados - EUROPA". Ao atualizar, cada organização ganha um CRM "PADRÃO" com todos os funis que já existiam. Nada muda nas telas por enquanto, e todo funil criado sem CRM continua entrando no padrão. A API ganhou `/api/v1/crms` para listar (com o número de leads e de funis de cada CRM), criar, editar, eleger o padrão, arquivar e duplicar CRMs; em `/api/v1/pipelines`, dá para filtrar por `crm_id`, criar um funil dentro de um CRM e mover um funil de um CRM para outro.
