# Dockerfile para Paper + GeyserMC + Floodgate (Java + Bedrock)
# Combinação de versões validada contra as fontes oficiais em 2026-11-18:
#   - https://docs.papermc.io/paper/getting-started/  → Paper 26.1+ requer Java 25
#   - https://geysermc.org/wiki/geyser/supported-versions/ → Geyser-Spigot requer Paper 1.20.5+
#   - https://papermc.io/downloads/paper  → URLs em fill-data.papermc.io
#
# Arquitetura de volumes (evita ocultar arquivos da imagem):
#   - /server/paper.jar  → está na imagem, NUNCA é coberto por volume.
#   - /server/plugins    → bind-mount para ./data/plugins. A imagem NÃO coloca
#     nada aqui; os plugins (Geyser/Floodgate e plugins do usuário) são baixados
#     na primeira inicialização pelo entrypoint.sh e persistem no volume.
#   - /server/config     → bind-mount para ./data/config (server.properties etc.).
#   - /server/world, /server/logs → bind-mounts para persistência de dados.
#   - /server/eula.txt  → NÃO é montado. Paper cria/exibe em cada inicialização;
#     a aceitação é desativada por padrão (conformidade com a EULA).
FROM eclipse-temurin:25-jdk-alpine

LABEL maintainer="mc-crossplay-server"
LABEL description="Paper 26.3 + GeyserMC 2.12.1 + Floodgate 2.2.5 runtime (Fase 1)"

WORKDIR /server

# Instalar curl, wget e bash
RUN apk add --no-cache curl wget bash

# Criar pasta de plugins (vazia na imagem; preenchida em runtime pelo entrypoint)
RUN mkdir -p /server/plugins

# Baixar o jar do Paper 26.3 (build 255) a partir do repositório oficial
# fill-data.papermc.io. URL fixa e reproduzível; validada com HTTP 200 (55.296.784 bytes).
RUN curl -L -f -o /server/paper.jar \
    https://fill-data.papermc.io/v1/objects/a7116085a8ba88cf00771d5e61a2925007942092650811da7327dc23243f0cec/paper-26.3-255.jar

# Script de inicialização: baixa Geyser/Floodgate na primeira execução e inicia o Paper.
COPY entrypoint.sh /server/entrypoint.sh
RUN chmod +x /server/entrypoint.sh

# Comando de entrada. O mundo, plugins e configs são montados via volumes no docker-compose.yml.
ENTRYPOINT ["/server/entrypoint.sh"]

EXPOSE 25565/tcp 19132/udp