# Docker no Minecraft Crossplay Server

Este diretório contém os scripts e configurações Docker que constroem e operam o **runtime Minecraft Paper** e os plugins GeyserMC/Floodgate, suportando clientes Java e Bedrock.

## Visão geral

- **Estrutura:** `docker-compose.yml` + `minecraft/Dockerfile` + `minecraft/entrypoint.sh` + `scripts/init-data.sh` + `.env.example`.
- **Persistência:** um único volume, `./data` (host) → `/server/data` (container), que é o diretório de trabalho do Paper. Mantém mundo (todas as dimensões), plugins, configs, logs, `server.properties`, whitelist, ops e `eula.txt` entre reinicializações.
- **Conformidade:** Restrições de segurança — não expor Docker socket, console administrativo ou controle à internet.
- **Rede:** Rede Docker bridge privada (`minecraft_net`). Portas publicadas em `MC_BIND_ADDRESS` (padrão `127.0.0.1`, só este computador):
  - `25565/tcp` (Java Edition).
  - `19132/udp` (Bedrock Edition).
  - `19132/tcp` (sinalização do NetherNet, Bedrock 26.60+; issue #23).

## Conteúdo

### `docker-compose.yml`

- Define a service **`papermc`** com:
  - Build a partir de `./minecraft/Dockerfile` (Paper 26.3, Java 25, plugins baixados em runtime).
  - Volume único `./data:/server/data` (mundo, plugins, configs, logs e `eula.txt`).
  - Portas publicadas em `${MC_BIND_ADDRESS:-127.0.0.1}`: loopback por padrão (uso local). Veja [Acesso pela rede local](#acesso-pela-rede-local-teste-com-o-celular).
  - Limite de memória do container: `MC_MEMORY_LIMIT` (padrão `3g`) e heap da JVM: `MC_JAVA_HEAP` (padrão `2G`), sempre com heap abaixo do limite.
  - Restart: `"no"` — quem inicia/para o servidor é o usuário/Controller; com restart automático, a saída por EULA não aceita viraria loop infinito.

### Acesso pela rede local (teste com o celular)

Por padrão o servidor só aceita conexões deste computador (`MC_BIND_ADDRESS=127.0.0.1`). Para testar com outro aparelho na mesma rede (por exemplo, o Bedrock de um celular), troque o endereço de publicação.

| `MC_BIND_ADDRESS` | Quem alcança o servidor                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `127.0.0.1`       | Só este computador (padrão, seguro).                                                                                               |
| IP da LAN         | Aparelhos da rede que chegam a esse IP (ex.: `192.168.0.20`). Preferível a `0.0.0.0`: não abre outras interfaces (VPN, Tailscale). |
| `0.0.0.0`         | Todas as interfaces do computador.                                                                                                 |

```sh
# Descobrir o IP da LAN deste computador (o que sai para a internet):
ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'

# Subir (ou recriar, se já estiver rodando) com acesso pela LAN. Os dados em ./data são mantidos.
cd infrastructure/docker
MC_BIND_ADDRESS=0.0.0.0 docker compose up -d

# Confirmar o que foi publicado:
docker compose ps
ss -lntup | grep -E ':(25565|19132)\b'

# Voltar ao modo seguro (recria o container só em loopback):
docker compose up -d
```

No celular: **Jogar → Servidores → Adicionar servidor**, endereço = IP do computador, porta = `19132`.

**Riscos (leia antes de abrir):**

- **O Docker ignora o `ufw`.** Portas publicadas pelo Docker são desviadas antes das regras do `ufw`: `ufw deny` não as bloqueia e `ufw allow` não é o que as libera. Com `0.0.0.0` (ou um IP de LAN), **qualquer aparelho da sua rede alcança o servidor**, e a whitelist do Paper vem desligada.
- Use só em rede de confiança (não em Wi-Fi público, de república ou de hotel) e volte para `127.0.0.1` ao terminar.
- **Nunca encaminhe estas portas no roteador.** Exposição à internet é a Fase 6 e exige análise própria.
- Não use a variável para expor a API da fila nem qualquer console: elas não passam por aqui e continuam em loopback.

**Bedrock 26.60 ou mais novo (NetherNet).** O Bedrock 26.60 deixa de conectar por RakNet, e o NetherNet usa TCP para sinalização e UDP para o jogo, ambos na `19132` ([Geyser: Preparing for NetherNet](https://geysermc.org/blog/preparing-for-nethernet)). Publicar `19132/tcp` é necessário, mas **não liga o NetherNet**: o RakNet continua sendo o padrão do Geyser. A mesma página cita a propriedade de sistema `-DgeyserTransport=nethernet`, que dá para passar por `MC_JAVA_OPTS` (por exemplo `MC_JAVA_OPTS=-DgeyserTransport=nethernet`). Isso **não foi validado neste projeto** (issue #23).

**Autenticação do Bedrock.** Com Geyser e Floodgate no mesmo servidor Paper, o guia do Floodgate manda definir `auth-type: floodgate` no config do Geyser ([Floodgate: setup](https://geysermc.org/wiki/floodgate/setup/)). Confira em `data/plugins/Geyser-Spigot/config.yml`.

**Matriz de testes (issue #12)** — nenhuma linha foi validada ainda:

| Caso                                    | Validado? |
| --------------------------------------- | --------- |
| Java local (`127.0.0.1`)                | não       |
| Java na LAN                             | não       |
| Bedrock local                           | não       |
| Bedrock na LAN (RakNet, antes da 26.60) | não       |
| Bedrock na LAN (NetherNet, 26.60+)      | não       |

### `minecraft/`

- **Dockerfile**: imagem base `eclipse-temurin:25-jdk-alpine`, baixa Paper 26.3 build 255 de `fill-data.papermc.io`, cria `/server/data` (ponto de montagem), copia `entrypoint.sh`.
- **entrypoint.sh**: entra em `/server/data`; baixa Geyser/Floodgate (Spigot/Paper) apenas se não existirem em `plugins/`; cria `eula.txt` com `eula=false` se ausente; valida a EULA (aceita final de linha CRLF; sai com código 1 se não for `eula=true`); inicia `java -Xms$MC_JAVA_HEAP -Xmx$MC_JAVA_HEAP $MC_JAVA_OPTS -jar /server/paper.jar nogui`.
- **scripts/init-data.sh**: cria `./data` com o seu usuário e `data/eula.txt` com `eula=false` somente se ausente. Idempotente; nunca sobrescreve nada.
- **EULA:** NÃO é aceita automaticamente. `./data/eula.txt` inicia com `eula=false`. O usuário/controller deve alterar para `eula=true` após ler a EULA oficial (https://www.minecraft.net/eula).

## Como usar (fase 1)

No workspace do projeto (Linux com Docker Engine e Docker Compose):

```bash
# 1. Preparar ./data (cria data/eula.txt com eula=false; não sobrescreve nada)
sh infrastructure/docker/scripts/init-data.sh

# 2. (Opcional) ajustar memória: cp infrastructure/docker/.env.example infrastructure/docker/.env

# 3. Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# 4. Iniciar o runtime (após aceitar a EULA, abaixo)
docker compose -f infrastructure/docker/docker-compose.yml up
```

**Importante:** O servidor não iniciará enquanto `data/eula.txt` não tiver `eula=true`. O container encerra uma única vez com a mensagem de orientação (não há reinício automático). Para aceitar, depois de ler a EULA em https://www.minecraft.net/eula:

```bash
echo 'eula=true' > infrastructure/docker/data/eula.txt
```

### Migrando do layout antigo

Se você já tinha `data/world`, `data/plugins`, `data/config` e `data/logs` (volumes separados), o servidor agora usa tudo direto em `data/`. Nenhum arquivo é movido automaticamente. Mova manualmente o conteúdo de `data/config/` para `data/` (inclusive `server.properties`) e revise o `eula.txt`.

## Notas sobre a configuração

- Somente `/server/paper.jar` fica na imagem e nunca é coberto por volume; todo o resto vive em `/server/data`.
- `eula.txt` fica dentro do volume (arquivo comum), sem bind mount de arquivo único — o que evitava o Docker criar um diretório no lugar dele.
- Memória: o heap (`MC_JAVA_HEAP`) deve ficar abaixo do limite do container (`MC_MEMORY_LIMIT`); metaspace, threads e memória off-heap ficam fora do heap, e heap igual ao limite causa OOM kill.
- Não há Redis, Kubernetes, proxy externo (ex: Nginx) — tudo permanece mínimo e local-first.

## Acesso ao container para manutenção

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec papermc sh
```

## Espaço de trabalho seguro

- Não commitar tokens, senhas, chaves privadas ou arquivos `.env` reais — variáveis de ambiente no host (arquivo `.env` local, ignorado pelo Git; use `.env.example` como modelo).
- EULA **não** aceita automaticamente. Usuário/controller deve concordar explicitamente após ler a EULA oficial.
- Repositórios de plugins (GeyserMC, Floodgate) são públicos e verificados; sem secrets.

## Documentação relacionada

- `docs/ARCHITECTURE.md` – diagramas de componente.
- `docs/DEVELOPMENT_SETUP.md` – passos validados localmente.
- `infrastructure/minecraft/README.md` – documentação detalhada do runtime.
- `docs/ROADMAP.md` – status da fase 1.

Leia sempre AGENTS.md antes de modificar qualquer arquivo Dockerfile ou docker-compose.yml.
