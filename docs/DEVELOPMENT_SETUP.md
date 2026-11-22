# Ambiente de desenvolvimento

O projeto é desenvolvido e testado em três ambientes. O suporte é **adaptado a cada ambiente**, respeitando as limitações de cada um: os ambientes não se comportam de forma idêntica, e este documento diz o que muda e o que não é possível em cada um. Os scripts e testes do repositório rodam nos três, e o `doctor.sh` ajusta diagnóstico e dicas conforme a plataforma detectada.

| Ambiente                                             | Docker                            | Node / testes       | Rodar o servidor real (Paper) | Principais limitações                                                          |
| ---------------------------------------------------- | --------------------------------- | ------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| **Linux nativo** (Pop!_OS 24.04 COSMIC, base Ubuntu) | Docker Engine nativo              | sim                 | `run-local.sh` ou Docker      | Portas publicadas pelo Docker ignoram o `ufw`                                  |
| **Windows 11 + WSL2** (Ubuntu)                       | Docker Desktop com integração WSL | sim                 | `run-local.sh` ou Docker      | Modo NAT padrão: a LAN não alcança o servidor; repositório fora de `/mnt/c`    |
| **Celular (Termux, Android aarch64)**                | **não** (sem root)                | sim (`node --test`) | `run-local.sh`                | Pouca RAM, Android encerra processos, Java 25 e Node podem não estar no pacote |

## Diagnóstico rápido (qualquer ambiente)

```bash
sh scripts/dev/doctor.sh
```

Detecta a plataforma (Linux, WSL ou Termux), confere Java 25+, curl (inclusive se ele executa), Node e Docker e sugere um `MC_JAVA_HEAP` conforme a memória disponível, com **teto de 2048M no Linux/WSL e de 1024M no Termux**. As dicas mudam por plataforma: instalação do Java, correção de pacotes no Termux, aviso de `ufw` com Docker no Linux, aviso de rede NAT e de `/mnt/c` no WSL. Sai com código 1 apenas se algo impede rodar o servidor localmente.

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

Isso valida Paper + Geyser + Floodgate e as conexões Java (TCP 25565) e Bedrock (UDP 19132) no ambiente em que roda. **Não** valida o `docker build` nem o compose; para isso use Linux ou WSL com Docker. O alcance pela rede varia por ambiente (veja as limitações abaixo).

## Linux nativo (Pop!_OS 24.04)

- **Docker Engine:** instale pelo repositório oficial da Docker para Ubuntu (https://docs.docker.com/engine/install/ubuntu/) e adicione seu usuário ao grupo `docker`. Não instale Docker Desktop e Engine ao mesmo tempo.
- **Java 25:** `sudo apt install openjdk-25-jre-headless` (disponível no Ubuntu 24.04 noble-updates; confirme com `apt-cache policy openjdk-25-jre-headless`).
- **Node:** via `nvm install` (usa `.nvmrc`), depois `pnpm install`.
- **Limitação: Docker e `ufw`.** Portas publicadas pelo Docker não passam pelas regras do `ufw` (o tráfego é desviado antes), então `ufw deny` não bloqueia e `ufw allow` não é o que libera. Por isso o `docker-compose.yml` publica as portas só em `127.0.0.1`. Para expor na LAN, filtre pela cadeia `DOCKER-USER` (por exemplo com a ferramenta `ufw-docker`). Não desative o `iptables` do Docker como atalho. O desenho completo fica na issue de acesso em rede local (#12).
- **Rodando sem Docker (`run-local.sh`):** aí o `ufw` volta a valer; libere TCP 25565 e UDP 19132 normalmente se quiser acesso pela LAN.
- A GPU NVIDIA não influencia o servidor Minecraft.

## Windows + WSL2

- Instale a distribuição Ubuntu no WSL2, habilite o systemd e **clone o repositório no filesystem Linux** (ex.: `~/projects`), nunca em `/mnt/c`: o I/O é lento e não há permissões Linux. O `doctor.sh` avisa se estiver em `/mnt/c`.
- Use o Docker Desktop como único engine, com integração WSL habilitada (Settings → Resources → WSL Integration). Não instale `docker.io` nem `docker-ce` dentro do Ubuntu enquanto a integração estiver em uso.
- **Final de linha:** o `.gitattributes` força LF em `*.sh`, `Dockerfile`, YAML, JSON e fontes. Se algum `.sh` já tiver sido clonado com CRLF no Windows, rode `git add --renormalize .` e refaça o checkout.
- **Limitação: rede.** Por padrão o WSL2 usa NAT, então outros aparelhos da LAN (como um celular com Bedrock) não alcançam o servidor. Para isso, no Windows 11 22H2 ou superior, coloque `networkingMode=mirrored` em `[wsl2]` no `%USERPROFILE%\.wslconfig`, rode `wsl --shutdown` e libere a entrada no firewall do Hyper-V (PowerShell como administrador). A regra mais ampla é `Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow`; prefira uma regra só para as portas 25565 (TCP) e 19132 (UDP) com `New-NetFirewallHyperVRule`. Isso permite conexões da sua LAN, então use apenas em rede de confiança. Há relatos de pacotes UDP da LAN não chegando em alguns casos mesmo com o modo espelhado; **não validado neste projeto**, teste o Bedrock pela LAN antes de contar com ele.
- Acessando só do próprio Windows (`localhost`), nada disso é necessário.
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

Se existir `openjdk-25`, instale com `pkg install openjdk-25`. Sem ele, use um Ubuntu via `proot-distro` (mais lento e com mais consumo de RAM).

Depois, `git clone` do repositório, `sh scripts/dev/doctor.sh`, `node --test tests/entrypoint.test.mjs tests/dev-scripts.test.mjs` e `sh scripts/dev/run-local.sh`. Dicas:

- **Erro `CANNOT LINK EXECUTABLE ... cannot locate symbol` (git, curl):** os pacotes do Termux ficaram desatualizados em partes (a `libcurl` espera um símbolo que o `libssl` instalado não tem). Rode `pkg update && pkg upgrade`; se persistir, `pkg install --reinstall openssl libcurl curl git`, ou troque o espelho com `termux-change-repo`. O `doctor.sh` detecta o curl quebrado e mostra esse passo.
- **Memória:** o celular divide a RAM com o Android. O `doctor.sh` limita o heap sugerido a 1024M no Termux; ajuste com `MC_JAVA_HEAP` (ex.: `768M`) se o servidor for encerrado.
- **Processos em segundo plano:** o `run-local.sh` chama `termux-wake-lock`; mantenha o app aberto e o celular carregando, porque o Android pode encerrar processos, e calor e bateria limitam sessões longas.
- **Node e testes:** o Node do Termux pode ser anterior ao de `.nvmrc`; por isso use `node --test` e não `pnpm test` (o pnpm exige o engine fixado).
- **Rede:** o servidor fica acessível no IP do próprio celular na Wi-Fi (veja com `ifconfig`), sem passar por firewall do Windows ou `ufw`.
- Docker não é suportado no Termux (sem root); o runtime containerizado deve ser validado no Linux ou no WSL.

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
