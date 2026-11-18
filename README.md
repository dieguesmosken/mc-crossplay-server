# Minecraft Server Platform

Plataforma para operar um servidor Minecraft Java e Bedrock com entrada orientada por um site, inicialização sob demanda, fila de espera e gerenciamento automatizado.

> Estado atual: fundação do monorepo em preparação. O runtime Minecraft ainda não foi implementado.

## Objetivo

Servidor para até 10 jogadores simultâneos, aceitando clientes Java e Bedrock. O site consulta o estado, solicita a inicialização quando necessário, acompanha a espera e apresenta os dados de conexão quando o servidor estiver pronto.

O navegador não consegue iniciar o cliente Minecraft automaticamente em todos os dispositivos. O jogador ainda deverá abrir o Minecraft e conectar-se pelo próprio jogo.

## Tecnologias

- Minecraft: Paper (Java).
- Compatibilidade Bedrock: GeyserMC + Floodgate.
- Backend/API: Node.js + Fastify.
- Frontend: Next.js.
- Persistência inicial: SQLite.
- Ambiente local: Windows 11 + WSL2 Ubuntu 26.04.1 + Docker Desktop.
- Empacotamento: Docker Compose.
- Hospedagem futura: VPS/EC2 Linux, mantendo a arquitetura independente do provedor.

As versões e ferramentas da fundação estão documentadas em [docs/DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md). A versão-alvo do Minecraft e a versão de Java exigida pelo Paper serão definidas antes da configuração do runtime.

## Estrutura

- apps/web: site Next.js.
- apps/api: API HTTP e eventos de estado.
- apps/controller: ciclo de vida do servidor.
- packages/shared: contratos e tipos compartilhados.
- packages/database: persistência e migrações.
- packages/queue: fila e reservas.
- packages/server-adapter: integração com o runtime.
- infrastructure: Minecraft, Docker, Ubuntu e futura AWS.
- docs: especificações, arquitetura e roadmap.
- tests: testes automatizados.

## Funcionalidades previstas

- Estado do servidor consultável pelo site.
- Inicialização sob demanda e operação contínua opcional.
- Estados de inicialização, carregamento e verificação de prontidão.
- Fila lógica persistida, limite de 10 jogadores e reservas com expiração.
- Instruções Java e Bedrock com botão para copiar.
- Desligamento automático após período ocioso configurável.
- Salvamento do mundo, backups, logs, health checks e proteção contra solicitações repetidas.

A fila do site é uma fila de solicitações/reservas; não é uma fila de pacotes TCP/UDP do Minecraft.

## Desenvolvimento

Requisitos iniciais:

- Node.js 26.13.1 LTS.
- pnpm 12.21.0.
- TypeScript 7.0.2.
- Docker Desktop integrado ao WSL2.

Comandos principais:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Legado

A implementação Python de 2023 foi preservada. Os arquivos antigos ainda presentes na raiz não fazem parte do novo workspace e não devem ser removidos ou movidos sem revisão e autorização explícita.

## Segurança

- Nunca commitar tokens, senhas, chaves ou arquivos locais de ambiente.
- Não expor a API de controle diretamente à internet.
- Não publicar portas administrativas ou Docker socket.
- Tratar mundo, plugins, banco de dados e backups como dados persistentes.
- Validar tráfego TCP Java e UDP Bedrock separadamente.
- Não assumir que um túnel HTTP genérico transporta o protocolo Minecraft.
