# Changelog

## Unreleased

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
- Aceitação manual da EULA pelo usuário (arquivo `./data/config/eula.txt` está em `eula=false`).
- Inicialização real do servidor (container não inicia sem `eula=true`).
- Verificação dos arquivos gerados e persistência dos dados (world, plugins, logs, server.properties).
- Testes de conexão Java (TCP 25565) com cliente Minecraft Java Edition.
- Testes de conexão Bedrock (UDP 19132) com cliente Minecraft Bedrock.
- Validação de `server.properties` e geração de mundo.

---

*O histórico de versões antigas (0.0.1, 0.0.2 de 2023) pertence ao projeto Python legado e foi preservado na branch `main` como backup. Esta branch contém apenas o histórico da nova plataforma Minecraft Crossplay Server.*