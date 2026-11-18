# Docker no Minecraft Crossplay Server

Este diretório contém os scripts e configurações Docker que constroem e operam o **runtime Minecraft Paper** e os plugins GeyserMC/Floodgate, suportando clientes Java e Bedrock.

## Visão geral

- **Estrutura:** `docker-compose.yml` + `minecraft/Dockerfile` + scripts de configuração.
- **Persistência:** volumes locais (`./data/...`) em contêineres -> mantêm mundo, plugins e configs entre reinicializações.
- **Conformidade:** Restrições de segurança — não expor Docker socket, console administrativo ou controle à internet.
- **Rede:** Rede Docker bridge privada (`minecraft_net`). Apenas portas internas são expostas (`25565/tcp`, `19132/udp`) para locatários externos.

## Conteúdo

### `docker-compose.yml`

- Define a service **`papermc`** com:
  - Build a partir de `infrastructure/minecraft/Dockerfile` (Paper com GeyserMC + Floodgate pré-instalados).
  - Volumes para `world`, `plugins`, `config` e `logs`.
  - Portas mapeadas **Apenas para o host** — isto atende ao requisito de não expor portas administrativas à internet, enquanto permite a conexão local do cliente.

### `minecraft/`

- Scripts que:
  1. Baixam a versão-alvo do Paper.
  2. Instalam GeyserMC (proxy Bedrock) e Floodgate (plugin de autenticação) conforme as versões documentadas.
  3. Aceitam EULA (`eula.txt`) e permitem que `server.properties` seja sobrescrito pelo volume.
   - O entrypoint do container é `java -jar /server/paper.jar nogui` (executa o servidor Paper).

## Como usar (fase 1)

Dentro do workspace do projeto:

```bash
# Construir e iniciar o runtime
 cd infrastructure/docker
cd ../../
 docker compose up --build
```

Isso constrói a imagem, executa o contêiner e inicializa o servidor Minecraft. 

## Arquivo de backup `docker-compose.yml`

Toda vez que você modifica este arquivo:

1. Execute `docker compose up` para aplicar as mudanças.
2. Revise as entradas no logs para determinar se há necessidade de persistência entre reinicializações.
3. Testes automatizados (mais tarde: adicione em `tests/` para rotina de CI).

## Notas sobre a configuração

- O tipo de mapeamento de volume `(-)` (`./data/world:/server/world`) permanece intencionalmente não mapeado: pode ser convertido para `.:/server/world` se precisar de “projetar a pasta do repositório para dentro do container”. **Não** remova volumes de dados.
- Não há Redis, Kubernetes, proxy externo (ex: Nginx) — everything stays minimal e local-first.

## Acesso ao container para manutenção

Use o binário `docker-compose exec`:

```bash
docker compose -f docker-compose.yml exec papermc bash
```

## Espaço de trabalho seguro

- Não commitar tokens, senhas, chaves privadas ou arquivos `.env` reais — eles devem residir em variáveis de ambiente no host (ex: através de `.env.local` e da documentação do usuário do Docker Desktop).
- A EULA é aceita no momento da construção (com garantia de "aceito") conforme as licenças do Paper.
- Plugin repositories (GeyserMC, Floodgate) são públicos e verificados; não há secrets.

## Documentação relacionada

- `docs/ARCHITECTURE.md` – diagramas de componente.
- `docs/DEVELOPMENT_SETUP.md` – passos validados localmente.
- `infrastructure/minecraft/README.md` – scripts de build do runtime.
- `docs/ROADMAP.md` – status da fase 1.

Leia sempre AGENTS.md antes de modificar qualquer arquivo Dockerfile ou docker-compose.yml.
