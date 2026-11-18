# Roadmap

## Fase 0 — Fundação

- [x] Instalar Ubuntu 26.04.1 no WSL2.
- [x] Integrar Ubuntu ao Docker Desktop.
- [x] Instalar Node.js LTS, pnpm e JDK no ambiente Linux.
- [x] Criar estrutura inicial do monorepo.
- [ ] Gerar e versionar pnpm-lock.yaml após a primeira instalação.
- [ ] Configurar e validar lint, typecheck, testes e build localmente.

## Fase 1 — Runtime Minecraft

**Implementado (configuração completa, pendente validação real):**
- [x] Definir versão-alvo e confirmar requisitos Java/Paper → **Paper 26.3 (Minecraft 1.21.4) + Java 25 (Temurin)**.
- [x] Dockerfile com Paper 26.3 build 255 de `fill-data.papermc.io`, Java 25.
- [x] entrypoint.sh com download condicional de GeyserMC/Floodgate (Spigot/Paper latest) e validação de EULA.
- [x] docker-compose.yml com volumes redesenhados (não ocultam paper.jar nem plugins da imagem), portas em loopback (127.0.0.1), TCP para Java e UDP para Bedrock.
- [x] Persistência de mundo, plugins, configs, logs e EULA em `./data/`.
- [x] EULA NÃO aceita automaticamente — arquivo `./data/config/eula.txt` montado em `/server/eula.txt` com `eula=false` inicial.

**Testado:**
- [x] `docker compose config` — sintaxe válida (apenas warning de `version` obsoleto, removido).
- [x] `docker compose build` — build bem-sucedido, imagem `docker-papermc:latest` criada.

**Pendente (requer ação do usuário / cliente Minecraft):**
- [ ] Aceitar EULA manualmente (`echo 'eula=true' > infrastructure/docker/data/config/eula.txt` após ler a EULA oficial).
- [ ] Validar startup real com EULA aceita (container inicia e Paper carrega).
- [ ] Testar conexão Java (TCP 25565) com cliente Minecraft Java Edition.
- [ ] Testar conexão Bedrock (UDP 19132) com cliente Minecraft Bedrock.
- [ ] Validar `server.properties` e geração de mundo.

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

## Fase 7 — Interfaces e Dashboard (Futuro)

- [ ] Protótipo do site público do servidor (Dark tech: preto, azul, verde; status, instruções Java/Bedrock).
- [ ] Dashboard de acompanhamento do desenvolvimento (estático via HTML/CSS/JS + `project-status.json` + integração GitHub).

Cada fase exige testes documentados e validação real antes de iniciar a seguinte.
**A Fase 1 NÃO está concluída** — aguarda validação de startup real e conexões Java/Bedrock.
