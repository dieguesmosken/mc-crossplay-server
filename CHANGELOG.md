# Changelog

## Unreleased

### Adicionado (issue #25 etapa 5) — API da fila no Docker
- `infrastructure/docker/api/Dockerfile` (Node 26.13.1 Alpine, pnpm 12.21.0, `--frozen-lockfile`, usuário `node`) e `.dockerignore` na raiz.
- `docker-compose.yml`: serviço `api` no perfil `api` (`docker compose --profile api up -d`), **sem porta publicada no host**, com volume nomeado `api_data` e healthcheck em `/health`. `MC_API_SECRET` chega à API e ao `papermc` pelo `.env`; o `.env.example` mantém a variável vazia.
- README do Docker: seção "API da fila no Docker" (segredo, rede, dados, instalação do plugin do PR #30).
- Testes: 2 novos em `tests/entrypoint.test.mjs` (perfil e ausência de `ports`/segredo no compose; Dockerfile com lockfile, usuário não root e sem segredo). Total 55/55, com verificação por mutação.
- **Não executado:** `docker build`, `docker compose up --profile api`, plugin num Paper real.

### Documentado (issues #12 e #23) — achados do teste do Bedrock na LAN
- Teste real em 2026-11-22: Linux (Pop!_OS 24.04), Paper 26.3 build 255, Geyser `2.12.1-b1306`, Floodgate `2.2.5`, celular Galaxy A17 (Bedrock release 26.60) na mesma rede. O celular entrou no mundo como `.TeuzinYTBR` por `IP-da-LAN:19132` (NetherNet), com `MC_BIND_ADDRESS=0.0.0.0`.
- `infrastructure/docker/README.md`: matriz da #12 atualizada (só a linha "Bedrock na LAN (NetherNet)" foi validada) e nova seção de solução de problemas: versão Bedrock fora da lista do Geyser (`Outdated Geyser proxy!`, o beta 26.70 foi recusado), Geyser que não se atualiza sozinho (`data/plugins/geyser.jar`), whitelist, console do servidor, permissão no socket do Docker, `advertise-addresses` (hipótese, não confirmada) e avisos inofensivos do log.
- `docker-compose.yml`: `stdin_open: true` e `tty: true` para permitir `docker attach minecraft-paper` (sair com Ctrl+P e Ctrl+Q). Teste novo em `tests/entrypoint.test.mjs`.
- **Não validado:** Java local e na LAN, Bedrock local, `fwhitelist add` no console, `docker attach` num container real, qualquer versão do Bedrock fora da 26.60.

### Adicionado (issues #12 e #23) — porta configurável para testar o Bedrock na LAN
- `docker-compose.yml`: as portas passam a ser publicadas em `${MC_BIND_ADDRESS:-127.0.0.1}`. O padrão continua sendo loopback (só o próprio computador). Também publica `19132/tcp`, usada na sinalização do NetherNet (Bedrock 26.60+), além de `25565/tcp` e `19132/udp`.
- `.env.example`, `infrastructure/docker/README.md` e `docs/DEVELOPMENT_SETUP.md`: variável documentada, com o passo a passo para o celular, o aviso de que **o Docker ignora o `ufw`** (qualquer valor diferente de `127.0.0.1` abre as portas para toda a LAN, com a whitelist do Paper desligada), a recomendação de usar o IP da LAN em vez de `0.0.0.0` e a matriz de testes da #12 (todas as linhas ainda "não validado").
- Testes: `tests/entrypoint.test.mjs` ganhou 2 testes (portas via `MC_BIND_ADDRESS` com padrão loopback e `19132/tcp` presente; `.env.example` mantém `127.0.0.1` e o aviso). Total com `node --test`: 52/52 (Node 22). Verificado por mutação: reintroduzir a porta fixa, remover `19132/tcp` ou trocar o padrão do `.env.example` para `0.0.0.0` faz os testes reprovarem.
- `docker compose config` conferido em 4 cenários (padrão, `MC_BIND_ADDRESS=0.0.0.0`, `.env.example` copiado e um IP de LAN): as 3 portas saem com o `host_ip` esperado.
- **Não executado:** `docker compose up` com a variável, conexão real do celular (Java ou Bedrock), o NetherNet (publicar `19132/tcp` não o liga; a propriedade `-DgeyserTransport=nethernet` vem da documentação do Geyser e não foi testada aqui) e o `auth-type: floodgate` do Geyser.
- Não incluído (também listado na #12): `MC_JAVA_PORT` e `MC_BEDROCK_PORT`.

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