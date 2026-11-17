# Roadmap

## Fase 0 — Fundação
- [ ] Instalar Ubuntu 24.04 no WSL2.
- [ ] Integrar Ubuntu ao Docker Desktop.
- [ ] Criar estrutura inicial do monorepo.
- [ ] Definir versões Node.js, Java e ferramentas.
- [ ] Configurar lint, typecheck e testes.

## Fase 1 — Runtime Minecraft
- [ ] Subir Paper localmente.
- [ ] Aceitar EULA e configurar server.properties conscientemente.
- [ ] Instalar/configurar GeyserMC e Floodgate.
- [ ] Validar entrada Java.
- [ ] Validar entrada Bedrock.
- [ ] Persistir mundo e plugins em volumes.

## Fase 2 — Controller
- [ ] Implementar start/stop/status/logs.
- [ ] Implementar health check e readiness.
- [ ] Tratar falhas, timeout e inicializações duplicadas.
- [ ] Proteger operações administrativas.

## Fase 3 — API e persistência
- [ ] Criar API Fastify.
- [ ] Criar schema SQLite e migrações.
- [ ] Implementar fila, reservas e limite de 10 jogadores.
- [ ] Implementar eventos de estado (SSE ou WebSocket; decisão posterior).
- [ ] Implementar rate limit e idempotência.

## Fase 4 — Site
- [ ] Criar interface Next.js.
- [ ] Mostrar status e estados de inicialização.
- [ ] Mostrar espera/fila e expiração de reserva.
- [ ] Mostrar instruções Java/Bedrock e copiar endereço.

## Fase 5 — Operação
- [ ] Implementar desligamento por ociosidade configurável.
- [ ] Aviso prévio e cancelamento se jogador entrar.
- [ ] Backup e restauração testada.
- [ ] Logs e observabilidade básica.

## Fase 6 — Hospedagem
- [ ] Documentar portas TCP/UDP e firewall.
- [ ] Comparar VPS/EC2 e custos reais.
- [ ] Definir backup externo e recuperação.
- [ ] Testar deploy em Linux sem dependência do PC pessoal.

Cada fase exige testes documentados e validação real antes de iniciar a seguinte.
