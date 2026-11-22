# Changelog

## Unreleased

### Adicionado (issue #25) — plugin Paper (`apps/plugin-paper`, etapa 4)
- Núcleo em Java sem Bukkit e sem dependências (`core`): cliente do contrato (admissions, events, heartbeat) com assinatura HMAC-SHA256, política de falha (`closed`/`open`), bypass local de operadores, validação de configuração (segredo só por `MC_API_SECRET`) e JSON mínimo. Adaptador Paper (`paper`): `AsyncPlayerPreLoginEvent`, join/quit, heartbeat periódico, detecção Java/Bedrock via Floodgate (reflexão) com heurística de UUID de reserva, `plugin.yml` e `config.yml`.
- Fail-closed também na configuração inválida: o plugin continua carregado e nega jogadores comuns, em vez de se desligar.
- `local-bypass.whitelist` vem **desligado** por padrão: quem está no bypass entra fora da fila e do limite de 10 (decisão minha, ainda não aprovada na issue).
- CI: `.github/workflows/plugin-paper.yml` (Java 25, Gradle 9.1.0), que roda em PRs que mexem em `apps/plugin-paper`.
- Testes: 36 testes do núcleo (`gradle --offline -PjavaRelease=21 :core:check`, JDK 21) e 7 de integração do núcleo contra a API real (`apps/api` em Node 22, banco vazio): assinatura HMAC aceita, 11º jogador negado com `SERVER_FULL`, `quit` libera vaga, join idempotente, heartbeat reconcilia. Vetor de assinatura gerado pelo `signRequest` de `packages/shared`.
- **Não executado:** compilação do adaptador `paper` contra o `paper-api` real (só checado contra stubs escritos por mim); carregamento num Paper 26.3; Floodgate/Bedrock; `isOp()/isWhitelisted()` fora da thread principal; o workflow de CI; Java 25 (testes só em JDK 21); etapa 5 (entrada real Java/Bedrock).
- Limitações: a dependência `paper-api:26.3.build.+` está com versão dinâmica e precisa ser fixada; `MC_API_SECRET` ainda não é repassada ao container no `docker-compose.yml`; não há wrapper Gradle commitado.

### Adicionado (issue #25) — API da fila (`apps/api`)
- Fastify + `node:sqlite`: rotas `/v1/server/admissions`, `/v1/server/events` e `/v1/server/heartbeat` (assinadas por HMAC), `/v1/queue/join|leave|status` (site, ainda sem autenticação do jogador) e `/health`. Estado da fila persistido em SQLite e restaurado ao reiniciar.
- `PlayerQueue` ganhou `statusOf` e `restore`; `shared` ganhou `parseServerEvent`.
- Testes: `tests/api.test.mjs` com `app.inject` (10 novos) e 1 novo em `contract.test.mjs`; total 50 com `node --test` após `pnpm build`. **Não executado:** servidor real escutando porta (`pnpm --filter @mc-platform/api start`), Termux, Node 26.
- Limitações: rotas do site permitem enfileirar qualquer UUID e não há limite de pedidos; ver `docs/PLUGIN_CONTRACT.md`.

### Adicionado (issue #25) — contrato do plugin e lógica da fila
- `packages/shared`: identidade de jogador (Java/Bedrock, UUID normalizado), validação de `AdmissionRequest` e `Heartbeat`, respostas `allow`/`deny` com mensagens em PT-BR e assinatura HMAC-SHA256 com janela de tempo.
- `packages/queue`: `PlayerQueue` (lógica pura e em memória): limite de 10 jogadores, fila FIFO, reservas com prazo, reconciliação por heartbeat e relógio injetável.
- `docs/PLUGIN_CONTRACT.md` descreve o fluxo, as rotas planejadas e as regras.
- Testes: `tests/contract.test.mjs` e `tests/queue.test.mjs` (19 novos; total no repositório: 39 com `node --test`, após `pnpm build`). `eslint` e `tsc --noEmit` sem erros. Executado no sandbox com Node 22 (o projeto fixa Node 26); **não executado:** Termux, Node 26, API e plugin (ainda não existem).
- Dependências de desenvolvimento: `@types/node` (fixado); `tsconfig` do `shared` passa a declarar `types: ["node"]` (TypeScript 7 não carrega tipos automaticamente).

### Adicionado (issue #21) — ambientes Linux, WSL2 e Termux
- `scripts/dev/doctor.sh`: detecta a plataforma (Linux/WSL/Termux), confere Java 25+, curl, Node e Docker, avisa sobre repositório em `/mnt/c` no WSL e sugere `MC_JAVA_HEAP`.
- `scripts/dev/run-local.sh`: roda o Paper real sem Docker usando o mesmo `entrypoint.sh` (URL do Paper lida do Dockerfile; EULA nunca aceita automaticamente).
- `.gitattributes` forçando LF em scripts, Dockerfile, YAML, JSON e fontes (evita `.sh` com CRLF no Windows/WSL).
- Testes portáteis: `tests/dev-scripts.test.mjs` (8 testes) e `tests/entrypoint.test.mjs` agora herdam o `PATH` do sistema (funcionam no Termux).
- Verificação: `shellcheck`, `dash -n` e `bash --posix -n` sem erros; testes passando com `dash` e com `bash` como `sh`; `doctor.sh` validado contra OpenJDK 25 real. **Não executado:** Termux real e WSL real (simulados por variáveis de ambiente).
- `docs/DEVELOPMENT_SETUP.md` reescrito com matriz por ambiente.

### Alterado (issues #6, #7 e #8) — comprovado por testes automatizados, ainda não por startup real
- Volume único `./data:/server/data` como diretório de trabalho do Paper: passam a persistir `server.properties`, whitelist, ops, `bukkit.yml`, `spigot.yml` e as dimensões do mundo (antes só `world`, `plugins`, `config`, `logs` eram montados). Layout antigo exige migração manual (ver `infrastructure/docker/README.md`).
- `eula.txt` deixou de ser bind mount de arquivo único (o Docker criava um diretório no lugar dele em clone novo). O entrypoint e `scripts/init-data.sh` criam o arquivo com `eula=false` somente se ausente; a EULA continua sem aceitação automática.
- `restart: "no"` no compose: a saída com código 1 por EULA não aceita não causa mais loop de reinício.
- Verificação de EULA tolera final de linha CRLF.
- Memória configurável: `MC_MEMORY_LIMIT` (padrão `3g`), `MC_JAVA_HEAP` (padrão `2G`, `-Xms` = `-Xmx`) e `MC_JAVA_OPTS`; `.env.example` adicionado.
- Testes: `tests/entrypoint.test.mjs` (8 testes, `java`/`curl` simulados) e `docker compose config` válido, incluindo sobrescrita por variáveis. **Não executado:** `docker build`/`up` reais (sem daemon Docker no ambiente de desenvolvimento desta alteração).

### Implementado e comprovado
- Estrutura Docker do runtime (Dockerfile + entrypoint.sh).
- Configuração do Docker Compose com serviço `papermc`.
- Seleção da combinação compatível: Paper 26.3 (build 255), Java 25 (eclipse-temurin:25-jdk-alpine), GeyserMC latest, Floodgate latest.
- Correção dos volumes e mounts: bind mounts separados para `world`, `plugins`, `config`, `config/eula.txt`, `logs` — não ocultam `paper.jar` nem plugins da imagem.
- Remoção do atributo obsoleto `version: "3.8"` do docker-compose.yml.
- Portas vinculadas a loopback: `127.0.0.1:25565/tcp` (Java) e `127.0.0.1:19132/udp` (Bedrock).
- Documentação completa do runtime em `infrastructure/minecraft/README.md` e `infrastructure/docker/README.md`.
- Ajuste de `.gitignore` para ignorar somente `.claude/INSTRUCOES-ATUAIS.md`.
- Build da imagem Docker (`docker-papermc:latest`) — Paper 26.3 (~55 MB) baixado de `fill-data.papermc.io`.
- Validação de `docker compose config` — sintaxe válida, sem warnings.

### Ainda pendente
- Aceitação manual da EULA pelo usuário (arquivo `./data/eula.txt` fica em `eula=false` até a decisão do usuário).
- Inicialização real do servidor (container não inicia sem `eula=true`).
- Verificação dos arquivos gerados e persistência dos dados (world, plugins, logs, server.properties).
- Testes de conexão Java (TCP 25565) com cliente Minecraft Java Edition.
- Testes de conexão Bedrock (UDP 19132) com cliente Minecraft Bedrock.
- Validação de `server.properties` e geração de mundo.

---

*O histórico de versões antigas (0.0.1, 0.0.2 de 2023) pertence ao projeto Python legado e foi preservado na branch `main` como backup. Esta branch contém apenas o histórico da nova plataforma Minecraft Crossplay Server.*