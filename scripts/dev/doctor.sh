#!/bin/sh
# doctor.sh — diagnostica o ambiente de desenvolvimento (Linux, WSL2 ou Termux).
#
# Uso: sh scripts/dev/doctor.sh
#
# - Detecta a plataforma e confere o que é necessário para rodar o servidor sem Docker
#   (Java >= 25 e curl). Docker é informativo: o Termux (sem root) não roda Docker.
# - Imprime MC_JAVA_HEAP_SUGERIDO=<n>M com base na memória disponível.
# - Sai com código 1 somente se algo IMPEDE rodar o servidor localmente.
# - POSIX sh puro (dash/ash/bash). Não altera nada no sistema.

set -u

REQUIRED_JAVA=25
blocking=0

ok() { printf '  [ok]     %s\n' "$*"; }
info() { printf '  [info]   %s\n' "$*"; }
warn() { printf '  [aviso]  %s\n' "$*"; }
fail() {
    printf '  [FALHA]  %s\n' "$*"
    blocking=1
}

is_termux() {
    [ -n "${TERMUX_VERSION:-}" ] && return 0
    case "${PREFIX:-}" in
        *com.termux*) return 0 ;;
    esac
    return 1
}

is_wsl() {
    [ -n "${WSL_DISTRO_NAME:-}" ] && return 0
    grep -qi microsoft /proc/version 2>/dev/null
}

if is_termux; then
    platform=termux
elif is_wsl; then
    platform=wsl
else
    platform=linux
fi

printf 'Plataforma: %s\n\n' "${platform}"

# --- Java ---------------------------------------------------------------------------------
if command -v java >/dev/null 2>&1; then
    # Procura a linha 'version "NN..."' (a 1ª linha pode ser "Picked up JAVA_TOOL_OPTIONS...").
    java_major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)"
    if [ -n "${java_major}" ] && [ "${java_major}" -ge "${REQUIRED_JAVA}" ] 2>/dev/null; then
        ok "Java ${java_major} (o Paper 26.1+ exige ${REQUIRED_JAVA}+)"
    else
        fail "Java ${java_major:-desconhecido} encontrado, mas o Paper 26.1+ exige ${REQUIRED_JAVA}+"
    fi
else
    fail "Java não encontrado (necessário ${REQUIRED_JAVA}+)"
fi

# --- curl (baixa Paper, Geyser e Floodgate) ------------------------------------------------
if command -v curl >/dev/null 2>&1; then
    ok "curl disponível"
else
    fail "curl não encontrado"
fi

# --- Node (apenas para os testes automatizados) ---------------------------------------------
if command -v node >/dev/null 2>&1; then
    ok "Node $(node --version) (testes: node --test)"
else
    warn "Node não encontrado: os testes automatizados não vão rodar"
fi

# --- Docker -----------------------------------------------------------------------------------
case "${platform}" in
    termux)
        info "Docker não é suportado no Termux (sem root); use scripts/dev/run-local.sh"
        ;;
    *)
        if command -v docker >/dev/null 2>&1; then
            if docker info >/dev/null 2>&1; then
                ok "Docker com daemon acessível"
            else
                warn "Docker instalado, mas o daemon não responde (está iniciado? seu usuário está no grupo docker?)"
            fi
        else
            info "Docker não encontrado (só é necessário para testar o compose/imagem)"
        fi
        ;;
esac

# --- Específico do WSL -------------------------------------------------------------------------
if [ "${platform}" = "wsl" ]; then
    case "$(pwd)" in
        /mnt/[a-zA-Z]/*)
            warn "O repositório está em $(pwd) (disco do Windows): I/O lento e sem permissões Linux. Clone em ~/projects."
            ;;
        *)
            ok "Repositório no filesystem Linux do WSL"
            ;;
    esac
fi

# --- Memória e heap sugerido ----------------------------------------------------------------------
avail_kb="$(sed -n 's/^MemAvailable:[[:space:]]*\([0-9]*\) kB.*/\1/p' /proc/meminfo 2>/dev/null)"
if [ -n "${avail_kb}" ]; then
    avail_mb=$((avail_kb / 1024))
    heap_mb=$((avail_mb * 60 / 100))
    if [ "${heap_mb}" -lt 512 ]; then
        heap_mb=512
        warn "Pouca memória disponível (${avail_mb} MB): o servidor pode não caber"
    elif [ "${heap_mb}" -gt 2048 ]; then
        heap_mb=2048
    fi
    ok "Memória disponível: ${avail_mb} MB"
    printf '\nMC_JAVA_HEAP_SUGERIDO=%sM\n' "${heap_mb}"
else
    info "Não foi possível ler /proc/meminfo; defina MC_JAVA_HEAP manualmente (ex.: 1G)"
fi

if [ "${blocking}" -ne 0 ]; then
    printf '\nResultado: há pendências que impedem rodar o servidor localmente.\n'
    exit 1
fi
printf '\nResultado: ambiente pronto para rodar o servidor localmente.\n'
