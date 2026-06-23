#!/bin/sh
# Detect a Markdown render width = ~70% of the local machine's screen width,
# expressed in terminal columns, for the `cat`->glow helper in paios.zsh.
#
# Prints a single integer (columns) to stdout. Used at install/bootstrap time to
# bake a stable PAIOS_MD_WIDTH into scripts/shell/paios.local.zsh, so the value
# does not depend on the size of whatever terminal you happen to open.
#
# Overrides (env):
#   PAIOS_MD_FRACTION   fraction of screen width to use      (default 0.70)
#   PAIOS_MD_CELL_PX    assumed monospace cell width, points (default 7.5)
#   PAIOS_MD_WIDTH      if already set, it is echoed verbatim (no detection)
#
# Detection of screen logical width (points), in order:
#   1. macOS system_profiler "UI Looks like: W x H"  (the effective resolution)
#   2. macOS osascript desktop bounds width
#   3. fall back to the current terminal columns via `tput cols`
# On total failure it prints a safe default of 100.

set -u

fraction=${PAIOS_MD_FRACTION:-0.70}
cell=${PAIOS_MD_CELL_PX:-7.5}

# Honor an explicit override without detecting anything.
if [ -n "${PAIOS_MD_WIDTH:-}" ]; then
    printf '%s\n' "$PAIOS_MD_WIDTH"
    exit 0
fi

screen_px=""
if command -v system_profiler >/dev/null 2>&1; then
    # First "UI Looks like: 2560 x 1440 ..." line is the primary effective width.
    screen_px=$(system_profiler SPDisplaysDataType 2>/dev/null \
        | awk -F'[: x]+' '/UI Looks like/ {print $5; exit}')
fi
if [ -z "$screen_px" ] && command -v osascript >/dev/null 2>&1; then
    # Desktop bounds: "x1, y1, x2, y2" — width is x2 (assumes origin at 0).
    screen_px=$(osascript -e 'tell application "Finder" to get bounds of window of desktop' 2>/dev/null \
        | awk -F'[, ]+' '{print $3}')
fi

if [ -n "$screen_px" ] && [ "$screen_px" -gt 0 ] 2>/dev/null; then
    # columns_full = screen_px / cell ; width = round(fraction * columns_full)
    width=$(awk -v px="$screen_px" -v cell="$cell" -v f="$fraction" \
        'BEGIN { printf "%d", (px / cell) * f + 0.5 }')
else
    cols=$(tput cols 2>/dev/null || echo 100)
    width=$(awk -v c="$cols" -v f="$fraction" 'BEGIN { printf "%d", c * f + 0.5 }')
fi

[ "$width" -ge 20 ] 2>/dev/null || width=100
printf '%s\n' "$width"
