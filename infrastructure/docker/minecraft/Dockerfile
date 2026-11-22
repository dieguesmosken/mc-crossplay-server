# Dockerfile para Paper + GeyserMC + Floodgate (Java + Bedrock)
# Combinação de versões validada contra as fontes oficiais em 2026-11-18:
#   - https://docs.papermc.io/paper/getting-started/  → Paper 26.1+ requer Java 25
#   - https://geysermc.org/wiki/geyser/supported-versions/ → Geyser-Spigot requer Paper 1.20.5+
#   - https://papermc.io/downloads/paper  → URLs em fill-data.papermc.io
#
# Arquitetura de volumes (evita ocultar arquivos da imagem):
#   - /server/paper.jar  → está na imagem, NUNCA é coberto por volume.
#   - /server/data       → ÚNICO volume persistente (bind mount de ./data) e diretório
#     de trabalho do Paper: world*, plugins/, config/, logs/, server.properties,
#     whitelist.json, ops.json, bukkit.yml, spigot.yml e eula.txt. A imagem não coloca
#     nada aqui; os plugins (Geyser/Floodgate) são baixados na primeira inicialização
#     pelo entrypoint.sh e persistem no volume.
#   - eula.txt           → criado pelo entrypoint com eula=false se não existir; a
#     aceitação NUNCA é automática (conformidade com a EULA).
FROM eclipse-temurin:25-jdk-alpine

LABEL maintainer="mc-crossplay-server"
LABEL description="Paper 26.3 + GeyserMC 2.12.1 + Floodgate 2.2.5 runtime (Fase 1)"

WORKDIR /server

# Instalar curl, wget e bash
RUN apk add --no-cache curl wget bash

# Diretório de dados (ponto de montagem do volume; preenchido em runtime pelo Paper/entrypoint)
RUN mkdir -p /server/data

# Baixar o jar do Paper 26.3 (build 255) a partir do repositório oficial
# fill-data.papermc.io. URL fixa e reproduzível; validada com HTTP 200 (55.296.784 bytes).
RUN curl -L -f -o /server/paper.jar \
    https://fill-data.papermc.io/v1/objects/a7116085a8ba88cf00771d5e61a2925007942092650811da7327dc23243f0cec/paper-26.3-255.jar

# Script de inicialização: baixa Geyser/Floodgate na primeira execução e inicia o Paper.
COPY entrypoint.sh /server/entrypoint.sh
RUN chmod +x /server/entrypoint.sh

# Comando de entrada. O diretório de dados é montado como volume no docker-compose.yml.
ENTRYPOINT ["/server/entrypoint.sh"]

EXPOSE 25565/tcp 19132/udp