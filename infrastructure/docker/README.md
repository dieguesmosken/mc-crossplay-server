# Docker no Minecraft Crossplay Server

Este diretório contém os scripts e configurações Docker que constroem e operam o **runtime Minecraft Paper** e os plugins GeyserMC/Floodgate, suportando clientes Java e Bedrock.

## Visão geral

- **Estrutura:** `docker-compose.yml` + `minecraft/Dockerfile` + `minecraft/entrypoint.sh` + `scripts/init-data.sh` + `.env.example`.
- **Persistência:** um único volume, `./data` (host) → `/server/data` (container), que é o diretório de trabalho do Paper. Mantém mundo (todas as dimensões), plugins, configs, logs, `server.properties`, whitelist, ops e `eula.txt` entre reinicializações.
- **Conformidade:** Restrições de segurança — não expor Docker socket, console administrativo ou controle à internet.
- **Rede:** Rede Docker bridge privada (`minecraft_net`). Portas expostas apenas em `127.0.0.1`:
  - `25565/tcp` (Java Edition).
  - `19132/udp` (Bedrock Edition).

## Conteúdo

### `docker-compose.yml`

- Define a service **`papermc`** com:
  - Build a partir de `./minecraft/Dockerfile` (Paper 26.3, Java 25, plugins baixados em runtime).
  - Volume único `./data:/server/data` (mundo, plugins, configs, logs e `eula.txt`).
  - Portas mapeadas apenas para loopback (`127.0.0.1`) — uso local.
  - Limite de memória do container: `MC_MEMORY_LIMIT` (padrão `3g`) e heap da JVM: `MC_JAVA_HEAP` (padrão `2G`), sempre com heap abaixo do limite.
  - Restart: `"no"` — quem inicia/para o servidor é o usuário/Controller; com restart automático, a saída por EULA não aceita viraria loop infinito.

### `minecraft/`

- **Dockerfile**: imagem base `eclipse-temurin:25-jdk-alpine`, baixa Paper 26.3 build 255 de `fill-data.papermc.io`, cria `/server/data` (ponto de montagem), copia `entrypoint.sh`.
- **entrypoint.sh**: entra em `/server/data`; baixa Geyser/Floodgate (Spigot/Paper) apenas se não existirem em `plugins/`; cria `eula.txt` com `eula=false` se ausente; valida a EULA (aceita final de linha CRLF; sai com código 1 se não for `eula=true`); inicia `java -Xms$MC_JAVA_HEAP -Xmx$MC_JAVA_HEAP $MC_JAVA_OPTS -jar /server/paper.jar nogui`.
- **scripts/init-data.sh**: cria `./data` com o seu usuário e `data/eula.txt` com `eula=false` somente se ausente. Idempotente; nunca sobrescreve nada.
- **EULA:** NÃO é aceita automaticamente. `./data/eula.txt` inicia com `eula=false`. O usuário/controller deve alterar para `eula=true` após ler a EULA oficial (https://www.minecraft.net/eula).

## Como usar (fase 1)

No workspace do projeto (Linux com Docker Engine e Docker Compose):

```bash
# 1. Preparar ./data (cria data/eula.txt com eula=false; não sobrescreve nada)
sh infrastructure/docker/scripts/init-data.sh

# 2. (Opcional) ajustar memória: cp infrastructure/docker/.env.example infrastructure/docker/.env

# 3. Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# 4. Iniciar o runtime (após aceitar a EULA, abaixo)
docker compose -f infrastructure/docker/docker-compose.yml up
```

**Importante:** O servidor não iniciará enquanto `data/eula.txt` não tiver `eula=true`. O container encerra uma única vez com a mensagem de orientação (não há reinício automático). Para aceitar, depois de ler a EULA em https://www.minecraft.net/eula:

```bash
echo 'eula=true' > infrastructure/docker/data/eula.txt
```

### Migrando do layout antigo

Se você já tinha `data/world`, `data/plugins`, `data/config` e `data/logs` (volumes separados), o servidor agora usa tudo direto em `data/`. Nenhum arquivo é movido automaticamente. Mova manualmente o conteúdo de `data/config/` para `data/` (inclusive `server.properties`) e revise o `eula.txt`.

## Notas sobre a configuração

- Somente `/server/paper.jar` fica na imagem e nunca é coberto por volume; todo o resto vive em `/server/data`.
- `eula.txt` fica dentro do volume (arquivo comum), sem bind mount de arquivo único — o que evitava o Docker criar um diretório no lugar dele.
- Memória: o heap (`MC_JAVA_HEAP`) deve ficar abaixo do limite do container (`MC_MEMORY_LIMIT`); metaspace, threads e memória off-heap ficam fora do heap, e heap igual ao limite causa OOM kill.
- Não há Redis, Kubernetes, proxy externo (ex: Nginx) — tudo permanece mínimo e local-first.

## Acesso ao container para manutenção

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec papermc sh
```

## Espaço de trabalho seguro

- Não commitar tokens, senhas, chaves privadas ou arquivos `.env` reais — variáveis de ambiente no host (arquivo `.env` local, ignorado pelo Git; use `.env.example` como modelo).
- EULA **não** aceita automaticamente. Usuário/controller deve concordar explicitamente após ler a EULA oficial.
- Repositórios de plugins (GeyserMC, Floodgate) são públicos e verificados; sem secrets.

## Documentação relacionada

- `docs/ARCHITECTURE.md` – diagramas de componente.
- `docs/DEVELOPMENT_SETUP.md` – passos validados localmente.
- `infrastructure/minecraft/README.md` – documentação detalhada do runtime.
- `docs/ROADMAP.md` – status da fase 1.

Leia sempre AGENTS.md antes de modificar qualquer arquivo Dockerfile ou docker-compose.yml.
