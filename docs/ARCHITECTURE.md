# Arquitetura técnica

## Componentes

- Web (Next.js): status, solicitação de entrada, fila e instruções.
- API (Node.js/Fastify): API do site, autenticação, rate limits e persistência da fila.
- Controller: serviço restrito que inicia, monitora e encerra a instância de jogo.
- Minecraft runtime: Paper com GeyserMC e Floodgate.
- Database: SQLite inicialmente.
- Storage: volumes persistentes para mundo, plugins, configurações, banco e backups.

## Comunicação

Web → API por HTTP local e HTTPS no futuro.
API → Controller por canal privado autenticado.
Controller → runtime por Docker Engine/Compose ou mecanismo de processo definido na implementação.
Jogadores → Paper via TCP; clientes Bedrock → Geyser via UDP.

Não expor Docker socket ou API privilegiada diretamente à internet. A API pública não deve executar comandos arbitrários no host.

## Ciclo de vida

OFFLINE → START_REQUESTED → STARTING → LOADING_WORLD → VERIFYING_CONNECTION → ONLINE → IDLE → STOPPING → OFFLINE.
Falhas levam a ERROR, com timeout, logs e nova tentativa controlada.

## Ambiente local validado

- Windows 11 como host.
- WSL2 com Ubuntu 26.04.1 LTS (distribuição: Ubuntu-26.04).
- Docker Desktop como único Docker Engine, com integração WSL habilitada.
- Código no filesystem Linux (ex.: ~/projects/...) para melhor I/O.
- systemd habilitado no WSL.
- Não instalar Docker Engine duplicado no Ubuntu.

## Rede

- Java: TCP (porta configurável; padrão comum 25565).
- Bedrock: UDP (porta configurável; padrão comum 19132).
- Testar firewall, roteador e provedor separadamente.
- Túnel HTTP genérico não é solução universal para UDP/Bedrock.

## Persistência e backups

- Persistir mundo, plugins, configs, banco e backups fora do ciclo de vida do container.
- Nunca remover volumes de dados em operações normais de rebuild.
- Backup antes de upgrades e desligamento automático.
- Definir retenção e testar restauração.

## Nuvem futura

Arquitetura provider-agnostic. EC2/VPS Linux é opção futura; dimensionamento, créditos, custos, tráfego TCP/UDP, armazenamento e backups devem ser verificados antes do deploy. Frontend pode ser hospedado separadamente, mas API e runtime do jogo precisam de infraestrutura apropriada.
