#!/bin/sh
# entrypoint.sh — runtime Minecraft (Paper + GeyserMC + Floodgate)
#
# Layout dentro do container:
#   /server/paper.jar  → JAR do Paper (vem da imagem, nunca é coberto por volume).
#   /server/data       → ÚNICO volume persistente (bind mount de ./data) e diretório
#                        de trabalho do servidor. Tudo que o Paper gera fica aqui:
#                        world*, plugins/, config/, logs/, server.properties,
#                        whitelist.json, ops.json, bukkit.yml, spigot.yml, eula.txt...
#
# Responsabilidades:
#   1. Garantir que os plugins Geyser/Floodgate existam em <data>/plugins.
#   2. Validar a EULA: NÃO aceita automaticamente. Se eula.txt não existir, é criado
#      com "eula=false". O servidor só inicia com "eula=true", que o usuário (ou o
#      controller) define APÓS ler e concordar com a EULA.
#   3. Iniciar o Paper com o heap configurado por MC_JAVA_HEAP.
#
# Variáveis de ambiente (todas opcionais):
#   MC_JAVA_HEAP  tamanho do heap (-Xms/-Xmx). Padrão: 2G.
#                 Mantenha-o abaixo do limite de memória do container (MC_MEMORY_LIMIT
#                 no compose): metaspace, threads e memória off-heap ficam fora do heap.
#   MC_JAVA_OPTS  flags extras da JVM (separadas por espaço). Padrão: vazio.
#   MC_SERVER_ROOT, MC_DATA_DIR, MC_PAPER_JAR  caminhos (úteis para testes).

set -e

SERVER_ROOT="${MC_SERVER_ROOT:-/server}"
DATA_DIR="${MC_DATA_DIR:-${SERVER_ROOT}/data}"
PAPER_JAR="${MC_PAPER_JAR:-${SERVER_ROOT}/paper.jar}"
JAVA_HEAP="${MC_JAVA_HEAP:-2G}"
JAVA_OPTS="${MC_JAVA_OPTS:-}"

PLUGINS_DIR="${DATA_DIR}/plugins"
EULA_FILE="${DATA_DIR}/eula.txt"
GEYSER_URL="https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot"
FLOODGATE_URL="https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot"

mkdir -p "${PLUGINS_DIR}"
cd "${DATA_DIR}"

# Baixa Geyser/Floodgate apenas se ainda não estiverem presentes no volume.
if [ ! -f "${PLUGINS_DIR}/geyser.jar" ]; then
    echo "[entrypoint] Baixando GeyserMC (spigot) para ${PLUGINS_DIR}/geyser.jar"
    curl -L -f -o "${PLUGINS_DIR}/geyser.jar" "${GEYSER_URL}"
fi

if [ ! -f "${PLUGINS_DIR}/floodgate.jar" ]; then
    echo "[entrypoint] Baixando Floodgate para ${PLUGINS_DIR}/floodgate.jar"
    curl -L -f -o "${PLUGINS_DIR}/floodgate.jar" "${FLOODGATE_URL}"
fi

# Cria eula.txt com eula=false se ainda não existir. NUNCA sobrescreve um arquivo existente.
if [ ! -f "${EULA_FILE}" ]; then
    echo "eula=false" > "${EULA_FILE}"
fi

# Verifica a EULA. Aceitação automática desativada por conformidade com a Minecraft EULA.
# O 'tr -d' remove CR para tolerar arquivos editados no Windows (CRLF).
if ! tr -d '\r' < "${EULA_FILE}" | grep -qx "eula=true"; then
    echo ""
    echo "=============================================="
    echo " EULA não aceita. O servidor não pode iniciar."
    echo "=============================================="
    echo "Leia a Minecraft EULA em https://www.minecraft.net/eula e, se concordar,"
    echo "defina eula=true no arquivo data/eula.txt (no host):"
    echo ""
    echo "  echo 'eula=true' > infrastructure/docker/data/eula.txt"
    echo ""
    echo "Depois inicie o container novamente."
    echo "=============================================="
    exit 1
fi

echo "[entrypoint] EULA aceita. Iniciando Paper (heap ${JAVA_HEAP}) com GeyserMC + Floodgate..."
# JAVA_OPTS é intencionalmente sem aspas: pode conter várias flags separadas por espaço.
# shellcheck disable=SC2086
exec java -Xms"${JAVA_HEAP}" -Xmx"${JAVA_HEAP}" ${JAVA_OPTS} -jar "${PAPER_JAR}" nogui
