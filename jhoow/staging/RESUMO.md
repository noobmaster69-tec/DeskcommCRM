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
