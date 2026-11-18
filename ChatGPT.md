# ChatGPT Communication Channel

## Relatório de Auditoria – 18 Nov 2026

**Objetivo:** documentar o estado atual do repositório *Minecraft Crossplay Server* para que o modelo ChatGPT possa ser usado como ponto de referência e canal de comunicação.

---

### 1. Resumo Executivo
- O repositório está em fase de **fundação**.  Estrutura de monorepo está criada, mas a maior parte do código funcional ainda não foi implementada.
- Existe um legado em Python (pasta `arquivo/` e módulos na raiz) que não faz parte da nova arquitetura baseada em TypeScript.  As diretivas em `AGENTS.md` proíbem mover ou apagar esse legado sem autorização explícita.
- Não há arquivos de infraestrutura (Dockerfiles, `docker‑compose.yml`) nem testes relevantes além de um único teste de placeholder.
- Nenhum segredo ou credencial foi encontrado no código.

---

### 2. Estrutura do Monorepo e Tecnologias Utilizadas
| Camada | Diretório | Observação |
|--------|-----------|------------|
| **Aplicações** | `apps/api` – API HTTP (Fastify) <br> `apps/controller` – ciclo de vida do servidor <br> `apps/web` – frontend Next.js | Cada pasta contém apenas `package.json`; código ainda não está presente. |
| **Pacotes compartilhados** | `packages/shared` – tipos e contratos (TypeScript) | Código compilado já está em `dist/`. |
| **Persistência** | `packages/database` – interface de SQLite (padrão ainda não implementado) |
| **Fila / Reservas** | `packages/queue` – estrutura de fila (vazio) |
| **Adapter do servidor** | `packages/server-adapter` – integração com runtime Minecraft (vazio) |
| **Infraestrutura** | `infrastructure/docker`, `infrastructure/minecraft`, `infrastructure/aws`, `infrastructure/ubuntu` | Diretórios criados, sem arquivos de configuração. |
| **Legado Python** | `arquivo/` (scripts de backup, utilitários) <br> `game/`, `network/`, `persistence/`, `plugins/`, `security/`, `resources/` | Não fazem parte da nova arquitetura; permanecem para referência. |
| **Documentação** | `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_SETUP.md`, `docs/PROJECT_SPEC.md`, `docs/ROADMAP.md` | Refletem a visão do projeto; a implementação ainda não corresponde a tudo que é descrito. |
| **Testes** | `tests/foundation.test.mjs` | Único teste placeholder. |

**Tecnologias declaradas** (documentação):
- **Java:** Paper (Minecraft Java Edition)
- **Bedrock:** GeyserMC + Floodgate
- **Backend:** Node.js + Fastify (TypeScript)
- **Frontend:** Next.js (React)
- **Persistência inicial:** SQLite (planejado migrar para PostgreSQL)
- **Orquestração:** Docker Compose
- **Gerenciamento de pacotes:** pnpm workspace

---

### 3. Funcionalidades Implementadas vs. Não Implementadas
| Funcionalidade | Status | Evidência |
|----------------|--------|-----------|
| Estrutura de monorepo (apps, packages, docs) | **Implementada** | Diretórios listados no `ls` acima. |
| Código da API (`apps/api`) | **Não implementado** – apenas `package.json`. |
| Controlador de ciclo de vida (`apps/controller`) | **Não implementado** – apenas `package.json`. |
| Frontend Next.js (`apps/web`) | **Não implementado** – apenas `package.json`. |
| Integração com Paper/Geyser (`packages/server-adapter`) | **Não implementado** – pasta vazia. |
| Persistência SQLite (`packages/database`) | **Não implementado** – apenas `package.json`. |
| Fila de reservas (`packages/queue`) | **Não implementado** – apenas `package.json`. |
| Docker Compose / Dockerfiles | **Não implementado** – pastas vazias. |
| Testes automatizados | **Parcial** – um teste placeholder (`tests/foundation.test.mjs`). |
| Documentação de arquitetura e setup | **Implementada** – arquivos em `docs/`. |
| Legado Python (scripts de backup) | **Presente** – não faz parte da nova stack. |

---

### 4. Problemas, Inconsistências e Riscos
1. **Mistura de Legado e Nova Base** – Pastas Python (`arquivo/`, `game/`, etc.) convivem com a estrutura TypeScript, aumentando risco de importação acidental ou confusão de dependências.
2. **Infraestrutura Inexistente** – Falta de `docker-compose.yml` e Dockerfiles impede a execução local/CI conforme descrito nos documentos.
3. **Ausência de Código Funcional** – Nenhum endpoint de API, controlador ou frontend está implementado, o que impede validações de integração.
4. **Testes Insuficientes** – Apenas um teste placeholder; cobertura de unidades, integração e e2e está ausente.
5. **Risco de Segurança Potencial** – Embora nenhum segredo seja visível, a proximidade de scripts legados que manipulam arquivos de mundo pode gerar vetores de ataque se forem incorporados inadvertidamente.
6. **Dependências Não Instaladas** – O `README` lista versões de Node, pnpm, TypeScript, mas não há `node_modules` instalados no workspace (não é um problema imediato, mas impede a compilação.

---

### 5. Segurança, Persistência e Gerenciamento do Servidor
- **Segurança:** Não há arquivos `.env` ou chaves. As diretrizes de `AGENTS.md` (não expor Docker socket, não publicar portas administrativas) ainda não foram materializadas em código/config.
- **Persistência:** Não há implementação de SQLite ou migrações; apenas a intenção está documentada.
- **Gerenciamento de Processos:** Não há scripts de start/stop, monitoramento de readiness ou time‑outs. O controle via API ainda não foi escrito.

---

### 6. Testes Existentes e Lacunas de Cobertura
- **Arquivo:** `tests/foundation.test.mjs`
- **Conteúdo:** Placeholder (não contém asserts relevantes).
- **Lacunas:** Falta de testes unitários para pacotes `shared`, `database`, `queue`; ausência de testes de integração API‑controller‑runtime; nenhum teste de UI.

---

### 7. Próximas Etapas Recomendadas (Prioridade)
#### Alta
1. **Isolar o código legado** – mover para um diretório exclusivo (`archive/legacy-python/`) ou garantir que o `.gitignore` exclua esses arquivos do build.
2. **Criar infraestrutura Docker** – adicionar `docker-compose.yml` com serviços: `minecraft`, `api`, `controller`, `db` (SQLite via volume).
3. **Implementar persistência SQLite** – criar esquema básico em `packages/database` e expor via API.
4. **Desenvolver controlador de ciclo de vida** – iniciar/monitorar processo Java, validar readiness (não apenas existência do processo).
#### Média
5. **Implementar API básica** – endpoints `/status`, `/start`, `/stop` em `apps/api`.
6. **Adicionar testes unitários** para `packages/shared` e para a camada de fila.
7. **Documentar portas e firewall** – atualizar `docs/ARCHITECTURE.md` com detalhes concretos.
#### Baixa
8. **Construir frontend mínimo** – página Next.js que consome a API de status.
9. **Migrar testes para framework completo** (Jest/Playwright) e integrar ao CI.
10. **Revisar e limpar scripts legados** – remover ou marcar como “não usado”.

---

### 8. Evidências (caminhos e explicações)
- **Estrutura de diretórios** – obtida via `ls -R .` (listagem completa no início da auditoria).
- **Documentação** – arquivos `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT_SETUP.md`, `docs/PROJECT_SPEC.md`, `docs/ROADMAP.md` contêm a visão do projeto.
- **Código legado** – pasta `arquivo/` e módulos Python (`game/`, `network/`, `persistence/`, `plugins/`, `security/`, `resources/`).
- **Pacotes TypeScript** – `packages/shared` contém código compilado (`dist/index.js`).
- **Testes** – único arquivo `tests/foundation.test.mjs`.
- **Git status** – mostrada na verificação de branch (`git status`).

---

*Este documento será mantido como canal de comunicação oficial entre a equipe de desenvolvimento e o modelo ChatGPT.*
