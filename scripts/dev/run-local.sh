#!/bin/sh
# run-local.sh — roda o servidor REAL (Paper + Geyser + Floodgate) sem Docker.
#
# Serve para validar o runtime em ambientes sem Docker (ex.: Termux no celular) ou para
# um teste rápido no Linux/WSL. Usa o mesmo entrypoint.sh da imagem Docker, com caminhos
# redirecionados por variáveis MC_*.
#
# Uso: sh scripts/dev/run-local.sh
#
# Variáveis opcionais:
#   MC_LOCAL_DIR   onde ficam o paper.jar e os dados. Padrão: ~/.mc-crossplay/local
#   MC_JAVA_HEAP   heap da JVM. Padrão: o sugerido pelo doctor.sh.
#   MC_JAVA_OPTS   flags extras da JVM.
#   MC_PAPER_URL   URL do paper.jar. Padrão: a mesma do Dockerfile (fonte única).
#
# A EULA NUNCA é aceita automaticamente: na primeira execução o servidor para e pede que
# você leia https://www.minecraft.net/eula e defina eula=true em <MC_LOCAL_DIR>/data/eula.txt.
# Para encerrar o servidor, digite "stop" no console.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKERFILE="${REPO_ROOT}/infrastructure/docker/minecraft/Dockerfile"
ENTRYPOINT="${REPO_ROOT}/infrastructure/docker/minecraft/entrypoint.sh"

LOCAL_DIR="${MC_LOCAL_DIR:-${HOME}/.mc-crossplay/local}"
PAPER_JAR="${LOCAL_DIR}/paper.jar"
DATA_DIR="${LOCAL_DIR}/data"

# 1. Diagnóstico do ambiente (aborta se faltar Java 25+ ou curl).
doctor_status=0
doctor_output="$(sh "${SCRIPT_DIR}/doctor.sh")" || doctor_status=$?
printf '%s\n\n' "${doctor_output}"
if [ "${doctor_status}" -ne 0 ]; then
    echo "[run-local] Corrija as pendências acima e tente novamente." >&2
    exit 1
fi

# 2. Heap: o definido pelo usuário ou o sugerido pelo doctor.
if [ -z "${MC_JAVA_HEAP:-}" ]; then
    MC_JAVA_HEAP="$(printf '%s\n' "${doctor_output}" | sed -n 's/^MC_JAVA_HEAP_SUGERIDO=//p')"
    MC_JAVA_HEAP="${MC_JAVA_HEAP:-1G}"
fi

# 3. Baixa o paper.jar se ainda não existir (mesma URL do Dockerfile).
mkdir -p "${LOCAL_DIR}"
if [ ! -f "${PAPER_JAR}" ]; then
    PAPER_URL="${MC_PAPER_URL:-$(grep -o 'https://fill-data[^[:space:]]*\.jar' "${DOCKERFILE}" | head -n 1)}"
    if [ -z "${PAPER_URL}" ]; then
        echo "[run-local] Não foi possível descobrir a URL do Paper no Dockerfile." >&2
        exit 1
    fi
    echo "[run-local] Baixando o Paper de ${PAPER_URL}"
    # Baixa para um arquivo temporário e só então move: evita deixar um JAR parcial.
    curl -L -f -o "${PAPER_JAR}.part" "${PAPER_URL}"
    mv "${PAPER_JAR}.part" "${PAPER_JAR}"
fi

# 4. No Termux, impede o Android de suspender o processo.
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock || true
fi

echo "[run-local] Dados em ${DATA_DIR} (heap ${MC_JAVA_HEAP})"
MC_SERVER_ROOT="${LOCAL_DIR}"
MC_DATA_DIR="${DATA_DIR}"
MC_PAPER_JAR="${PAPER_JAR}"
export MC_SERVER_ROOT MC_DATA_DIR MC_PAPER_JAR MC_JAVA_HEAP
exec sh "${ENTRYPOINT}"
