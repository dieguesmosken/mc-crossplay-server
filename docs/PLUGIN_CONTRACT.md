# Contrato entre plugin Paper, API e fila (issue #25)

Estado: **contrato, lógica da fila, API e núcleo do plugin implementados e testados**. O adaptador Paper está escrito mas **nunca foi compilado contra o `paper-api` real** (veja `apps/plugin-paper/README.md`).

## Fluxo

```
Site ──► API (fila, reservas, SQLite) ◄──► Plugin Paper
```

1. O jogador entra na fila pelo site. A API reserva uma vaga com prazo quando houver espaço.
2. Ao conectar (Java ou Bedrock), o plugin pergunta à API se pode admitir o jogador (`AsyncPlayerPreLoginEvent`).
3. O plugin avisa entradas e saídas e envia um heartbeat periódico com a lista real de jogadores.

## Rotas planejadas

| Rota                         | Corpo                                              | Resposta                                       |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| `POST /v1/server/admissions` | `{ "player": Identity }`                           | `{ "decision": "allow" }` ou `deny` + `reason` |
| `POST /v1/server/events`     | `{ "type": "join" \| "quit", "player": Identity }` | `{ "ok": true }`                               |
| `POST /v1/server/heartbeat`  | `{ "players": Identity[] }`                        | confirmação; a API reconcilia a presença       |

`Identity` = `{ platform: "java" | "bedrock", uuid, name }`. O UUID é normalizado (minúsculas, com hífens). No Bedrock vale o UUID e o nome com prefixo gerados pelo Floodgate.

Motivos de recusa (`reason`): `SERVER_FULL`, `IN_QUEUE`, `NOT_ALLOWED`. A mensagem em PT-BR vem pronta da API.

Rotas do site (sem autenticação do jogador por enquanto): `POST /v1/queue/join`, `POST /v1/queue/leave` (corpo `{ "player": Identity }`) e `GET /v1/queue/status?uuid=...`. Também `GET /health`.

**Atenção:** como não há vínculo seguro entre o site e a conta Minecraft, qualquer pessoa que saiba um UUID pode colocá-lo na fila. Isso precisa ser resolvido (decisão em aberto da #25) antes de expor essas rotas na internet. Também falta limite de pedidos contra spam.

## Execução da API

`apps/api` usa Fastify e `node:sqlite` (sem dependência nativa; funciona também no Termux). Variáveis (modelo em `apps/api/.env.example`): `MC_API_SECRET` (obrigatória, mínimo 16 caracteres), `MC_API_HOST` (padrão `127.0.0.1`), `MC_API_PORT` (padrão `8787`) e `MC_API_DB` (padrão `./data/api.sqlite`). Depois de `pnpm build`: `pnpm --filter @mc-platform/api start`. O módulo `node:sqlite` ainda é experimental no Node e imprime um aviso.

## Autenticação

Cabeçalhos `x-mc-timestamp` (milissegundos) e `x-mc-signature` (HMAC-SHA256 hexadecimal de `"<timestamp>.<corpo>"`). Janela padrão de 30 s. O segredo fica só em variável de ambiente (nunca no Git). Um pedido idêntico pode ser repetido dentro da janela, por isso as operações são idempotentes.

## Regras da fila (`packages/queue`)

- Limite padrão de 10 jogadores (`MAX_PLAYERS`); `online + reservas <= capacidade`.
- Vaga livre e fila vazia: entrada direta. Com fila, a vaga vira reserva do primeiro, com prazo (padrão 120 s); vencida, passa ao próximo.
- `sync` (heartbeat) corrige a presença: quem caiu sai, quem o plugin liberou sozinho (ops, whitelist local) entra.
- Falha da API: política do plugin (`fail-policy`, padrão `closed`). Operadores entram sem consultar a API (`local-bypass.ops`). O bypass da whitelist local é opcional e vem **desligado**, porque quem está no bypass fica fora da fila e do limite. Implementado em `apps/plugin-paper/core`.
- Configuração inválida (por exemplo, sem `MC_API_SECRET`): o plugin continua carregado e nega jogadores comuns, em vez de se desligar.

## Plugin (`apps/plugin-paper`)

Java 25 + Gradle, em dois módulos: `core` (sem Bukkit e sem dependências: regras, cliente HTTP, HMAC, política de falha) e `paper` (adaptador). O `core` tem 36 testes (`gradle :core:check`) e foi validado contra a API real: a assinatura HMAC feita em Java é aceita pelo Fastify e o contrato fecha nas duas pontas (7 testes de integração, veja o README do plugin). Detalhes, build e limitações em `apps/plugin-paper/README.md`.

## Pendente

Compilar e testar o adaptador Paper com o `paper-api` real (CI ou Linux/WSL com Java 25), e a integração real Java e Bedrock (etapa 5). Decisões em aberto na issue #25: como vincular o nome Java/gamertag à reserva no site e SSE vs WebSocket.
