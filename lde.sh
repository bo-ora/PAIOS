#!/bin/sh

set -u

failures=0
warnings=0

pass() {
    printf 'PASS  %s\n' "$1"
}

fail() {
    printf 'FAIL  %s\n' "$1"
    failures=$((failures + 1))
}

warn() {
    printf 'WARN  %s\n' "$1"
    warnings=$((warnings + 1))
}

has_command() {
    command -v "$1" >/dev/null 2>&1
}

major_version() {
    version=$1
    version=${version#v}
    version=${version#* }
    printf '%s\n' "${version%%.*}"
}

check_command() {
    name=$1
    label=$2
    if has_command "$name"; then
        pass "$label: $(command -v "$name")"
    else
        fail "$label is required but was not found on PATH"
    fi
}

printf 'PAIOS local development environment\n'
printf 'Platform: %s %s\n\n' "$(uname -s)" "$(uname -m)"

check_command git "Git"
check_command node "Node.js"
check_command npm "npm"
check_command python3 "Python 3"

if has_command node; then
    node_version=$(node --version 2>/dev/null || true)
    node_major=$(major_version "$node_version")
    if [ -n "$node_major" ] && [ "$node_major" -ge 24 ]; then
        pass "Node.js version: $node_version"
    else
        fail "Node.js 24+ is required; found ${node_version:-unknown}"
    fi
fi

if has_command python3; then
    python_version=$(python3 --version 2>&1 || true)
    if python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; then
        pass "Python version: $python_version"
    else
        fail "Python 3.9+ is required; found ${python_version:-unknown}"
    fi
fi

if has_command git; then
    git_name=$(git config --get user.name 2>/dev/null || true)
    git_email=$(git config --get user.email 2>/dev/null || true)
    if [ -n "$git_name" ]; then
        pass "Git user.name is configured"
    else
        fail "Git user.name is not configured"
    fi
    if [ -n "$git_email" ]; then
        pass "Git user.email is configured"
    else
        fail "Git user.email is not configured"
    fi
fi

printf '\nPhase-specific and optional tools\n'

if has_command docker; then
    pass "Docker CLI: $(docker --version 2>/dev/null || printf 'detected')"
    if docker info >/dev/null 2>&1; then
        pass "Docker engine is reachable"
    else
        warn "Docker CLI exists, but the engine is not reachable"
    fi
    if docker compose version >/dev/null 2>&1; then
        pass "Docker Compose v2 is available"
    else
        warn "Docker Compose v2 is not available"
    fi
elif [ -d /Applications/Docker.app ]; then
    warn "Docker Desktop is installed, but docker is not on PATH; start Desktop and open a new shell"
else
    warn "Docker is not installed; it becomes required with the first containerized service"
fi

if [ -d /Applications/Docker.app ]; then
    pass "Docker Desktop installation is detected; MCP Toolkit/Catalog remain optional integrations"
fi

if has_command ffmpeg; then
    pass "FFmpeg is available for the future audio slice"
else
    warn "FFmpeg is not installed; it is not required until audio normalization"
fi

if has_command whisper-cli; then
    pass "whisper-cli is available for the future transcription slice"
else
    warn "whisper-cli is not installed; it is not required until transcription"
fi

if has_command codex; then
    pass "Codex CLI is available for repository workflows"
else
    warn "Codex CLI is optional for runtime but required for measured AI sessions"
fi

printf '\nSummary: %s failure(s), %s warning(s)\n' "$failures" "$warnings"
printf 'Details: docs/operations/development-environment.md\n'

if [ "$failures" -ne 0 ]; then
    exit 1
fi
