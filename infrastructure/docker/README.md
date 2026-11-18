# Docker no Minecraft Crossplay Server

Este diretório contém os scripts e configurações Docker que constroem e operam o **runtime Minecraft Paper** e os plugins GeyserMC/Floodgate, suportando clientes Java e Bedrock.

## Visão geral

- **Estrutura:** `docker-compose.yml` + `minecraft/Dockerfile` + `minecraft/entrypoint.sh`.
- **Persistência:** volumes locais (`./data/...`) em contêineres -> mantêm mundo, plugins, configs e EULA entre reinicializações.
- **Conformidade:** Restrições de segurança — não expor Docker socket, console administrativo ou controle à internet.
- **Rede:** Rede Docker bridge privada (`minecraft_net`). Portas expostas apenas em `127.0.0.1`:
  - `25565/tcp` (Java Edition).
  - `19132/udp` (Bedrock Edition).

## Conteúdo

### `docker-compose.yml`

- Define a service **`papermc`** com:
  - Build a partir de `./minecraft/Dockerfile` (Paper 26.3, Java 25, plugins baixados em runtime).
  - Volumes para `world`, `plugins`, `config` (inclui `eula.txt`), `logs`.
  - Portas mapeadas apenas para loopback (`127.0.0.1`) — uso local.
  - Limite de memória: 2 GB.
  - Restart: `unless-stopped`.

### `minecraft/`

- **Dockerfile**: imagem base `eclipse-temurin:25-jdk-alpine`, baixa Paper 26.3 build 255 de `fill-data.papermc.io`, cria `/server/plugins` vazio, copia `entrypoint.sh`.
- **entrypoint.sh**: baixa Geyser/Floodgate (Spigot/Paper) apenas se não existirem no volume; valida `/server/eula.txt` (sai com código 1 se não for `eula=true`); inicia `java -Xmx2G -jar /server/paper.jar nogui`.
- **EULA:** NÃO é aceita automaticamente. O arquivo `./data/config/eula.txt` (montado em `/server/eula.txt`) inicia com `eula=false`. O usuário/controller deve alterar para `eula=true` após ler a EULA oficial.

## Como usar (fase 1)

No workspace do projeto:

```bash
# Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# Iniciar o runtime (após aceitar a EULA em data/config/eula.txt)
docker compose -f infrastructure/docker/docker-compose.yml up
```

**Importante:** O servidor não iniciará enquanto `eula.txt` não tiver `eula=true`. Para aceitar:

```bash
echo 'eula=true' > infrastructure/docker/data/config/eula.txt
# (Leia a EULA antes: https://www.microsoft.com/en-us/licensing/faq/minecraft)
```

## Notas sobre a configuração

- Volumes redesenhados para **não ocultar** arquivos da imagem: `/server/paper.jar` e `/server/plugins` (vazio na imagem) nunca são cobertos.
- `./data/config/eula.txt:/server/eula.txt` — bind mount dedicado para a EULA.
- Não há Redis, Kubernetes, proxy externo (ex: Nginx) — everything stays minimal e local-first.

## Acesso ao container para manutenção

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec papermc sh
```

## Espaço de trabalho seguro

- Não commitar tokens, senhas, chaves privadas ou arquivos `.env` reais — variáveis de ambiente no host (ex: `.env.local` no Docker Desktop).
- EULA **não** aceita automaticamente. Usuário/controller deve concordar explicitamente após ler a EULA oficial.
- Repositórios de plugins (GeyserMC, Floodgate) são públicos e verificados; sem secrets.

## Documentação relacionada

- `docs/ARCHITECTURE.md` – diagramas de componente.
- `docs/DEVELOPMENT_SETUP.md` – passos validados localmente.
- `infrastructure/minecraft/README.md` – documentação detalhada do runtime.
- `docs/ROADMAP.md` – status da fase 1.

Leia sempre AGENTS.md antes de modificar qualquer arquivo Dockerfile ou docker-compose.yml.
