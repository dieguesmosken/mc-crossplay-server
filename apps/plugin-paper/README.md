# Plugin Paper da plataforma (issue #25, etapa 4)

Aplica no servidor Paper as regras decididas pela API (`apps/api`): fila, reservas e limite de jogadores. Contrato completo em [`docs/PLUGIN_CONTRACT.md`](../../docs/PLUGIN_CONTRACT.md).

## Estrutura

| Módulo   | O que é                                                                                                           | Dependências                |
| -------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `core/`  | Regras, cliente HTTP, assinatura HMAC, política de falha, JSON mínimo. **Sem Bukkit e sem bibliotecas externas.** | nenhuma (só JDK)            |
| `paper/` | Adaptador: eventos do Paper, heartbeat, detecção Java/Bedrock, `plugin.yml`, `config.yml`.                        | `paper-api` (`compileOnly`) |

O `paper/` empacota as classes do `core/` no mesmo jar (`mc-platform-<versão>.jar`).

## Como funciona

- **Login** (`AsyncPlayerPreLoginEvent`, prioridade `HIGH`): se o servidor já recusou (ban, whitelist vanilla, lotação), o plugin não faz nada. Caso contrário consulta `POST /v1/server/admissions`; negado, mostra a mensagem em PT-BR da API (`KICK_FULL` para `SERVER_FULL`, `KICK_OTHER` nos demais).
- **Entrada/saída**: `PlayerJoinEvent`/`PlayerQuitEvent` viram `POST /v1/server/events`, enviados fora da thread do servidor, em ordem.
- **Heartbeat**: a cada `heartbeat-seconds` envia a lista real de jogadores; a API reconcilia a presença.
- **Falha da API**: `fail-policy: closed` (padrão) nega jogadores comuns; `open` libera todos. O plugin nunca lança exceção no login. Operadores (`local-bypass.ops`) entram sem consultar a API.
- **Configuração inválida** (por exemplo, sem segredo): o plugin **continua carregado e fecha o servidor** para jogadores comuns, em vez de se desligar (desligar deixaria tudo aberto).
- **Segredo**: só pela variável de ambiente `MC_API_SECRET` (mínimo de 16 caracteres, igual ao da API). Nunca no `config.yml`. A variável precisa chegar ao processo do Paper (a ligação no `docker-compose.yml` ainda não foi feita).

### Atenção ao `local-bypass.whitelist`

Quem está no bypass entra **sem passar pela fila e fora do limite de 10**. Por isso `whitelist` vem **desligado**: se a whitelist do servidor lista os amigos que devem respeitar a fila, ligar o bypass anularia o plugin. Operadores continuam no bypass por padrão. Esta é uma decisão de projeto minha, ainda não aprovada na issue.

## Build e testes

O núcleo não usa JUnit: os testes são classes simples (`core/src/test`), executadas por `AllTests`, e rodam em qualquer JDK 21+.

```sh
cd apps/plugin-paper
gradle :core:check                      # Java 25 (padrão): núcleo compila e 36 testes rodam
gradle -PjavaRelease=21 :core:check     # em JDK 21 (por exemplo, para validar sem o 25)
gradle :paper:build                     # exige acesso ao repo.papermc.io (paper-api); gera o jar
```

Gradle 9.1+ é necessário para rodar em Java 25. Não há wrapper commitado ainda.

### Teste de integração com a API real

Prova que a assinatura HMAC feita em Java é aceita pela API Fastify e que o contrato (limite de 10, saída libera vaga, heartbeat) fecha nas duas pontas. Exige a API recém-iniciada, com banco vazio.

```sh
pnpm build
MC_API_SECRET='segredo-de-teste-123' MC_API_PORT=18787 MC_API_DB=/tmp/e2e.sqlite node apps/api/dist/server.js &

cd apps/plugin-paper
gradle :core:coreTest -PjavaRelease=21 \
  -Dmc.e2e.url=http://127.0.0.1:18787 -Dmc.e2e.secret='segredo-de-teste-123'
```

Sem as duas propriedades `-Dmc.e2e.*` o teste é ignorado.

## Instalar no servidor

1. Copie `paper/build/libs/mc-platform-<versão>.jar` para a pasta `plugins/` do servidor.
2. Exporte `MC_API_SECRET` no processo do Paper, com o mesmo valor da API.
3. Suba o servidor uma vez para gerar `plugins/McPlatform/config.yml`; ajuste `api-url` e a política de falha.
4. O Floodgate é `softdepend`: o plugin carrega sem ele, mas sem o Floodgate a identificação do Bedrock cai numa heurística de UUID.

## O que ainda não foi validado

- **O adaptador `paper/` nunca foi compilado contra o `paper-api` real.** Foi checado apenas contra stubs mínimos escritos por mim, que refletem o que assumi do Paper (por exemplo, `AsyncPlayerPreLoginEvent#disallow(Result, Component)`), não o Paper de verdade.
- A coordenada `io.papermc.paper:paper-api:26.3.build.+` vem da documentação do Paper e está com versão dinâmica (`+`); precisa ser fixada na primeira resolução no CI.
- `api-version: '26.3'` no `plugin.yml` e o carregamento do plugin num Paper 26.3 real.
- Floodgate por reflexão (`FloodgateApi.getInstance()` / `isFloodgatePlayer`) e a heurística de UUID.
- `Bukkit.getOfflinePlayer(uuid).isOp()/isWhitelisted()` chamados fora da thread principal (no pré-login).
- CI em Java 25 / Gradle 9.1.0 (workflow `.github/workflows/plugin-paper.yml` nunca executou).
- Etapa 5: entrada real por Java e por Bedrock, vaga liberada ao sair, reserva expirando.
