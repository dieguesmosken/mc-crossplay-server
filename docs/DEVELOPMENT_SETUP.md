# Ambiente de desenvolvimento

## Host Windows
- Windows 11.
- WSL2 com Ubuntu 24.04 LTS.
- Docker Desktop com WSL 2 based engine.
- WSL Integration habilitada para Ubuntu.

## Instalação do WSL
Executar no PowerShell como administrador:
```powershell
wsl --install -d Ubuntu-24.04
wsl --list --verbose
```
Ubuntu deve aparecer com VERSION 2.

Dentro do Ubuntu:
```bash
sudo apt update && sudo apt upgrade -y
```

## Docker
Usar Docker Desktop como único engine. Habilitar:
- Settings → General → Use the WSL 2 based engine.
- Settings → Resources → WSL Integration → Ubuntu-24.04.

Dentro do Ubuntu, validar:
```bash
docker version
docker compose version
```
Não instalar docker.io, docker-ce ou outro Docker Engine dentro do Ubuntu enquanto a integração do Docker Desktop estiver em uso.

## Código
Preferir o filesystem Linux:
```bash
mkdir -p ~/projects
cd ~/projects
```
Evitar desenvolver em /mnt/c quando houver grande volume de operações de arquivos.

## Próximas decisões
Versões de Node.js, Java, pnpm e ferramentas serão fixadas na primeira implementação, após validar requisitos atuais de Paper/Geyser/Floodgate.
