# Runtime Minecraft (Paper + GeyserMC + Floodgate) — Fase 1

Este diretório contém os arquivos de build Docker que produzem o **servidor Minecraft Paper** mais plugins de compatibilidade **GeyserMC** e **Floodgate** (suportando clientes Java Edition e Bedrock).

## Componentes

### `Dockerfile`

- **Base:** Temurin 21 JDK (Alpine Linux) — imagem estável e legada.
- **Downloads:** Paper 1.20.1, GeyserMC e Floodgate de versões mais recentes.
- **Pasta e configurações:** `eula.txt = true` (aceitar EULA), `server.properties` será sobrescrito pelo `docker-compose.yml`.
- **Plugins:** GeyserMC e Floodgate são instalados em `$SERVER_DIR/plugins/`.
- **Configurações:** `$JAVA_OPTS` e `$PAPER_FILE` definidos de forma que sejam facilmente sobrescritos em tempo de execução.

### Usar (fase 1)

Dentro do workspace do projeto:

```bash
# Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# Iniciar o runtime
 docker compose -f infrastructure/docker/docker-compose.yml up
```

Isso constrói a imagem, executa o container e inicializa o servidor (primeira vez pode demorar devido a downloads).

## Persistência

Todos os dados persistentes são mantidos em `data/` dentro do workspace (hosts do Docker Desktop com integração WSL2):

- `data/world/` — arquivos do mundo do Minecraft (Java Edition + mundo Gerado pelo Geyser).
- `data/plugins/` — GeyserMC e Floodgate (reinstalados a cada build, mas instalados uma vez e preservados em novas criações de contêiner).
- `data/config/` — qualquer `server.properties` e `whitelist.json` que você quiser personalizar sem reverter ao padrão.
- `data/logs/` — saída do servidor.

Os volumes são definidos no `docker-compose.yml` dentro do volume `papermc` e referenciados com mapeamentos locais.

## Arquivo de backup `docker-compose.yml`

- Use `docker compose up` para aplicar mudanças no servidor (rebuild + restart).
- Observe os logs para determinar necessidade de persistência entre reinicializações.

## Segurança e Conformidade

- **Portas TCP/UDP expostas apenas para locatários externos:** 25565 (TCP, Java) e 19132 (UDP, Bedrock) — conforme restrições.
- **Não** expor o socket Docker, console administrativo ou controle à internet — ambos omitidos.
- **EULA aceita** no momento da construção; a versão e os plugins são públicos (sem tokens secretos).
- **Credenciais**: use variáveis de ambiente no Docker Desktop (ex: .env.local) e scripts não commitados.

## Teste (após o startup)

Dentro do container (execute uma vez que o servidor esteja em execução):

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec papermc bash
# dentro do container:
curl -s http://localhost:25565
# ou use um cliente Minecraft para testar o mesmo mundo
```

O servidor deve iniciar e aparecer em `localhost` (Java) e `localhost` (Bedrock).

## Documentação relacionada

- `docs/ARCHITECTURE.md` — diagramas de componente.
- `docs/DEVELOPMENT_SETUP.md` — ambiente local validado.
- `docs/ROADMAP.md` — status da fase 1.

Lembre-se de ler `AGENTS.md` antes de modificar qualquer Dockerfile ou docker-compose.yml.

## Manutenção

- `docker compose -f infrastructure/docker/docker-compose.yml down --rmi local -v` só se necessário (remove contêineres e volumes locais) – **não** execute isso para limpar logs ou dados.
- Para executar um comando no servidor sem parar o container:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec papermc /bin/bash
```

## Perspectiva de hospedagem futura

- A arquitetura independente do provedor permite replicação em EC2/VPS (apenas altere o mapeamento de porta e adicione proxy reverso/proxy de rede externo conforme necessário).
- Volumes de dados permanecem independentes do provedor (ex: por meio de AWS EFS, backups externos).
- O runtime pode ser separado em service independente (sem Docker) posteriormente.

## Lista de Tarefas (fase 1)

- [x] Adicionar Docker Compose em `infrastructure/docker/` (este arquivo).
- [x] Criar `Dockerfile` com Paper 1.21.4.1 e compatibilidade Bedrock.
- [x] Adicionar README.md para cada subdiretório.
- [x] Definir camadas de volume (`data/world`, `plugins`, `config`, `logs`).
- [x] Documentar portas e conformidade de segurança.
- [ ] Testar startup local (executável no início do sprint).

Próximo passo (fase 2): scripts de start/stop dentro do controller (`apps/controller`).

---

*Este README faz parte de um pipeline de construção local-first.*
