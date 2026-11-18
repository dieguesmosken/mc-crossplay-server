# Dockerfile para Paper + GeyserMC + Floodgate (Java + Bedrock)
FROM eclipse-temurin:21-jdk-alpine

LABEL maintainer="mc-crossplay-server"
LABEL description="Paper + GeyserMC + Floodgate runtime (Fase 1)"

WORKDIR /server

# Instalar curl, wget e bash
RUN apk add --no-cache curl wget bash

# Criar pastas e EULA
RUN mkdir -p /server/plugins
RUN echo "eula=true" > /server/eula.txt

# Baixar o jar do Paper 1.20.1 diretamente de um armazenamento confiável (GitHub Releases)
RUN curl -L -f -o /server/paper.jar https://github.com/PaperMC/Paper/releases/download/paper-1.20.1-242/paper-1.20.1-242.jar

# Baixar GeyserMC e Floodgate de fontes diretas oficiais da GeyserMC (v2 API)
RUN curl -L -f -o /server/plugins/geyser.jar https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot && \
    curl -L -f -o /server/plugins/floodgate.jar https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot

# Comando para iniciar o servidor
ENTRYPOINT ["java", "-Xmx2G", "-jar", "/server/paper.jar", "nogui"]

EXPOSE 25565/tcp 19132/udp