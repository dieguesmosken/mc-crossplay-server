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

**Bedrock 26.60 ou mais novo (NetherNet).** O Bedrock 26.60 deixa de conectar por RakNet, e o NetherNet usa TCP para sinalização e UDP para o jogo, ambos na `19132` ([Geyser: Preparing for NetherNet](https://geysermc.org/blog/preparing-for-nethernet)). Por isso o compose publica `19132/tcp` e `19132/udp`. Na build do Geyser que o entrypoint baixou em 2026-11-22 (`2.12.1-b1306`), o `config.yml` já vem com `transport: nethernet` e `signaling.mode: builtin`, e o log mostra `Built-in signaling started on http://0.0.0.0:19132`. Não foi preciso passar `-DgeyserTransport=nethernet`. Se a sua build for mais antiga e o log avisar que o NetherNet não está ligado, atualize o Geyser (veja abaixo).

**Autenticação do Bedrock.** Com Geyser e Floodgate no mesmo servidor Paper, o guia do Floodgate manda definir `auth-type: floodgate` no config do Geyser ([Floodgate: setup](https://geysermc.org/wiki/floodgate/setup/)). Confira com `grep -n "auth-type" data/plugins/Geyser-Spigot/config.yml`. Com `online`, o jogador Bedrock precisaria de uma conta Java.

**Matriz de testes (issue #12).** Validada em 2026-11-22 num Linux (Pop!_OS 24.04) com Paper 26.3 build 255, Geyser `2.12.1-b1306` e Floodgate `2.2.5`, e um Galaxy A17 (Android) na mesma rede Wi-Fi:

| Caso                                    | Validado?                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Java local (`127.0.0.1`)                | não                                                                                                                                                                       |
| Java na LAN                             | não                                                                                                                                                                       |
| Bedrock local                           | não                                                                                                                                                                       |
| Bedrock na LAN (RakNet, antes da 26.60) | não (o RakNet deixa de valer na 26.60)                                                                                                                                    |
| Bedrock na LAN (NetherNet, 26.60)       | sim: o celular (release 26.60, endereço `IP-da-LAN:19132`) entrou no mundo como `.TeuzinYTBR`, depois de resolver a whitelist (veja abaixo). Outras versões: não testadas |

O teste não isolou o ajuste de `advertise-addresses` (veja abaixo): não sabemos se ele foi necessário.

### Solução de problemas (achados do teste na LAN)

- **`Outdated Geyser proxy! This server supports the following Bedrock versions: …`** O Geyser só aceita as versões Bedrock listadas na própria mensagem (nesta build, 26.40 a 26.65). Um **beta** mais novo (o celular de teste estava na 26.70) é recusado. Saia do programa beta na Google Play e reinstale, ou atualize o Geyser. O entrypoint só baixa o Geyser se `data/plugins/geyser.jar` não existir, então ele **não se atualiza sozinho**. Para pegar a build mais recente (e seguir o `latest` do download, que não é fixado):

  ```sh
  cd infrastructure/docker
  docker compose down
  mv data/plugins/geyser.jar data/plugins/geyser.jar.bak   # guarda a versão atual
  MC_BIND_ADDRESS=0.0.0.0 docker compose up -d             # sem a variável, as portas voltam a 127.0.0.1
  ```

  Isso não garante que a build nova aceite a sua versão do Bedrock: confira a lista na mensagem de erro.

- **Entrada recusada com `You are not whitelisted on this server!`.** O `server.properties` do teste tinha `white-list=true`. O jogador Bedrock aparece com prefixo `.` (Floodgate), por exemplo `.TeuzinYTBR`, e precisa estar na whitelist. No console do servidor (próximo item), o Floodgate tem o comando `fwhitelist add <gamertag>`; **não foi testado aqui**. Para um teste rápido, `white-list=false` no `data/server.properties` e `docker compose restart papermc` funcionam, mas com as portas na LAN qualquer aparelho da rede entra enquanto a whitelist estiver desligada. Restaure o arquivo ao terminar.
- **Console do servidor.** O compose mantém `stdin_open` e `tty` abertos. Use `docker attach minecraft-paper` para digitar comandos e saia com **Ctrl+P e Ctrl+Q**. Ctrl+C no `attach` envia o sinal ao servidor e o **para**. Essa configuração não foi exercitada num container real (só o `docker compose config`).
- **`permission denied while trying to connect to the Docker daemon socket`.** O usuário não está no grupo `docker`. Use `sudo docker compose …` ou `sudo usermod -aG docker $USER` e abra uma nova sessão do terminal.
- **`advertise-addresses` (hipótese não confirmada).** O Geyser anuncia ao celular os endereços da própria máquina e o IP público achado por STUN. Dentro do Docker, a "máquina" é o container, e o IP público do STUN usa outra porta que a `19132` (o log mostra `…:57936`). Em LAN, a `config.yml` aceita listar um endereço em `bedrock.signaling.advertise-addresses` (por exemplo `["IP-da-LAN"]`). **Não confirmamos que isso seja necessário**: o beta chegou ao servidor com a config padrão. Se a conexão falhar na LAN, é um ajuste a testar, e o IP fixo não deve ficar na configuração depois.
- **Avisos que não impedem a entrada:** `Send failed, errno=101` e o STUN com `cannot reach […]` (rede sem rota IPv6); `Unable to resolve the skin api … api.geysermc.org` (só afeta skins; o container não resolveu o endereço); `*** Currently you are 3 builds behind ***` (o projeto fixa o Paper build 255). O log também avisa que o servidor roda como `root` dentro do container; isso não foi alterado aqui. O relógio dos logs do container está em UTC.

### API da fila no Docker (opcional, issue #25 etapa 5)

O serviço `api` do compose roda a API de `apps/api` (fila, limite de 10, reservas) numa imagem Node 26.13.1. Ele só sobe com o perfil `api`; sem o perfil, `docker compose up -d` continua subindo só o Minecraft.

- **Segredo.** O plugin e a API assinam as chamadas com HMAC usando o mesmo `MC_API_SECRET` (mínimo de 16 caracteres). Gere um com `openssl rand -hex 32` e coloque em `infrastructure/docker/.env` (ignorado pelo Git). O `.env.example` mantém a variável **vazia** de propósito. O compose passa o valor ao serviço `api` e ao `papermc`; a API recusa subir com segredo vazio ou curto.
- **Rede.** A API **não publica porta no host**: ela só responde na rede interna `minecraft_net`. Dentro dessa rede o plugin a alcança em `http://api:8787`. O plugin avisa (sem bloquear) quando o endereço é `http` fora de `localhost`; numa rede privada do compose isso é esperado.
- **Dados.** O estado da fila (SQLite) fica no volume nomeado `api_data`, em `/data/api.sqlite`, e sobrevive a reinícios. O `docker compose down -v` apaga esse volume.
- **Plugin.** O jar do plugin vem do PR #30 (`apps/plugin-paper`) e ainda não está embutido na imagem do Minecraft. Copie o `mc-platform-*.jar` para `data/plugins/`, inicie o servidor uma vez para gerar `data/plugins/McPlatform/config.yml` e troque `api-url` para `'http://api:8787'`.

```sh
cd infrastructure/docker
echo "MC_API_SECRET=$(openssl rand -hex 32)" >> .env      # uma vez; não mostre nem comite este arquivo
docker compose --profile api up -d --build
docker compose ps                                          # api deve ficar "healthy"
docker compose logs api                                    # "API ouvindo em http://0.0.0.0:8787"
```

**Não validado:** o `docker build` da imagem e o `compose up` com o perfil `api` (nenhum daemon Docker no ambiente onde isto foi escrito), o plugin carregado num Paper real e a entrada de jogadores com a fila ativa. O que foi verificado: `docker compose config` (com e sem o perfil), os testes de `tests/entrypoint.test.mjs`, e a existência da tag `node:26.13.1-alpine` no Docker Hub (amd64 e arm64).

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

## Painel admin e site

A API (perfil `api`) também serve a página inicial do projeto (`/`) e o painel do administrador (`/admin`). O painel mostra, ao vivo, quem entra e sai do mundo, chat, conquistas, mortes e alertas (lidos do `latest.log` do Paper, montado somente leitura) e o estado do computador (CPU, RAM, disco, carga, tempo ligado).

1. Gere o hash da senha (mínimo 12 caracteres; ela é digitada sem eco e nunca é gravada):
   `pnpm --filter @mc-platform/api hash-password`
2. Coloque o hash no seu `.env` (não no Git): `MC_ADMIN_PASSWORD_HASH=scrypt:...`. Sem ele o painel fica desligado.
3. `docker compose --profile api up -d --build` e abra `http://127.0.0.1:8787/admin`.

Segurança: a porta sai só em `127.0.0.1`; login com limite de tentativas (5 em 15 min por origem); cookie de sessão `HttpOnly` + `SameSite=Strict` (12 h); trocar a senha invalida as sessões; o painel só mostra texto (nada do log vira HTML). Não há HTTPS próprio: para acessar de fora use Tailscale ou um túnel e ligue `MC_ADMIN_SECURE_COOKIE=1` quando estiver atrás de HTTPS. O servidor Paper precisa ter rodado uma vez (a pasta `data/logs` existe) antes de subir a API.

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
