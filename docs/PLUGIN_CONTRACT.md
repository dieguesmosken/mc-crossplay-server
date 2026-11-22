# Contrato entre plugin Paper, API e fila (issue #25)

Estado: **contrato e lógica da fila implementados e testados**. A API (`apps/api`) e o plugin Paper ainda não existem.

## Fluxo

```
Site ──► API (fila, reservas, SQLite) ◄──► Plugin Paper
```

1. O jogador entra na fila pelo site. A API reserva uma vaga com prazo quando houver espaço.
2. Ao conectar (Java ou Bedrock), o plugin pergunta à API se pode admitir o jogador (`AsyncPlayerPreLoginEvent`).
3. O plugin avisa entradas e saídas e envia um heartbeat periódico com a lista real de jogadores.

## Rotas planejadas

| Rota                         | Corpo                       | Resposta                                       |
| ---------------------------- | --------------------------- | ---------------------------------------------- |
| `POST /v1/server/admissions` | `{ "player": Identity }`    | `{ "decision": "allow" }` ou `deny` + `reason` |
| `POST /v1/server/heartbeat`  | `{ "players": Identity[] }` | confirmação; a API reconcilia a presença       |

`Identity` = `{ platform: "java" | "bedrock", uuid, name }`. O UUID é normalizado (minúsculas, com hífens). No Bedrock vale o UUID e o nome com prefixo gerados pelo Floodgate.

Motivos de recusa (`reason`): `SERVER_FULL`, `IN_QUEUE`, `NOT_ALLOWED`. A mensagem em PT-BR vem pronta da API.

## Autenticação

Cabeçalhos `x-mc-timestamp` (milissegundos) e `x-mc-signature` (HMAC-SHA256 hexadecimal de `"<timestamp>.<corpo>"`). Janela padrão de 30 s. O segredo fica só em variável de ambiente (nunca no Git). Um pedido idêntico pode ser repetido dentro da janela, por isso as operações são idempotentes.

## Regras da fila (`packages/queue`)

- Limite padrão de 10 jogadores (`MAX_PLAYERS`); `online + reservas <= capacidade`.
- Vaga livre e fila vazia: entrada direta. Com fila, a vaga vira reserva do primeiro, com prazo (padrão 120 s); vencida, passa ao próximo.
- `sync` (heartbeat) corrige a presença: quem caiu sai, quem o plugin liberou sozinho (ops, whitelist local) entra.
- Falha da API: política do plugin (padrão fail-closed, com ops e whitelist local sempre liberados). Ainda a implementar.

## Pendente

Persistência em SQLite e rotas (`apps/api`), plugin Paper (Java 25, Gradle), integração real Java e Bedrock. Decisões em aberto na issue #25: como vincular o nome Java/gamertag à reserva no site e SSE vs WebSocket.
