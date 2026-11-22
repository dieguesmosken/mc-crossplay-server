#!/bin/sh
# init-data.sh — prepara ./data antes do primeiro `docker compose up`.
#
# - Cria infrastructure/docker/data com o SEU usuário (se o Docker criasse o diretório,
#   ele pertenceria ao root).
# - Cria data/eula.txt com "eula=false" somente se ainda não existir. NÃO aceita a EULA:
#   quem decide é o usuário, após ler https://www.minecraft.net/eula.
# - É idempotente e nunca sobrescreve, move ou apaga arquivos existentes.

set -eu

DOCKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${MC_DATA_DIR:-${DOCKER_DIR}/data}"

mkdir -p "${DATA_DIR}"

if [ ! -f "${DATA_DIR}/eula.txt" ]; then
    echo "eula=false" > "${DATA_DIR}/eula.txt"
    echo "[init-data] Criado ${DATA_DIR}/eula.txt com eula=false."
else
    echo "[init-data] ${DATA_DIR}/eula.txt já existe; mantido sem alterações."
fi

# Layout antigo (volumes separados): avisa, mas não move nada automaticamente.
if [ -e "${DATA_DIR}/config/eula.txt" ]; then
    echo "[init-data] AVISO: encontrado o layout antigo (data/config/eula.txt)." >&2
    echo "[init-data] O servidor agora usa data/eula.txt. Se você já aceitou a EULA no" >&2
    echo "[init-data] arquivo antigo, revise-a e copie sua decisão manualmente." >&2
fi

echo "[init-data] Pronto. Próximo passo: docker compose -f infrastructure/docker/docker-compose.yml build"
