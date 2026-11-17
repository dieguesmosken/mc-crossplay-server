# Minecraft Server Platform

Plataforma para operar um servidor Minecraft Java e Bedrock com entrada orientada por um site, inicialização sob demanda, fila de espera e gerenciamento automatizado.

> Estado atual: planejamento e preparação do ambiente. Ainda não existe uma instância de jogo funcional nesta branch.

## Objetivo
Servidor para até 10 jogadores simultâneos, aceitando clientes Java e Bedrock. O site consulta o estado, solicita a inicialização quando necessário, acompanha a espera e apresenta os dados de conexão quando o servidor estiver pronto.

O navegador não consegue iniciar o cliente Minecraft automaticamente em todos os dispositivos. O jogador ainda deverá abrir o Minecraft e conectar-se pelo próprio jogo.

## Tecnologias planejadas
- Minecraft: Paper (Java).
- Compatibilidade Bedrock: GeyserMC + Floodgate.
- Backend/API: Node.js + Fastify.
- Frontend: Next.js.
- Persistência inicial: SQLite.
- Ambiente local: Windows 11 + WSL2 Ubuntu 24.04 + Docker Desktop.
- Empacotamento: Docker Compose.
- Hospedagem futura: VPS/EC2 Linux, mantendo a arquitetura independente do provedor.

As versões serão fixadas durante a implementação.

## Funcionalidades previstas
- Estado do servidor consultável pelo site.
- Inicialização sob demanda e operação contínua opcional.
- Estados de inicialização, carregamento e verificação de prontidão.
- Fila lógica persistida, limite de 10 jogadores e reservas com expiração.
- Instruções Java e Bedrock com botão para copiar.
- Desligamento automático após período ocioso configurável.
- Salvamento do mundo, backups, logs, health checks e proteção contra solicitações repetidas.

A fila do site é uma fila de solicitações/reservas; não é uma fila de pacotes TCP/UDP do Minecraft.

## Estrutura planejada
- apps/web: site Next.js.
- apps/api: API HTTP e eventos de estado.
- apps/controller: ciclo de vida do servidor.
- packages/shared: contratos compartilhados.
- packages/database: persistência e migrações.
- packages/queue: fila e reservas.
- packages/server-adapter: integração com o runtime.
- infrastructure: Minecraft, Docker, Ubuntu e futura AWS.
- docs: especificações, arquitetura e roadmap.
- tests: testes automatizados.

A estrutura será criada incrementalmente, sem diretórios vazios desnecessários.

## Documentação
- docs/PROJECT_SPEC.md
- docs/ARCHITECTURE.md
- docs/ROADMAP.md
- docs/DEVELOPMENT_SETUP.md
- AGENTS.md: instruções para agentes de programação.

## Legado
A implementação Python de 2023 foi preservada na branch archive/legacy-python-bedrock-2023. Ela é material histórico e não será usada como runtime da nova plataforma.

## Segurança
- Nunca commitar tokens, senhas, chaves ou arquivos locais de ambiente.
- Não expor a API de controle diretamente à internet.
- Não publicar portas administrativas ou Docker socket.
- Tratar mundo, plugins, banco de dados e backups como dados persistentes.
- Validar tráfego TCP Java e UDP Bedrock separadamente.
- Não assumir que um túnel HTTP genérico transporta o protocolo Minecraft.

A licença será revisada antes do primeiro release da nova implementação.
