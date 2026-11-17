# Ambiente de desenvolvimento

## Ambiente validado
- Windows 11.
- WSL2 3.0.5.0, kernel 6.18.58.1-microsoft-standard-WSL2.
- Ubuntu 26.04.1 LTS, distribuição WSL `Ubuntu-26.04`.
- systemd habilitado.
- Docker Desktop 4.99.0 com Engine 29.9.3 e Compose 5.7.0.
- Node.js 26.13.1 LTS instalado pelo NVM.
- npm 12.2.2.
- pnpm 12.21.0.
- OpenJDK/Javac 25.0.5.

O JDK está instalado no Ubuntu. A versão definitiva de Java para o servidor será confirmada após escolher a versão-alvo do Minecraft e consultar os requisitos do Paper correspondente.

## WSL
No PowerShell:
```powershell
wsl --list --verbose
wsl -d Ubuntu-26.04
```

Dentro do Ubuntu:
```bash
sudo apt update
sudo apt upgrade -y
```

O código deve permanecer preferencialmente no filesystem Linux:
```bash
mkdir -p ~/projects
cd ~/projects
```

## Docker
Usar Docker Desktop como único engine. Em Docker Desktop:
- Settings → General → Use the WSL 2 based engine.
- Settings → Resources → WSL Integration → Ubuntu-26.04.

Validar dentro do Ubuntu:
```bash
docker version
docker compose version
docker run --rm hello-world
```

Não instalar `docker.io`, `docker-ce` ou outro Docker Engine dentro do Ubuntu enquanto a integração do Docker Desktop estiver em uso. O socket esperado é `/var/run/docker.sock`.

## Node.js e pnpm
Node.js 26.13.1 é a linha LTS ativa neste ambiente. O projeto fixa a versão usada no desenvolvimento por meio de `.nvmrc` e do campo `packageManager` no `package.json`.

Após clonar o projeto:
```bash
nvm install
nvm use
pnpm --version
pnpm install
```

A versão do pnpm é fixada no campo `packageManager`. Se o Corepack estiver disponível e configurado, ele também pode gerenciar essa versão.

## Workspace
Comandos na raiz do repositório:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

A primeira execução de `pnpm install` deve gerar `pnpm-lock.yaml`. O lockfile deve ser commitado para reproduzir as instalações em outras máquinas e no CI.

## Observação sobre Java
Não escolher a versão do Paper nem fixar o runtime Java apenas porque o JDK 25 está instalado. Primeiro definir a versão do Minecraft desejada e verificar a matriz de compatibilidade oficial do Paper, GeyserMC e Floodgate.
