# ChatGPT Communication Channel

## Relatório de Auditoria – 18 Nov 2026

**Objetivo:** documentar o estado atual do repositório *Minecraft Crossplay Server* para que o modelo ChatGPT possa ser usado como ponto de referência e canal de comunicação.

---

### 1. Resumo Executivo
- O repositório está em fase de **fundação**. Estrutura de monorepo está criada, com partes dos pacotes declaradas em `package.json`.
- Existe um legado em Python (pasta `arquivo/` e módulos na raiz) que não faz parte da nova arquitetura baseada em TypeScript. As diretivas em `AGENTS.md` proíbem mover ou apagar esse legado sem autorização explícita.
- Não há arquivos de infraestrutura (Dockerfiles, `docker‑compose.yml`).
- Nenhum segredo ou credencial foi encontrado no código.

---

### 2. Estrutura do Monorepo e Tecnologias Utilizadas
| Camada | Diretório | Observação |
|--------|-----------|------------|
| **Aplicações** | `apps/api`, `apps/controller`, `apps/web` | Estruturas de `package.json` presentes. |
| **Pacotes** | `packages/shared`, `packages/database`, `packages/queue`, `packages/server-adapter` | Pacotes declarados no workspace; apenas `shared` possui `build` e código. |
| **Infraestrutura** | `infrastructure/` | Diretórios criados, sem arquivos de configuração. |
| **Legado Python** | `arquivo/`, `game/`, `network/`, `persistence/`, `plugins/`, `security/`, `resources/` | Legado preservado conforme `AGENTS.md`. |
| **Testes** | `tests/foundation.test.mjs` | Teste validando `shared` e `pnpm-workspace.yaml`. |

---

### 3. Funcionalidades Implementadas vs. Não Implementadas (Atualizado)
- **Implementado:** Estrutura de monorepo (`pnpm-workspace.yaml`), contratos básicos em `packages/shared`, configurações de Lint/Prettier/TS.
- **Não Implementado:** A maioria da lógica de negócio (`apps/api`, `controller`, `web`, `database`, `queue`, `server-adapter`) está vazia, contendo apenas o `package.json`. Infraestrutura Docker inexistente.

---

### 4. Problemas e Riscos
1. **Contaminação de Legado:** A raiz contém módulos Python que podem ser confundidos com a nova estrutura.
2. **Infraestrutura:** Ausência de `docker-compose.yml` e Dockerfiles.
3. **Persistência/Fila:** Interfaces (`packages/database`, `queue`) definidas no nome, mas sem código.

---

### 5. Roadmap Técnico (Proposta)

#### Fase 1: Fundação de Infraestrutura e Persistência
- **Dependências:** Nenhuma.
- **Entregáveis:** `docker-compose.yml` (Minecraft, db, apps), configuração do banco SQLite, CI/CD básico.
- **Critério de conclusão:** Ambiente containerizado subindo sem erros; banco SQLite criado.

#### Fase 2: Lógica de Ciclo de Vida e API
- **Dependências:** Fase 1.
- **Entregáveis:** API (`apps/api`), Lógica de monitoramento de servidor (`apps/controller`), integração com servidor Paper.
- **Critério de conclusão:** API gerencia start/stop do servidor Paper via `docker-compose`; status do servidor persiste no SQLite.

#### Fase 3: Frontend e Fila
- **Dependências:** Fase 2.
- **Entregáveis:** Interface Next.js, lógica de fila de espera.
- **Critério de conclusão:** Usuário entra na fila via web e é notificado quando o servidor está `ONLINE`.

---

### 6. Decisões Arquiteturais Pendentes (Aprovação necessária)
1. **Docker Compose:** Confirmação da rede (network) entre o contêiner do servidor Minecraft (com porta UDP 19132) e o contêiner da API/Controller.
2. **Persistência:** Aprovação para iniciar com SQLite puro (sem ORM complexo) como base para a fila e logs.
3. **Isolamento de Legado:** Autorização para mover os arquivos da raiz (módulos Python) para `archive/legacy-python/` para reduzir a poluição do monorepo.

---

### 7. Evidências Verificadas
- `tests/foundation.test.mjs` valida que `packages/shared` já expõe `SERVER_STATES` e `MAX_PLAYERS` (10).
- `package.json` raiz define scripts de build recursivo para monorepo.
- `packages/shared/package.json` define estrutura como `type: "module"`.

---

*Este documento será mantido como canal de comunicação oficial entre a equipe de desenvolvimento e o modelo ChatGPT.*
