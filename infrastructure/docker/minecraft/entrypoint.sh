#!/bin/sh
# entrypoint.sh — runtime Minecraft (Paper + GeyserMC + Floodgate)
#
# Responsabilidades:
#   1. Garantir que os plugins Geyser/Floodgate existam em /server/plugins.
#      Como /server/plugins é um bind-mount para o volume persistente, os JARs
#      baixados aqui sobrevivem entre reinicializações.
#   2. Validar a EULA: NÃO aceita automaticamente. O Paper exige eula.txt com
#      "eula=true" para iniciar. Se o arquivo não existir ou estiver com
#      "eula=false", o Paper exibe a EULA e sai. O usuário (ou o controller)
#      deve criar eula.txt com "eula=true" APÓS ler e concordar com a EULA.
#   3. Inicializar o servidor Paper.

set -e

PLUGINS_DIR="/server/plugins"
GEYSER_URL="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
FLOODGATE_URL="https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot"

# Baixa Geyser/Floodgate apenas se ainda não estiverem presentes no volume.
if [ ! -f "${PLUGINS_DIR}/geyser.jar" ]; then
    echo "[entrypoint] Baixando GeyserMC (spigot) para ${PLUGINS_DIR}/geyser.jar"
    curl -L -f -o "${PLUGINS_DIR}/geyser.jar" "${GEYSER_URL}"
fi

if [ ! -f "${PLUGINS_DIR}/floodgate.jar" ]; then
    echo "[entrypoint] Baixando Floodgate para ${PLUGINS_DIR}/floodgate.jar"
    curl -L -f -o "${PLUGINS_DIR}/floodgate.jar" "${FLOODGATE_URL}"
fi

# Verifica a EULA. Se não houver eula.txt ou estiver com eula=false, para aqui.
# Aceitação automática desativada por conformidade com a Minecraft EULA.
if [ ! -f /server/eula.txt ] || ! grep -q "^eula=true$" /server/eula.txt 2>/dev/null; then
    echo ""
    echo "=============================================="
    echo " EULA não aceita. O servidor não pode iniciar."
    echo "=============================================="
    echo "Para aceitar a Minecraft EULA (após ler em https://www.microsoft.com/en-us/licensing/faq/minecraft),"
    echo "execute o seguinte no container (ou configure via controller/API):"
    echo ""
    echo "  echo 'eula=true' > /server/eula.txt"
    echo ""
    echo "Depois reinicie o container."
    echo "=============================================="
    exit 1
fi

echo "[entrypoint] EULA aceita. Iniciando Paper 26.3 com GeyserMC + Floodgate..."
exec java -Xmx2G -jar /server/paper.jar nogui