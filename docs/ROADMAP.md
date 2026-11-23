# Roadmap

Atualizado em 2026-11-23. `[x]` só para o que foi executado de verdade; o que falta, ou só foi escrito e testado em código, fica explícito.

## Fase 0 — Fundação

- [x] Instalar Ubuntu 26.04.1 no WSL2.
- [x] Integrar Ubuntu ao Docker Desktop.
- [x] Instalar Node.js LTS, pnpm e JDK no ambiente Linux.
- [x] Criar estrutura inicial do monorepo.
- [x] Gerar e versionar `pnpm-lock.yaml`.
- [x] Typecheck, testes e build passam localmente (76 testes em Node 22 no ambiente do Claude; 50 em Node 26 no Pop!_OS do usuário em 2026-11-22). `pnpm lint` passa depois da limpeza de `admin.js`.
- [ ] `pnpm format:check` ainda falha em arquivos antigos (`CHANGELOG.md`, `ChatGPT.md`, `docker-compose.yml`). Não existe CI da nova plataforma (#15).

## Fase 1 — Runtime Minecraft

**Implementado e validado em Linux (Pop!\_OS 24.04, Docker):**

- [x] Versão-alvo: **Paper 26.3 (Minecraft 26.3, não 1.21.4) + Java 25 (Temurin)**.
- [x] Dockerfile com Paper 26.3 build 255, Java 25, e `entrypoint.sh` com download condicional de Geyser e Floodgate e validação de EULA (nunca aceita sozinha).
- [x] `docker-compose.yml` com portas em `${MC_BIND_ADDRESS:-127.0.0.1}` (TCP 25565 e TCP+UDP 19132), volume único `./data` e persistência de mundo, plugins, configs, logs e EULA.
- [x] EULA aceita manualmente e startup real: o Paper carrega com Geyser e Floodgate (Done em cerca de 20 a 61 s).
- [x] Whitelist ligada e administrada pelo console (`docker attach minecraft-paper`, `fwhitelist add` e `remove`, testados em 2026-11-23).
- [x] Conexão Bedrock na LAN pelo NetherNet: Galaxy A17 na versão **26.60** entrou, jogou e foi recusado/liberado pela whitelist (validado em 2026-11-22 e reconfirmado em 2026-11-23). A **beta 26.70 não entrou**; o README do Docker registra a lista de versões aceitas pelo Geyser atual.
- [x] Mundo gerado e jogável. As chaves do `server.properties` não foram conferidas uma a uma (só `white-list`).

**Pendente:**

- [ ] Conexão Java (TCP 25565), local e na LAN: não testada.
- [ ] Bedrock em outras versões (RakNet antes da 26.60; versões acima da 26.65).
- [ ] Persistência depois de reiniciar o container.

## Fase 2 — Controller

- [ ] Implementar start/stop/status/logs. O canal de controle (RCON × Docker × SLP) está em decisão (#19).
- [ ] Implementar health check e readiness.
- [ ] Tratar falhas, timeout e inicializações duplicadas.
- [ ] Proteger operações administrativas.

## Fase 3 — API e persistência

- [x] API Fastify (`apps/api`).
- [x] Persistência SQLite (`node:sqlite`, tabela `queue_state`). Ainda sem migrações versionadas.
- [x] Fila, reservas e limite de 10 jogadores em `packages/queue` (lógica pura, testada). **Ainda não validada com o plugin num Paper real** (#25 etapa 5).
- [x] Eventos de estado ao vivo por SSE no painel admin (`/admin/api/stream`).
- [ ] Rate limit e idempotência: só há rate limit no login do admin (e a regra da Cloudflare); a idempotência do contrato (plugin) está só no código e nos testes.

## Fase 4 — Site

- [x] Site público e painel admin em HTML estático servido pela API (`apps/api/public`), no ar em `mine.teuzin.com.br` atrás de um Worker da Cloudflare e de um Tunnel (não é Next.js).
- [x] Painel admin com status do servidor, quem está no mundo, entradas e saídas, mortes, recusas da whitelist (com botão que copia o comando de liberar) e uso do computador. Validado com o log real do Paper em 2026-11-23.
- [ ] Fila e expiração de reserva no site público (depende do plugin e da API em uso real).
- [ ] Instruções Java/Bedrock com endereço copiável (o endereço `server.teuzin.com.br` ainda não existe no DNS).

## Fase 5 — Operação

- [ ] Implementar desligamento por ociosidade configurável.
- [ ] Aviso prévio e cancelamento se jogador entrar.
- [ ] Backup e restauração testada.
- [ ] Logs e observabilidade básica (o painel lê o `latest.log`; não há retenção nem alertas).

## Fase 6 — Hospedagem

- [x] Documentar portas TCP/UDP e o aviso de que o Docker ignora o `ufw` (`infrastructure/docker/README.md`).
- [ ] Acesso dos amigos pela internet sem abrir portas: testar Tailscale e playit.gg (#24); relay próprio como plano B (#26).
- [ ] Comparar VPS/EC2 e custos reais.
- [ ] Definir backup externo e recuperação.
- [ ] Testar deploy em Linux sem dependência do PC pessoal.

## Fase 7 — Interfaces e Dashboard (Futuro)

- [ ] Revisar o visual do site público (Dark tech: preto, azul, verde).
- [ ] Dashboard de acompanhamento do desenvolvimento (estático via HTML/CSS/JS + `project-status.json` + integração GitHub).

## Plugin Paper (issue #25, prioridade 1)

- [x] Contrato, fila e API (etapas 1 a 3).
- [x] Etapa 4: núcleo e adaptador compilam e os 36 testes do núcleo passam no CI (workflow `Plugin Paper`).
- [ ] Etapa 5: carregar o jar num Paper 26.3 real, ligar `MC_API_SECRET` e a URL da API ao Paper, e testar entrada Java e Bedrock, vaga liberada ao sair e reserva expirando.

Cada fase exige testes documentados e validação real antes de iniciar a seguinte.
**A Fase 1 não está concluída**: falta validar a conexão Java e outras versões do Bedrock.
