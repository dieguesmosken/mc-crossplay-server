# Runtime Minecraft (Paper + GeyserMC + Floodgate) — Fase 1

Este diretório contém a documentação do runtime Minecraft implementado em `infrastructure/docker/minecraft/`.

## Estrutura dos arquivos de implementação

```
infrastructure/docker/minecraft/
├── Dockerfile          # Build da imagem (Paper 26.3 + Java 25)
├── entrypoint.sh       # Inicialização do container (plugins + EULA + Paper)
└── .gitkeep            # (placeholder)
```

O `docker-compose.yml` fica em `infrastructure/docker/docker-compose.yml`.

## Componentes

### Dockerfile

- **Base:** `eclipse-temurin:25-jdk-alpine` (Java 25, Alpine Linux).
- **Dependências instaladas:** `curl`, `wget`, `bash` (via `apk add --no-cache`).
- **Paper 26.3 (build 255):** baixado do repositório oficial `fill-data.papermc.io` com URL fixa e reproduzível:
  `https://fill-data.papermc.io/v1/objects/a7116085a8ba88cf00771d5e61a2925007942092650811da7327dc23243f0cec/paper-26.3-255.jar`
  - Validado: HTTP 200, ~55 MB.
- **Diretório de plugins:** `/server/plugins` criado vazio na imagem; preenchido em runtime pelo `entrypoint.sh`.
- **Entrypoint:** copia `entrypoint.sh` para `/server/entrypoint.sh`, dá permissão de execução e define como `ENTRYPOINT`.
- **Portas expostas (documentação):** `25565/tcp` (Java) e `19132/udp` (Bedrock).
- **EULA:** NÃO é aceita automaticamente na imagem. O arquivo `eula.txt` não é criado no build; a aceitação é feita pelo usuário/controller antes do startup.

### entrypoint.sh

Responsabilidades em ordem:

1. **Garantir plugins Geyser/Floodgate em `/server/plugins`:**
   - Baixa `geyser.jar` (Spigot/Paper) de `https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot` apenas se o arquivo não existir no volume persistente.
   - Baixa `floodgate.jar` (Spigot/Paper) de `https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot` apenas se o arquivo não existir.
   - Os JARs persistem no volume `./data/plugins` entre reinicializações.

2. **Validar EULA:**
   - Verifica existência de `/server/eula.txt` com conteúdo `eula=true`.
   - Se não existir ou estiver `eula=false`, exibe mensagem orientando o usuário a aceitar a EULA (após ler em https://www.microsoft.com/en-us/licensing/faq/minecraft) e **sai com código 1**.
   - Aceitação automática desativada por conformidade com a Minecraft EULA.

3. **Iniciar Paper:**
   - Comando: `java -Xmx2G -jar /server/paper.jar nogui`.

### docker-compose.yml (em `infrastructure/docker/`)

Serviço `papermc`:
- **Build:** context `./minecraft`, dockerfile `Dockerfile`.
- **Container name:** `minecraft-paper`.
- **Working dir:** `/server`.
- **Restart:** `unless-stopped`.
- **Memory limit:** `2g`.
- **Portas (loopback only):**
  - `127.0.0.1:25565:25565/tcp` (Java Edition).
  - `127.0.0.1:19132:19132/udp` (Bedrock Edition).
- **Volumes (bind mounts para persistência, sem ocultar arquivos da imagem):**
  - `./data/world:/server/world` — mundo do Minecraft.
  - `./data/plugins:/server/plugins` — Geyser/Floodgate + plugins do usuário. Pasta vazia preserva JARs da imagem.
  - `./data/config:/server/config` — `server.properties`, `whitelist.json`, etc. Separado para não cobrir `paper.jar` nem plugins da imagem.
  - `./data/config/eula.txt:/server/eula.txt` — EULA gerenciada pelo usuário/controller. Inicial com `eula=false`. O entrypoint valida e sai se não for `eula=true`.
  - `./data/logs:/server/logs` — logs do servidor.
- **Rede:** bridge `minecraft_net`.

## Como usar (Fase 1)

No workspace do projeto:

```bash
# Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# Iniciar o runtime
docker compose -f infrastructure/docker/docker-compose.yml up
```

**Importante:** Na primeira execução, o `entrypoint.sh` baixará Geyser e Floodgate. O servidor **não iniciará** até que a EULA seja aceita. O arquivo `infrastructure/docker/data/config/eula.txt` é montado em `/server/eula.txt`. Para aceitar:

```bash
# Editar o arquivo no host (já montado no container):
echo 'eula=true' > infrastructure/docker/data/config/eula.txt
# Depois: docker compose up
```

> **Não** aceite a EULA automaticamente. Leia primeiro em https://www.microsoft.com/en-us/licensing/faq/minecraft.

## Persistência

Dados mantidos em `infrastructure/docker/data/` (host):

- `data/world/` — arquivos do mundo (Java + gerado pelo Geyser).
- `data/plugins/` — `geyser.jar`, `floodgate.jar` e plugins adicionados pelo usuário.
- `data/config/` — `server.properties`, `whitelist.json`, `bukkit.yml`, `spigot.yml`, `paper.yml`, **`eula.txt`**.
- `data/logs/` — saída do servidor (`latest.log`, etc.).

O `eula.txt` é montado em `/server/eula.txt` via `./data/config/eula.txt:/server/eula.txt`. Inicial com `eula=false`. O usuário/controller deve alterar para `eula=true` após ler a EULA oficial.

## Segurança e Conformidade

- Portas expostas apenas em `127.0.0.1` (loopback) — uso local.
- Não expor Docker socket, console administrativo ou API de controle à internet.
- EULA **não** aceita automaticamente. O usuário/controller deve concordar explicitamente após ler a EULA oficial.
- Repositórios de plugins (GeyserMC, Floodgate) são públicos e verificados; sem secrets.
- Credenciais via variáveis de ambiente no host (ex: `.env.local` no Docker Desktop), nunca no Git.

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
- [x] docker-compose.yml com volumes redesenhados (não ocultam paper.jar nem plugins da imagem) e portas em loopback.
- [x] Documentar portas TCP (Java) e UDP (Bedrock) separadamente.
- [x] Persistir `eula.txt` via bind mount `./data/config/eula.txt:/server/eula.txt` (inicial `eula=false`).
- [ ] Validar startup real com EULA aceita.
- [ ] Testar conexão Java (TCP) com cliente Minecraft Java Edition.
- [ ] Testar conexão Bedrock (UDP) com cliente Minecraft Bedrock.

---

*Este README reflete a implementação existente em `infrastructure/docker/minecraft/` na data de 2026-11-18.*