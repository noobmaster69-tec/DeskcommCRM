# Campos do contato + Ritmo e Programação (6 out)

Branch `jhoow/main`. Imagem `e03f43d` no ar no staging. Produção (`/opt/deskcommcrm`) **não foi tocada**.
O rastreamento e a atribuição de anúncios saíram do escopo, como pedido; nada disso tinha sido implementado.

| Parte | Commit | Migration |
|---|---|---|
| Ritmo e Programação: início agendado (data, HH:mm, fuso IANA), janela em HH:mm, resumo dinâmico, motivo real da espera | `f7f59af` | **9018** |
| Campos por contato, resolução única de variáveis, idioma da conversa, importação mapeada | `e03f43d` | **9019** |

**Banco do staging:** a 9018 e a 9019 foram aplicadas com psql, com snapshot antes em `/root/backups/staging-antes-9018-9019-*`. Na produção, as migrations 9010–9019 precisam entrar ANTES da imagem.

## Prova pela tela e no banco

Só com contato de teste e um número STOPPED: nenhuma mensagem saiu.

**Agendamento (resumo dinâmico):**
- 03/12/2026 12:00 Europe/Lisbon. O resumo diz "Início programado para 03/12/2026 às 12:00, no fuso de Portugal — faltam 58 dias, 12 horas e 19 minutos." No banco, `2026-12-03 12:00 UTC` (inverno = UTC+0).
- Mesmo dia: "Agora em Portugal são 00:41 — início programado para hoje às 02:11, em 1 hora e 30 minutos."
- Horário passado mostra erro e não deixa salvar.
- A janela 09:00–18:00 avisa que desloca o início das 21:00 para 04/12 às 09:00.
- Recarregar a edição mantém data, hora e fuso. A tela distingue prévia não salva, planejado, agendamento confirmado e em execução. 390px sem rolagem.

**Worker, com o scheduler reiniciado ANTES do horário:**
- A campanha agendada para 00:51 de Lisboa (23:51 UTC) foi iniciada às 23:51:00.672 UTC: sem antecipar, sem duplicar.
- Como o número estava parado, a rodada gravou `sem_numero_livre` e a tela mostra "Não está enviando agora: Nenhum número pode enviar agora…". 0 mensagens.

**Ficha de campos (página do contato e Inbox):**
- Nome curto "Ana Paula" + tratamento "Dra." confirmado resultam em "Dra. Ana Paula" no {nome_saudacao}, e o valor fica salvo depois de recarregar.

**Prévia por contato:** "{saudacao_horario}, {nome_saudacao}, tudo bem? Vi que é {profissao_singular} em {cidade|Portugal}." vira "Boa noite, Dra. Ana Paula, tudo bem? Vi que é dentista em Lisboa."

**Importação mapeada em Contatos:**
- 1 contato criado e 1 atualizado.
- A cidade foi atualizada; a célula vazia de "Tratamento" NÃO apagou o "Dra.".

Os testes de unidade, guardas e invariantes do escopo estão verdes. Os dados de teste foram apagados; claude-prints voltou a agent.

## Como usar

- **Editar campos:**
  - no Inbox: painel do contato › "Campos personalizados" › Editar no grupo;
  - ou na página do contato.
- **Criar ou configurar um campo:** em Configurações › Variáveis. Uma variável com a MESMA chave de um campo padrão (ex.: `idioma_conversa`, tipo seleção) dá a ele as opções.
- **Programar uma campanha:**
  1. No formulário, "Ritmo e Programação" › Agendar › data, hora, minuto e fuso.
  2. Salvar.
  3. Preparar lista.
  4. Confirmar agendamento.
  - O servidor inicia sozinho, mesmo com o navegador fechado.

## Pendências e decisões

- **Os 5 idiomas configurados:** não foram encontrados no código, no banco do staging nem na conta Leona, e não foram inventados. Basta configurar `idioma_conversa` como seleção em Configurações › Variáveis.
- **"Iniciar agora" vs "Agendar":** o rascunho guarda só a intenção. O agendamento é confirmado depois de preparar a lista, porque é a preparação que diz quem recebe.
- **Profissão no idioma da conversa:** é texto da ficha. Não há tradução automática, e as afirmações fixas da copy não são alteradas.
- **Arquivo da importação de teste:** ficou no bucket privado `campaign-audiences/<org>/contatos/`. Só a API de storage o remove.

---

# Campanhas: aprimoramento grande (7 itens), 5 out

Branch `jhoow/main`. Imagem `3289d4f` no ar no staging. Produção (`/opt/deskcommcrm`) **não foi tocada**.
O inventário que veio antes está em `jhoow/campanhas/INVENTARIO.md` (`b9a603f`).

| # | Item | Status | Commit |
|---|------|--------|--------|
| 2 | Variáveis do sistema + da organização (Configurações › Variáveis) | ✅ migration **9013** | `9a977f9` |
| — | Um formulário só para criar e editar. Antes, salvar um rascunho editado apagava funil, etapa, ritmo e números | ✅ | `942eac9` |
| 4 | Campanha que inicia um fluxo | ✅ migration **9014** | `05475c2` |
| 7 | Intervalo aleatório (mín./máx.) + fuso da campanha e do contato | ✅ migration **9015** | `7e66c19` |
| 6 | Base legal "consentimento" só envia para quem consentiu; card de consentimento no contato | ✅ | `07e4156` |
| 3 | Progresso no funil: quem recebe → quem responde | ✅ migration **9016** | `dcfd851` |
| 5 | "Quem responder" todo opcional | ✅ | `52fa7ad` |
| 1 | Fonte do público: Do CRM / Por etiqueta / Importar lista (CSV/XLSX) | ✅ migration **9017** | `2c5001c` + `3289d4f` |

**Banco do staging:** as migrations 9013–9017 foram aplicadas à mão com psql. O snapshot de antes está em `/root/backups/staging-antes-9013-9017-*`. Na produção, as 5 precisam ser aplicadas antes da imagem.

**Prova pela tela (`tela-campanhas.cjs`): 15/15 PASS.** Ela cobre:
- os 3 modos;
- a prévia da planilha: 2 válidas de 4, inválida em vermelho, repetida avisada e mapeamento sugerido;
- a importação: 2 contatos e a variável nova criados;
- a contagem da audiência;
- salvar o rascunho, que liga a lista à campanha;
- reabrir no modo certo;
- 390px sem rolagem.

No banco: a lista ficou ligada à campanha, com o arquivo original guardado. Os dados de teste foram apagados depois.

## Decisões e pendências

- **O contato é criado sempre** na importação: o destinatário de campanha é um contato (opt-out, LGPD e a conversa da resposta dependem dele). A opção "criar no CRM" controla **só o card** no funil.
- **Modo 4, consulta avançada (opcional): não feito.** Os modos CRM e etiqueta já cobrem funil, etapas, entrada, etiquetas, interação e variáveis. Uma consulta livre exigiria um construtor de condições E/OU ou SQL restrito. Fica para uma rodada própria.
- **RLS corrigida antes de ir ao ar:** nas tabelas `contact_custom_fields` (9013) e `campaign_audience_sources` (9017), a policy única `for all` deixava o agent **apagar** linhas. Agora são 4 policies: leitura para a organização; criar, alterar e apagar só para manager+. Os invariantes provam isso.
- **Consentimento:** a prova mostrou "0 podem receber · 2 ficam de fora" na lista recém-importada. É o item 6 funcionando: com a base legal "consentimento", contato importado sem consentimento registrado não recebe. Para disparar para uma lista fria, a base precisa ser "interesse legítimo", com LIA.
- **Arquivo original:** fica no bucket privado `campaign-audiences`. O arquivo da prova (um CSV de 4 linhas) continua lá, porque só a API de storage o remove.

---

# Fluxos no modelo Leona: entrega noturna (12 itens)

Branch `jhoow/main`. Base: `3037384`. Produção (`/opt/deskcommcrm`) **não foi tocada**.

## Estado de cada item

| # | Item | Status | Commit |
|---|------|--------|--------|
| 6 | Linha sem "Condição da aresta" | ✅ | `07e4d37` |
| 11 | "Adicionar nó" vira "Ferramentas" | ✅ (⚠️ "Tools": o produto não serve inglês) | `c7631fa` |
| 4 | Botão Ferramentas (popover) + Simular | ✅ | `9c30d52` |
| 8 | Canvas na tela inteira | ✅ | `5fe1363` |
| 9 | Mini-mapa colorido | ✅ | `1b9f052` |
| 5 | Prévia dos blocos (FluxoNode) + contador do Distribuidor | ✅ | `42f587e` |
| 7 | Bloco abre em modal centralizado | ✅ | `908f9cc` |
| 10 | Descrição + prévia no popover | ✅ | `677c1b0` |
| 2 | Menu ⋯ (nome, duplicar, compartilhar, traduzir, ativar, arquivar, excluir) | ✅ migration **9010** | `7679587` |
| 1 | Arrastar fluxo para pasta (@dnd-kit/core) | ✅ | `ee0c01c` |
| 3 | Ordem das pastas, "Sem pasta" por último, reordenar arrastando | ✅ sem migration | `bf8ff5f` + `1c50214` |
| 12 | Tela Disparos (palavras-chave + gatilhos globais), funcionando no motor | ✅ migration **9011** | `58d2097` |

Commits extras:
- `b49498a`: guardas do Tailwind 4 e da fonte única de canais. A varredura ampla achou desvios das fases C/D e dos itens 4/6.
- `80a519d`: o dublê de teste da lista de inscrições não tinha o `.neq` que a Fase B usa.

## O que falta para ver no staging

1. **Rodar o workflow `jhoow-main`** (workflow_dispatch) no GitHub. A VPS não tem `gh` autenticado, e o `pnpm build` não cabe na VPS (1 vCPU, 3,8 GB). O build completo é o do CI.
2. Depois do build, deploy:
   ```
   cd /opt/deskcommcrm-staging && docker compose -p deskcommcrm-staging -f docker-compose.prod.yml -f docker-compose.traefik.yml -f jhoow/staging/docker-compose.staging-overrides.yml --env-file .env pull app worker scheduler && docker compose -p deskcommcrm-staging -f docker-compose.prod.yml -f docker-compose.traefik.yml -f jhoow/staging/docker-compose.staging-overrides.yml --env-file .env up -d --no-deps --force-recreate app worker scheduler
   ```
   As migrations 9010 e 9011 entram pelo baseline, como as anteriores. As duas são aditivas.
3. O que conferir na tela:
   - `/app/fluxos`: "⋯" no hover da linha, filtro Arquivados, arrastar uma linha para uma pasta, "Sem pasta" por último, alça ⋮⋮ nas pastas.
   - Editor de um fluxo: botão roxo Ferramentas, Simular, canvas de ponta a ponta, cartões com prévia, modal ao clicar, mini-mapa colorido, linha sem "Sempre".
   - `/app/disparos`: logo abaixo de Fluxos no menu.

## Decisões principais

- **O construtor é compartilhado com Follow-ups.** Toda mudança de canvas vale só para `surface === "fluxo"`. O `EdgeConfigPanel` e o painel lateral **não foram apagados**: são o editor do Follow-up, onde a condição da aresta faz parte do motor. Em Fluxos eles não aparecem mais.
- **Modal (item 7):** os formulários gravam a cada campo válido. "Salvar" fecha. "Cancelar", X, Esc e clique fora devolvem a foto tirada na abertura do modal.
- **Arquivar** é a coluna `archived_at`, não um novo `status`, porque o motor lê o status. Arquivar um fluxo ativo também o desativa.
- **Compartilhar:** link `/app/fluxos/shared/<token>`, que exige login e é somente leitura. A leitura entre organizações passa por `fn_fluxo_compartilhado` (definer estável, devolve só nome e grafo).
- **Traduzir** cria uma **cópia** rascunho "Nome (EN)". Nunca traduz no lugar. Só mudam os textos que o cliente lê. Uma tradução que perde uma `{variavel}` fica no texto original. Sem provedor em Credenciais, aparece um erro inline com link para a tela.
- **Distribuidor:** "Quantidade" vem do evento `fluxo.distribuido`, o mesmo que o motor conta para o rodízio. É uma contagem `head` por saída e não precisou de migration.
- **Disparos funciona no motor.** Ordem de entrada: palavra-chave da tela Disparos → palavra-gatilho do Início do fluxo → boas-vindas (1ª mensagem) → "primeiro contato" do fluxo → resposta padrão (no máximo 1x a cada N h por contato). "Conversa finalizada" (sem atendente) e "Atendimento finalizado" (com atendente) estão ligados às duas rotas que fecham conversa. Rodam fora do caminho da resposta e nunca falham o fechamento.
- **@dnd-kit/core 6.3.1** foi adicionado com `pnpm add --lockfile-only` (diff aditivo no lockfile). No `node_modules` da VPS ele foi copiado só para os testes. A imagem instala a partir do lockfile.
- **"Tools" (inglês):** o registro de idiomas só tem pt-BR, es e zh-CN em construção. Gravei es "Herramientas" e zh-CN "工具". O inglês entra quando o idioma for registrado.

## Testes rodados (na VPS, em container limitado, sempre por escopo)

- tsc parcial + eslint nos arquivos mexidos, verdes em todos os commits.
- vitest:
  - testes novos de cada item;
  - varredura de 120 guardas que leem o fonte;
  - 105 arquivos de fluxos/follow-up/disparos/drain (1290 testes).
- test:db (install + update do baseline):
  - `fluxo-arquivar-e-compartilhar`, `disparos-dos-fluxos`;
  - `rls-completude-varredura`, `hardening-definer-varredura`, `gov-hardening-anon-definer`.
- Falha que sobra e é do ambiente: `executor-proprio-so-roda-o-que-e-nosso` precisa de `jq`, e a imagem slim do teste não tem.
- **Não rodado:** `pnpm build` completo (o CI faz), suíte inteira e e2e (regra da VPS). A prova pela tela fica para depois do deploy.

## Como desfazer

O código de cada item volta com `git revert <commit>`, um por vez, do mais novo para o mais velho se forem vários. Exemplo:

```
git revert 58d2097   # item 12 (Disparos)
git revert 7679587   # item 2 (menu ⋯)
```

Migrations 9010/9011 são **aditivas** (colunas nulas, tabelas novas, uma função). Reverter o código não exige mexer no banco, porque o que sobra fica sem uso. Pela regra do projeto, nada é apagado do banco sem decisão explícita.

---

# 5 out 2026: composer do Inbox, card de CRM, marca ApexCRM

| Tarefa | Status | Commit |
|---|---|---|
| Correção da prova: mini-mapa do link compartilhado + bloco novo sem sobrepor | ✅ | `ff1b273` |
| 1. Composer compacto (pílulas, Responder ▼, campo que cresce até 4 linhas, Resumir) | ✅ | `91e3ac4` |
| 2. Card de CRM (avatar colorido, botão Abrir CRM, menu ⋯, Ver funis e números, Excluir) | ✅ migration **9012** (já aplicada no staging) | `428f2ee` |
| 3. Favicon + "ApexCRM" na aba | ✅ no staging (configuração da marca da instalação, não código) | `be9ec73` (arquivos do ícone) |

**Bloqueio:** a imagem nova só sai pelo workflow `jhoow-main`, que precisa ser disparado pelo Jhoow. Por isso as tarefas 1 e 2 e a correção `ff1b273` ainda não estão na tela do staging. O nome e o favicon já estão, porque vêm do banco.

**Produção:** em `/admin/marca`, subir `jhoow/marca/apex-icone.png` como Ícone e trocar o nome para ApexCRM. Não toquei na produção.

**Decisões:**
- **Resumir** não existia. Usa o modelo leve da empresa (IA › Credenciais) e não grava nada sozinho: a pessoa decide se salva o resumo como nota.
- **Excluir CRM** é DE VEZ e só passa em CRM sem nenhum negócio e sem captura, automação ou conversão do Google Ads apontando para ele. Quem tem histórico deve ser arquivado.
- O menu do card perdeu "Gerenciar funis" (pedido). Esse caminho agora é o botão "Gerenciar funis" do modal "Ver funis e números", que leva à página do CRM.

Reverter: `git revert be9ec73 428f2ee 91e3ac4 ff1b273`. A migration 9012 só cria funções; reverter o código não exige mexer no banco. A marca volta ao padrão apagando a linha de `platform_branding` (ou trocando o nome e o ícone pela tela).
