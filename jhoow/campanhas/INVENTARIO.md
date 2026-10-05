# Campanhas: inventário antes do aprimoramento (5 out 2026)

## Telas (/app/campaigns)
- `page.tsx` + `_client.tsx` (167): lista das campanhas.
- `new/_client.tsx` (524): criar rascunho. Seções Informações, Público, Mensagem, Quem responder, Ritmo.
- `[id]/_client.tsx` (536): detalhe, com preparar, testar, iniciar/pausar, métricas e destinatários.
- `[id]/edit/_client.tsx` (388): editar rascunho.
- `settings/_client.tsx` (304): padrões de campanha da organização (`organizations.settings.campanhas`).
- Hooks em `hooks/campanhas/` (useCampanhas, useConfiguracao, useDestinoDaCampanha); componente `components/campanhas/EstadoDaCampanha.tsx`.

## Seleção de público hoje
- Não tem nome na tela (só "Público"). O modelo é o FILTRO `campaigns.audience_filter` (`filtroDeAudienciaSchema`, `lib/campanhas/audiencia.ts`): `com_todas_tags`, `com_alguma_tag`, `sem_tags`, `funis`, `etapas`, `responsaveis`, `situacoes_do_negocio`, `sem_interacao_ha_dias`, `com_interacao_nos_ultimos_dias`, `limite` (≤5000).
- A tela usa só alguns desses campos.
- A MESMA função monta a prévia e o snapshot (`consulta-de-audiencia.ts` → `classificarAudiencia`).
- "Preparar" congela a lista em `campaign_recipients` (`contact_id` NOT NULL: todo destinatário é um contato).
- Lista colada foi removida de propósito (decisão de produto registrada em `audiencia.ts`).

## Variáveis / campos personalizados (a suspeita do Jhoow: SIM, metade existe)
- **VALORES:** `contacts.custom_fields` jsonb (migration 0211), limpo pela anonimização LGPD (trigger). `crm_leads.custom_fields` também existe.
- **DEFINIÇÕES:** só por FUNIL, em `crm_pipelines.settings.fields[]` (campos do negócio, exigidos por etapa). Não há definição no nível da ORGANIZAÇÃO nem tela "Variáveis".
- **Fluxos:** `{nome}`, `{primeiro_nome}`, `{telefone}`, `{ultima_mensagem}` e qualquer chave de `contacts.custom_fields` (`lib/fluxos/variaveis.ts`). A lista de chaves vem de amostra (`/api/v1/fluxos/campos`).
- **Campanhas:** sintaxe DIFERENTE, `{{nome}}`, `{{primeiro_nome}}`, `{{saudacao}}` (`lib/campanhas/renderizador.ts`). A saudação é resolvida no envio, no fuso do canal.

## Envio (`lib/campanhas/rodada.ts`, cron `campaign-worker` a cada minuto)
- Por rodada: 1 mensagem por número, até 10 números.
- Pega o 1º `pending` da campanha mais antiga e revalida os vetos por pessoa (opt-out, anonimizado, recusou marketing, telefone, lista de exclusão).
- Ritmo da campanha (`ritmo.ts`: intervalo FIXO, janela, tetos) → rodízio de números com o ritmo do canal (`decidePacing`, aquecimento) → `beginServiceAtOrigin` + `sendMessageHandler`.
- A resposta volta por `resposta.ts` (`replied_at`, atribuição de 72h).
- O card nasce na RESPOSTA, pelo nascimento do lead (`origem-do-lead.ts`: funil/etapa da campanha, se definidos).

## Fuso / idioma
- Não há fuso por contato.
- `organizations.locale` existe; o fuso de referência é o do NÚMERO (`channel_knobs.timezone`, padrão America/Sao_Paulo), usado na janela e na saudação.
- `onboarding_state.welcome.timezone` guarda o fuso escolhido no onboarding (não é lido pelo motor).

## Consentimento
- A base "consent" hoje só EXCLUI quem RECUSOU (`consent.marketing.declined_at`). Quem nunca registrou consentimento RECEBE.
- O campo de consentimento dado já existe: `consent.marketing.granted_at` (escrito pela captura de formulários).
