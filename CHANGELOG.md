# Changelog

## Unreleased

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