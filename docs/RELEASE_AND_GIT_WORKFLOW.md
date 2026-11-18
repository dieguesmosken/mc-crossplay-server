# Release, versionamento e fluxo Git/GitHub

Este documento define o procedimento oficial para registrar entregas, criar versões, publicar alterações e abrir Pull Requests no projeto Minecraft Crossplay Server.

É a referência detalhada para tarefas de changelog, versionamento e publicação. O `AGENTS.md` deve manter apenas uma regra curta apontando para este documento, evitando duplicar todo o procedimento.

## 1. Arquivos e responsabilidades

- `CHANGELOG.md`: histórico das entregas efetivamente disponibilizadas por versão.
- `docs/ROADMAP.md`: planejamento, fases, tarefas pendentes e andamento futuro. Uma tarefa marcada no roadmap não é automaticamente uma versão.
- `ChatGPT.md`: relatórios de comunicação e auditoria destinados ao ChatGPT, com timestamp em `America/Sao_Paulo`.
- `AGENTS.md`: regras permanentes e resumidas para agentes; deve instruir a leitura deste documento antes de versionar, alterar o changelog, criar tags, fazer push ou abrir Pull Requests.
- Este arquivo (`docs/RELEASE_AND_GIT_WORKFLOW.md`): procedimento completo de versionamento e publicação.

Não misture o histórico do projeto Python antigo com o histórico da nova plataforma. A branch `main` preserva o backup anterior; alterações no changelog da nova plataforma devem ser feitas somente na branch de desenvolvimento, salvo autorização expressa em contrário.

## 2. Quando criar uma versão

Uma versão pode ser criada assim que existir uma entrega concreta que o usuário consiga visualizar, executar ou testar. A entrega não precisa representar uma funcionalidade completa nem o fim de uma fase do roadmap.

Exemplos de entregas que podem justificar uma versão:

- Uma página ou painel que abre e pode ser visualizado no navegador, mesmo que ainda use dados fictícios ou não tenha integração com a API. Dados fictícios devem estar claramente identificados como demonstração.
- Uma estrutura inicial do servidor Minecraft que inicia e permanece executando, mesmo que ainda não aceite conexões.
- Uma API inicial que inicia e responde a uma rota implementada, mesmo que ainda não tenha todos os recursos previstos.
- Uma integração Java/Bedrock que já possa ser demonstrada ou testada, mesmo com limitações explicitamente documentadas.

Não crie uma versão apenas por causa de:

- alterações internas de configuração sem resultado demonstrável;
- documentação isolada;
- refatorações sem mudança observável ou executável;
- código incompleto que não inicia, não pode ser visualizado e não pode ser testado;
- uma tarefa marcada como concluída no roadmap sem evidência de funcionamento.

Trabalho em andamento que ainda não atende aos critérios fica em `Unreleased` no `CHANGELOG.md` ou permanece apenas no roadmap, conforme o caso.

## 3. Numeração das versões

Durante a fase inicial, use números incrementais simples, começando em `0.0.1` e seguindo `0.0.2`, `0.0.3`, `0.0.4` e assim por diante. Não pule números sem motivo documentado e não reutilize números já publicados.

A versão `1.0.0` fica reservada para o primeiro MVP acordado e validado. Não é necessário que todo o roadmap esteja concluído para chegar a `1.0.0`; os critérios do MVP devem estar claros e testados.

Cada versão deve corresponder a uma entrega real, registrada no changelog e vinculada ao commit exato por uma Git tag anotada.

## 4. Estrutura do CHANGELOG.md

Mantenha uma seção `Unreleased` no topo para mudanças ainda não versionadas. Quando uma entrega atender aos critérios de versão:

1. Escolha o próximo número disponível.
2. Mova somente as alterações correspondentes de `Unreleased` para a nova seção.
3. Registre a data e hora reais em `America/Sao_Paulo`, com offset, por exemplo: `2026-11-18T06:50:00-03:00 [America/Sao_Paulo]`.
4. Descreva o que o usuário consegue efetivamente visualizar, executar ou testar.
5. Inclua instruções mínimas para reproduzir/visualizar a entrega.
6. Registre os testes executados e seus resultados.
7. Declare limitações conhecidas e funcionalidades que ainda não foram testadas.
8. Inclua o hash completo do commit da entrega depois que ele existir.

Organize as mudanças, quando aplicável, sob títulos como `Added`, `Changed`, `Fixed`, `Removed` e `Known Limitations`. Escreva em português claro e não declare como funcional algo que não tenha sido testado. Por exemplo, iniciar o container não comprova, por si só, uma conexão real de cliente Java ou Bedrock.

Use sempre a hora real no momento do registro. No WSL/Linux, obtenha-a com:

```bash
TZ=America/Sao_Paulo date --iso-8601=seconds
```

Não invente timestamps retroativos. Só atribua horário a registros antigos quando houver evidência confiável.

## 5. Git tags

Para cada versão validada, crie uma tag anotada no formato `v0.0.1`, `v0.0.2` etc., apontando para o commit exato daquela entrega.

Antes de criar uma tag:

- confirme que a versão ainda não existe localmente nem no remote;
- confirme que o commit contém a entrega descrita;
- confirme que os testes e limitações foram registrados;
- não mova, substitua ou apague tags existentes.

Exemplo de criação depois de confirmado o commit:

```bash
git tag -a v0.0.1 -m "Release v0.0.1"
```

Publique a tag no GitHub junto com a branch, somente após as verificações de segurança descritas abaixo.

## 6. Diferença entre operações Git

Não confunda estas operações:

- `git commit`: grava alterações no histórico local.
- `git push`: envia commits locais para o repositório remoto no GitHub.
- `git fetch`: consulta e baixa referências/objetos do remote sem integrar automaticamente alterações ao working tree.
- `git pull`: busca e integra alterações do remote na branch local.
- Pull Request (PR): solicita revisão e integração de uma branch em outra; não é sinônimo de push ou pull.

O botão de sincronização do VS Code pode executar operações de envio e recebimento. Não deve ser necessário clicar nele quando o push pelo terminal concluir corretamente.

## 7. Publicação automática e segura

Depois de concluir uma tarefa solicitada, quando as alterações pertinentes tiverem sido commitadas, publique automaticamente a branch de desenvolvimento no GitHub, sem depender de clique manual no VS Code, desde que todas as verificações abaixo sejam aprovadas.

Antes de fazer push:

1. Execute `git status --short --branch` e confira arquivos staged, unstaged e untracked.
2. Confirme a branch atual. O trabalho normal deve ocorrer na branch de desenvolvimento, por exemplo `rebuild/java-bedrock-platform`, nunca diretamente em `main`.
3. Confira `git remote -v` e confirme que `origin` aponta para `dieguesmosken/mc-crossplay-server`.
4. Execute `git fetch origin`.
5. Confira o upstream e compare a branch local com a branch remota.
6. Confirme que os commits a publicar pertencem à branch correta e que não há alterações alheias sendo incluídas.
7. Se a branch local estiver simplesmente à frente da remota e não houver divergência, faça push normalmente.
8. Se ainda não houver upstream, confirme o nome da branch e configure o upstream para a branch remota correspondente com `git push -u origin <branch>`.
9. Se a branch remota estiver à frente, avalie se um `git pull --ff-only` é seguro. Só integre dessa forma se o working tree estiver limpo e a operação for fast-forward.
10. Se houver divergência, conflito, rejeição, destino inesperado ou dúvida, não tente resolver automaticamente. Pare e informe exatamente o que aconteceu.
11. Após o push, confirme o sucesso e verifique que o remote aponta para o commit esperado.

Nunca use automaticamente:

- `git push --force` ou `git push --force-with-lease`;
- `git reset --hard`;
- `git clean -fd` ou comandos equivalentes de remoção;
- rebase de commits já publicados;
- push direto para `main`;
- exclusão, substituição ou movimentação de tags existentes.

Não faça push de arquivos não commitados, segredos, `.env` reais ou alterações alheias à tarefa. Não descarte alterações do usuário.

Se o push falhar por autenticação, permissão, proteção de branch, rede ou divergência, preserve os commits locais e informe a mensagem de erro. Não afirme que publicou quando só criou o commit local.

## 8. Pull Requests

O fluxo normal de desenvolvimento usa uma branch de trabalho e envia alterações para revisão em `main` por Pull Request. A `main` deve continuar preservando o backup anterior até que o usuário aprove uma integração.

Depois de publicar uma entrega/marco relevante:

1. Verifique se já existe um Pull Request aberto da branch de desenvolvimento para `main`.
2. Se existir, mantenha-o atualizado com a branch publicada e acrescente informações relevantes à descrição, sem apagar contexto útil.
3. Se não existir, crie um Pull Request em modo Draft, da branch de desenvolvimento para `main`.
4. Descreva resumo, arquivos/áreas afetadas, testes, limitações e versões/tags relacionadas.
5. Informe a URL do PR no relatório.

Não faça merge automaticamente, não altere a branch base sem autorização e não feche PR existente sem autorização. Se o GitHub não permitir criar/atualizar o PR, informe o motivo.

## 9. Critérios de conclusão e relatório

Ao finalizar uma tarefa que envolva entrega, commit ou publicação:

- atualize `CHANGELOG.md` se houver uma entrega versionável; caso contrário, mantenha o trabalho em `Unreleased`;
- atualize `docs/ROADMAP.md` somente com o estado realmente verificado;
- atualize `ChatGPT.md` com timestamp real de `America/Sao_Paulo`;
- registre arquivos criados, alterados e removidos;
- registre comandos relevantes, testes executados e resultados;
- informe commit(s) e hash(s);
- informe se o push foi confirmado ou se permaneceu somente local;
- informe tag(s) criadas, se houver;
- informe URL do Pull Request, se criado ou atualizado;
- liste limitações, bloqueios e próximo passo recomendado.

Nunca declare uma entrega, teste, versão, tag, push ou PR como concluído sem evidência correspondente.

## 10. Segurança e autorização

Este procedimento autoriza o push normal da branch de desenvolvimento após as verificações descritas, como parte da conclusão de uma tarefa solicitada. Não autoriza push para `main`, force push, merge, deploy, exclusões remotas, limpeza de volumes/dados persistentes ou outras operações destrutivas. Essas operações continuam exigindo autorização explícita do usuário.
