#!/bin/sh
# doctor.sh — diagnostica o ambiente de desenvolvimento (Linux, WSL2 ou Termux).
#
# Uso: sh scripts/dev/doctor.sh
#
# O comportamento é ADAPTADO a cada ambiente, respeitando as limitações de cada um (ex.: o
# Termux não tem Docker nem tanta RAM; o WSL2 em modo NAT não é visível na LAN). As dicas
# impressas mudam conforme a plataforma detectada.
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
    case "${platform}" in
        termux) info "Termux: tente 'pkg install openjdk-25' (confira com 'pkg search openjdk'); sem ele, use Ubuntu via proot-distro" ;;
        *) info "Instale com: sudo apt install openjdk-25-jre-headless (Ubuntu 24.04+ / Pop!_OS)" ;;
    esac
fi

# --- curl (baixa Paper, Geyser e Floodgate) ------------------------------------------------
if command -v curl >/dev/null 2>&1; then
    if curl --version >/dev/null 2>&1; then
        ok "curl disponível"
    else
        fail "curl está instalado, mas não executa (biblioteca incompatível)"
        case "${platform}" in
            termux) info "Termux: pacotes desatualizados em partes. Rode 'pkg update && pkg upgrade' e, se persistir, 'pkg install --reinstall openssl libcurl curl git' (ou troque o espelho com termux-change-repo)" ;;
            *) info "Reinstale o curl pelo gerenciador de pacotes da distribuição" ;;
        esac
    fi
else
    fail "curl não encontrado"
fi

# --- Node (apenas para os testes automatizados) ---------------------------------------------
if command -v node >/dev/null 2>&1; then
    ok "Node $(node --version) (testes: node --test)"
    if [ "${platform}" = "termux" ]; then
        info "Termux: a versão do Node pode ser anterior à fixada em .nvmrc; use 'node --test' em vez de 'pnpm test' (o pnpm exige o engine fixado)"
    fi
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
                if command -v ufw >/dev/null 2>&1; then
                    info "ufw presente: portas publicadas pelo Docker ignoram as regras do ufw. O compose publica só em 127.0.0.1; para expor na LAN, filtre pela cadeia DOCKER-USER (ex.: ufw-docker) e não confie em 'ufw allow'"
                fi
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
    info "WSL2: no modo NAT padrão, outros aparelhos da LAN (ex.: Bedrock no celular) não alcançam o servidor. Para isso use networkingMode=mirrored no .wslconfig (Windows 11 22H2+) e libere a entrada no firewall do Hyper-V; veja docs/DEVELOPMENT_SETUP.md"
fi

# --- Memória e heap sugerido ----------------------------------------------------------------------
avail_kb="$(sed -n 's/^MemAvailable:[[:space:]]*\([0-9]*\) kB.*/\1/p' /proc/meminfo 2>/dev/null)"
if [ -n "${avail_kb}" ]; then
    avail_mb=$((avail_kb / 1024))
    heap_mb=$((avail_mb * 60 / 100))
    heap_cap=2048
    if [ "${platform}" = "termux" ]; then
        # Celular: RAM compartilhada com o Android, calor e bateria. Teto menor.
        heap_cap=1024
    fi
    if [ "${heap_mb}" -lt 512 ]; then
        heap_mb=512
        warn "Pouca memória disponível (${avail_mb} MB): o servidor pode não caber"
    elif [ "${heap_mb}" -gt "${heap_cap}" ]; then
        heap_mb="${heap_cap}"
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
