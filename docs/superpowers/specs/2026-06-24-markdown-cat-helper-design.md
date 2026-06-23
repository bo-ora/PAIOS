# Opt-in Markdown-rendering `cat` for PAIOS developers — Design

Status: Approved
Date: 2026-06-24

## Goal

Provide a clone-able, **opt-in** shell helper that renders Markdown files when a
human runs `cat <file>.md` in an interactive terminal, while staying completely
invisible to AI agents and scripts that capture command output.

## Motivation

Developers (on iTerm/zsh) want `cat README.md` to show styled, readable Markdown
instead of raw source. Overriding a POSIX core utility is risky if done
carelessly: AI agents (Codex, Claude Code) and shell scripts call `cat` and must
receive the **exact file bytes**, never reflowed/ANSI-styled output. The helper
must therefore be safe-by-construction and consistent with this project's
non-invasive bootstrap conventions (bootstrap installs tools but never mutates a
developer's global dotfiles or secrets).

## Design

### 1. `scripts/shell/paios.zsh` (new, versioned)

Defines a `cat` shell function that falls through to the real `cat`
(`command cat`) unless **all** of these hold:

- the shell is interactive (`[[ -o interactive ]]`),
- stdout is a TTY (`[[ -t 1 ]]`),
- `glow` is on `PATH`,
- there is at least one argument and **every** argument is a `*.md`/`*.markdown`
  file with no leading-`-` flags.

When all hold: `glow -p "$@"` (paged, styled). Otherwise: `command cat "$@"`.

The `[[ -t 1 ]]` guard is the core safety mechanism. Agents and scripts capture
output through a pipe or file, so stdout is not a TTY and they always get raw
bytes. The function syntax is bash-compatible, so the file also works if sourced
from bash.

Sourcing the file repeatedly is idempotent (redefining the function is safe).

### 2. `Brewfile`

Add `brew "glow"` under a clearly-commented "developer shell helpers (optional)"
section. It is only needed when a developer opts into the helper, so it is
documented as optional rather than required.

### 3. `scripts/bootstrap.sh`

Add a non-mutating reminder step (mirroring the existing ollama/secrets
reminders) that prints the exact one-line `source` snippet pointing at
`scripts/shell/paios.zsh`. It does **not** edit `~/.zshrc`.

### 4. `docs/operations/development-environment.md`

Document the optional helper: what it does, its agent-safe guard semantics, and
the exact opt-in `source` line. Add `glow` to the phase/optional tooling notes.

### 5. Local developer setup (this machine)

Add the single `source .../scripts/shell/paios.zsh` line to the developer's
`~/.zshrc`, and `brew install glow` if missing.

## Out of scope (YAGNI)

- No `~/.zshrc` auto-editing from any committed script.
- No inline-image rendering (would require `mdcat`); `glow` chosen for
  portability and styling.
- No dedicated bash variant file; the zsh file is bash-compatible.

## Testing

The deterministic behavior under test is the guard logic:

- `cat file.md` in an interactive TTY renders via `glow`.
- `cat file.md | head` (piped, no TTY) returns raw Markdown bytes.
- `cat file.txt` falls through to real `cat`.
- `cat -n file.md` (flag present) falls through to real `cat`.
- `cat a.md b.txt` (mixed) falls through to real `cat`.
- Sourcing the file twice is idempotent.

Because TTY-dependent behavior can't be observed from a captured (piped) shell,
the non-TTY fall-through paths are verified deterministically, and the
interactive render path is confirmed with one live local smoke test in iTerm
per AGENTS.md guidance for runtime-dependent slices.
