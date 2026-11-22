# Ambiente de desenvolvimento

O projeto é desenvolvido e testado em três ambientes. Todo script e teste do repositório precisa funcionar nos três.

| Ambiente                                             | Docker                            | Node / testes       | Rodar o servidor real (Paper) |
| ---------------------------------------------------- | --------------------------------- | ------------------- | ----------------------------- |
| **Linux nativo** (Pop!_OS 24.04 COSMIC, base Ubuntu) | Docker Engine nativo              | sim                 | `run-local.sh` ou Docker      |
| **Windows 11 + WSL2** (Ubuntu)                       | Docker Desktop com integração WSL | sim                 | `run-local.sh` ou Docker      |
| **Celular (Termux, Android aarch64)**                | **não** (sem root)                | sim (`node --test`) | `run-local.sh`                |

## Diagnóstico rápido (qualquer ambiente)

```bash
sh scripts/dev/doctor.sh
```

Detecta a plataforma (Linux, WSL ou Termux), confere Java 25+, curl, Node e Docker, avisa se o repositório está em `/mnt/c` no WSL e sugere um `MC_JAVA_HEAP` conforme a memória disponível. Sai com código 1 apenas se algo impede rodar o servidor localmente.

## Testes automatizados (qualquer ambiente)

```bash
node --test tests/entrypoint.test.mjs tests/dev-scripts.test.mjs
```

Esses testes só precisam de Node e `sh` (usam `java` e `curl` simulados), então rodam também no Termux. O comando `pnpm test` completo exige o Node fixado em `.nvmrc` e `pnpm install`; no Termux, use o comando acima.

## Rodar o servidor real sem Docker

```bash
sh scripts/dev/run-local.sh
```

Baixa o Paper (a URL vem do próprio Dockerfile, fonte única) e executa o **mesmo `entrypoint.sh` da imagem Docker**, com os dados em `~/.mc-crossplay/local` (`MC_LOCAL_DIR` para mudar). Na primeira execução baixa Geyser e Floodgate, cria `data/eula.txt` com `eula=false` e para: leia a EULA em https://www.minecraft.net/eula e, se concordar, defina `eula=true` nesse arquivo e execute de novo. A EULA nunca é aceita automaticamente. Digite `stop` no console para encerrar.

Isso valida Paper + Geyser + Floodgate e as conexões Java (TCP 25565) e Bedrock (UDP 19132). **Não** valida o `docker build` nem o compose; para isso use Linux ou WSL com Docker.

## Linux nativo (Pop!_OS 24.04)

- **Docker Engine:** instale pelo repositório oficial da Docker para Ubuntu (https://docs.docker.com/engine/install/ubuntu/) e adicione seu usuário ao grupo `docker`. Não instale Docker Desktop e Engine ao mesmo tempo.
- **Java 25:** `sudo apt install openjdk-25-jre-headless` (disponível no Ubuntu 24.04 noble-updates; confirme com `apt-cache policy openjdk-25-jre-headless`).
- **Node:** via `nvm install` (usa `.nvmrc`), depois `pnpm install`.
- **Firewall:** se o `ufw` estiver ativo, a liberação das portas TCP 25565 e UDP 19132 para a LAN será documentada na issue de acesso em rede local.
- A GPU NVIDIA não influencia o servidor Minecraft.

## Windows + WSL2

- Instale a distribuição Ubuntu no WSL2, habilite o systemd e **clone o repositório no filesystem Linux** (ex.: `~/projects`), nunca em `/mnt/c`: o I/O é lento e não há permissões Linux. O `doctor.sh` avisa se estiver em `/mnt/c`.
- Use o Docker Desktop como único engine, com integração WSL habilitada (Settings → Resources → WSL Integration). Não instale `docker.io` nem `docker-ce` dentro do Ubuntu enquanto a integração estiver em uso.
- **Final de linha:** o `.gitattributes` força LF em `*.sh`, `Dockerfile`, YAML, JSON e fontes. Se algum `.sh` já tiver sido clonado com CRLF no Windows, rode `git add --renormalize .` e refaça o checkout.
- Valide com:

```bash
docker version
docker compose version
docker run --rm hello-world
```

## Celular (Termux)

Instale o Termux pelo F-Droid ou GitHub (não pela Play Store) e execute:

```bash
pkg update && pkg install -y git nodejs curl
pkg search openjdk          # o Paper 26.1+ exige Java 25
```

Se existir `openjdk-25`, instale com `pkg install openjdk-25`. Sem ele, use um Ubuntu via `proot-distro`.

Depois, `git clone` do repositório, `sh scripts/dev/doctor.sh`, `node --test tests/entrypoint.test.mjs tests/dev-scripts.test.mjs` e `sh scripts/dev/run-local.sh`. Dicas:

- Com pouca RAM livre, use `MC_JAVA_HEAP=1G` (o `doctor.sh` sugere um valor).
- O `run-local.sh` chama `termux-wake-lock`; mantenha o app aberto e o celular carregando, porque o Android pode encerrar processos em segundo plano.
- Docker não é suportado no Termux; o runtime containerizado deve ser validado no Linux ou no WSL.

## Versões usadas pelo mantenedor

- Node.js 26.13.1 LTS (`.nvmrc`), pnpm 12.21.0 (campo `packageManager`), TypeScript 7.0.2.
- Java 25 (OpenJDK/Temurin) para o Paper 26.x.
- Docker Engine 29.x e Compose 5.x.

A matriz oficial de versões do runtime (Paper, Geyser, Floodgate) está em `infrastructure/minecraft/README.md`.

## Workspace

Comandos na raiz do repositório (Linux e WSL, com Node fixado e `pnpm install` feito):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

O lockfile `pnpm-lock.yaml` é versionado para reproduzir as instalações em outras máquinas e no CI.
