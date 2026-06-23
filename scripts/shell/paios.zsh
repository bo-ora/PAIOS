#!/usr/bin/env zsh
# PAIOS developer shell helpers (optional, opt-in).
#
# Source this from your interactive shell to enable PAIOS dev conveniences:
#
#   source /path/to/PAIOS/scripts/shell/paios.zsh
#
# It is safe to source repeatedly (idempotent) and safe to source from bash:
# the syntax below is POSIX-compatible.
#
# Authoritative inventory and rationale:
#   docs/operations/development-environment.md
#
# --- Machine-specific overrides ----------------------------------------------
# Optional sibling file (git-ignored) written at install/bootstrap time, e.g.
# `export PAIOS_MD_WIDTH=239` baked to ~70% of this machine's screen width by
# scripts/shell/detect-md-width.sh. Sourcing it here means a new shell does not
# re-run screen detection on every startup.
_paios_self="${BASH_SOURCE:-$0}"
_paios_local="$(dirname -- "$_paios_self")/paios.local.zsh"
[ -r "$_paios_local" ] && . "$_paios_local"
unset _paios_self _paios_local

# --- Markdown-rendering `cat` ------------------------------------------------
# Renders Markdown files with `glow` when a human runs `cat <file>.md` in an
# interactive terminal, and otherwise behaves exactly like the real `cat`.
#
# SAFETY: this override is invisible to AI agents (Codex, Claude Code) and to
# scripts. It only renders when ALL of the following hold:
#   * the shell is interactive,
#   * stdout is a TTY (`-t 1`) — agents/scripts capture output through a pipe
#     or file, so stdout is NOT a TTY and they always get raw file bytes,
#   * `glow` is installed,
#   * there is >=1 argument and EVERY argument is a .md/.markdown file with no
#     leading-`-` flags.
# In every other case it falls through to `command cat`, byte-for-byte.
cat() {
    if [[ -o interactive ]] && [[ -t 1 ]] && command -v glow >/dev/null 2>&1 && [[ $# -gt 0 ]]; then
        local arg
        for arg in "$@"; do
            case "$arg" in
                -*) command cat "$@"; return ;;
                *.md|*.markdown) ;;
                *) command cat "$@"; return ;;
            esac
        done
        # Width: a baked ~70%-of-screen value (PAIOS_MD_WIDTH, set at install in
        # paios.local.zsh) when available, else 70% of the live terminal. Always
        # clamp DOWN to the current window so a wide baked value never overflows
        # and re-wraps in a smaller terminal. No pager: print the whole document.
        local cols width
        cols=$(tput cols 2>/dev/null || echo 100)
        if [[ -n "${PAIOS_MD_WIDTH:-}" ]]; then
            width=$PAIOS_MD_WIDTH
        else
            width=$(( cols * 70 / 100 ))
        fi
        (( width > cols - 2 )) && width=$(( cols - 2 ))
        (( width < 20 )) && width=$cols
        glow -w "$width" "$@"
        return
    fi
    command cat "$@"
}
