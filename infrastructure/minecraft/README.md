# Runtime Minecraft (Paper + GeyserMC + Floodgate) — Fase 1

Este diretório contém a documentação do runtime Minecraft implementado em `infrastructure/docker/minecraft/`.

## Estrutura dos arquivos de implementação

```
infrastructure/docker/minecraft/
├── Dockerfile          # Build da imagem (Paper 26.3 + Java 25)
├── entrypoint.sh       # Inicialização do container (plugins + EULA + Paper)
└── .gitkeep            # (placeholder)
```

O `docker-compose.yml`, o `.env.example` e `scripts/init-data.sh` ficam em `infrastructure/docker/`.

## Componentes

### Dockerfile

- **Base:** `eclipse-temurin:25-jdk-alpine` (Java 25, Alpine Linux).
- **Dependências instaladas:** `curl`, `wget`, `bash` (via `apk add --no-cache`).
- **Paper 26.3 (build 255):** baixado do repositório oficial `fill-data.papermc.io` com URL fixa e reproduzível:
  `https://fill-data.papermc.io/v1/objects/a7116085a8ba88cf00771d5e61a2925007942092650811da7327dc23243f0cec/paper-26.3-255.jar`
  - Validado: HTTP 200, ~55 MB.
- **Diretório de dados:** `/server/data` criado vazio na imagem (ponto de montagem); preenchido em runtime pelo Paper e pelo `entrypoint.sh`.
- **Entrypoint:** copia `entrypoint.sh` para `/server/entrypoint.sh`, dá permissão de execução e define como `ENTRYPOINT`.
- **Portas expostas (documentação):** `25565/tcp` (Java) e `19132/udp` (Bedrock).
- **EULA:** NÃO é aceita automaticamente na imagem. O arquivo `eula.txt` não é criado no build; a aceitação é feita pelo usuário/controller antes do startup.

### entrypoint.sh

Responsabilidades em ordem (diretório de trabalho: `/server/data`):

1. **Garantir plugins Geyser/Floodgate em `plugins/`:**
   - Baixa `geyser.jar` (Spigot/Paper) de `https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot` apenas se o arquivo não existir no volume persistente.
   - Baixa `floodgate.jar` (Spigot/Paper) de `https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot` apenas se o arquivo não existir.
   - Os JARs persistem no volume `./data/plugins` entre reinicializações.

2. **Validar EULA:**
   - Cria `eula.txt` com `eula=false` se não existir; nunca sobrescreve um arquivo existente.
   - Exige `eula=true` (tolera final de linha CRLF). Caso contrário, exibe orientação (EULA oficial: https://www.minecraft.net/eula) e **sai com código 1**.
   - Aceitação automática desativada por conformidade com a Minecraft EULA.

3. **Iniciar Paper:**
   - Comando: `java -Xms$MC_JAVA_HEAP -Xmx$MC_JAVA_HEAP $MC_JAVA_OPTS -jar /server/paper.jar nogui` (heap padrão `2G`).

### docker-compose.yml (em `infrastructure/docker/`)

Serviço `papermc`:
- **Build:** context `./minecraft`, dockerfile `Dockerfile`.
- **Container name:** `minecraft-paper`.
- **Working dir:** `/server`.
- **Restart:** `"no"` (início/parada decididos pelo usuário/Controller; evita loop quando a EULA não foi aceita).
- **Memory limit:** `MC_MEMORY_LIMIT` (padrão `3g`); **heap da JVM:** `MC_JAVA_HEAP` (padrão `2G`) — o heap deve ficar abaixo do limite.
- **Portas (loopback only):**
  - `127.0.0.1:25565:25565/tcp` (Java Edition).
  - `127.0.0.1:19132:19132/udp` (Bedrock Edition).
- **Volume único:** `./data:/server/data` — mundo (todas as dimensões), plugins, `config/` do Paper, logs, `server.properties`, `whitelist.json`, `ops.json`, `bukkit.yml`, `spigot.yml` e `eula.txt`. O `paper.jar` fica na imagem e nunca é coberto.
- **Rede:** bridge `minecraft_net`.

## Como usar (Fase 1)

No workspace do projeto:

```bash
# Preparar ./data (cria data/eula.txt com eula=false; idempotente)
sh infrastructure/docker/scripts/init-data.sh

# Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# Iniciar o runtime
docker compose -f infrastructure/docker/docker-compose.yml up
```

**Importante:** Na primeira execução, o `entrypoint.sh` baixará Geyser e Floodgate. O servidor **não iniciará** até que a EULA seja aceita em `infrastructure/docker/data/eula.txt`:

```bash
# Depois de ler https://www.minecraft.net/eula e concordar:
echo 'eula=true' > infrastructure/docker/data/eula.txt
# Depois: docker compose up
```

> **Não** aceite a EULA automaticamente. Leia primeiro em https://www.minecraft.net/eula.

## Persistência

Tudo fica em `infrastructure/docker/data/` (host), montado em `/server/data`:

- `world*/` — arquivos do mundo e das demais dimensões, conforme a versão do Paper (confirmar após o primeiro startup real).
- `plugins/` — `geyser.jar`, `floodgate.jar` e plugins adicionados pelo usuário.
- `config/` — configurações do Paper (`paper-global.yml` etc.).
- `server.properties`, `whitelist.json`, `ops.json`, `bukkit.yml`, `spigot.yml` — gerados pelo servidor na raiz de `data/`.
- `logs/` — saída do servidor (`latest.log`, etc.).
- **`eula.txt`** — criado com `eula=false`; o usuário/controller altera para `eula=true` após ler a EULA oficial.

> A lista acima descreve o comportamento esperado do Paper; os arquivos exatos gerados pela versão 26.3 ainda precisam ser verificados no primeiro startup real (item pendente da Fase 1).

## Segurança e Conformidade

- Portas expostas apenas em `127.0.0.1` (loopback) — uso local.
- Não expor Docker socket, console administrativo ou API de controle à internet.
- EULA **não** aceita automaticamente. O usuário/controller deve concordar explicitamente após ler a EULA oficial.
- Repositórios de plugins (GeyserMC, Floodgate) são públicos e verificados; sem secrets.
- Credenciais via variáveis de ambiente no host (`.env` local, ignorado pelo Git), nunca no Git.

## Teste de startup (após EULA aceita)

```bash
# Subir o container
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Ver logs
docker compose -f infrastructure/docker/docker-compose.yml logs -f papermc

# Testar porta TCP (Java) — não é HTTP
# Use: nc -zv 127.0.0.1 25565  ou telnet 127.0.0.1 25565

# Testar porta UDP (Bedrock) — requer cliente Bedrock ou ferramenta UDP
# Exemplo básico: nc -zuv 127.0.0.1 19132  (apenas testa se a porta está aberta)

# Acesso ao shell do container
docker compose -f infrastructure/docker/docker-compose.yml exec papermc sh
```

**Não use `curl http://localhost:25565`** — a porta Java do Minecraft fala protocolo TCP próprio, não HTTP.

Validação real de conexão Bedrock exige cliente Minecraft Bedrock (Windows 10/11, Android, iOS, Xbox, etc.) conectando em `127.0.0.1:19132`.

## Combinação de versões validada (2026-11-18)

| Componente | Versão | Fonte |
|------------|--------|-------|
| Java       | 25 (Temurin) | `eclipse-temurin:25-jdk-alpine` |
| Paper      | 26.3 (build 255) | `fill-data.papermc.io` |
| GeyserMC   | latest (Spigot/Paper) | `download.geysermc.org` |
| Floodgate  | latest (Spigot/Paper) | `download.geysermc.org` |

Validação contra:
- https://docs.papermc.io/paper/getting-started/ → Paper 26.1+ requer Java 25.
- https://geysermc.org/wiki/geyser/supported-versions/ → Geyser-Spigot requer Paper 1.20.5+ (Paper 26.3 = Minecraft 1.21.4, compatível).
- https://papermc.io/downloads/paper → URLs em `fill-data.papermc.io`.

## Documentação relacionada

- `infrastructure/docker/README.md` — visão geral do Docker no projeto.
- `docs/ARCHITECTURE.md` — diagramas de componente.
- `docs/DEVELOPMENT_SETUP.md` — ambiente local validado.
- `docs/ROADMAP.md` — status da Fase 1.
- `AGENTS.md` — regras para agentes de desenvolvimento.

## Lista de Tarefas (Fase 1)

- [x] Dockerfile com Paper 26.3 + Java 25.
- [x] entrypoint.sh com download condicional de Geyser/Floodgate e validação de EULA.
- [x] docker-compose.yml com volume único `./data:/server/data` (não oculta `paper.jar`), portas em loopback, sem restart automático e memória configurável.
- [x] Documentar portas TCP (Java) e UDP (Bedrock) separadamente.
- [x] Persistir `eula.txt` dentro do volume (`data/eula.txt`, inicial `eula=false`, criado pelo entrypoint/`init-data.sh`).
- [ ] Validar startup real com EULA aceita.
- [ ] Testar conexão Java (TCP) com cliente Minecraft Java Edition.
- [ ] Testar conexão Bedrock (UDP) com cliente Minecraft Bedrock.

---

*Este README reflete a implementação existente em `infrastructure/docker/minecraft/` na data de 2026-11-18.*