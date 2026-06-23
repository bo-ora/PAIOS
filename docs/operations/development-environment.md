# Development Environment

Status: Active  
Last verified: 2026-06-22

This is the authoritative inventory of machine-level tools needed to develop
and operate PAIOS. `./lde.sh` checks the inventory but deliberately does not
install packages or change machine configuration.

## Current Required Tools

| Tool | Minimum or expectation | Purpose | Reproducible project input |
| --- | --- | --- | --- |
| POSIX shell | `/bin/sh` | Run `lde.sh` and the `./paios` wrapper | `lde.sh`, `paios` |
| Git | Any maintained release | Source control and status collection | Repository history and configuration |
| Node.js | 24 or newer | TypeScript build and CLI runtime with `node:sqlite` | `package.json` engine |
| npm | Bundled with supported Node | Install pinned development dependencies | `package-lock.json` |
| Python | 3.9 or newer | Repository validation and Codex capture utilities | Standard-library scripts under `scripts/` |
| Git identity | `user.name` and `user.email` | Local commits | User-level Git configuration |

Provision a fresh macOS machine in one step:

```bash
scripts/bootstrap.sh
```

This installs the host tools declared in `Brewfile` (via Homebrew), installs the
pinned Node major from `.nvmrc` through nvm, runs `npm ci` and `npm run build`,
and finishes by running `./lde.sh`. It is idempotent; `scripts/bootstrap.sh
--check` verifies without installing.

On an already-provisioned machine, the manual equivalent is:

```bash
./lde.sh
npm ci
npm run build
```

`npm ci` is the reproducible project bootstrap after machine prerequisites
exist. `scripts/bootstrap.sh` installs those prerequisites; `./lde.sh` only
checks them and never mutates the machine.

## Installed but Not Available in the Current Shell

Docker Desktop was installed on 2026-06-22, but the `docker` command was not
found in the shell used for verification. On macOS:

1. Start Docker Desktop and wait until the engine is running.
2. Open a new terminal.
3. Run `./lde.sh` again.
4. If the CLI is still absent, ensure Docker Desktop's CLI tools are installed
   or `/Applications/Docker.app/Contents/Resources/bin` is on `PATH`.

Docker is not required for the currently implemented status and note-capture
commands, so this does not block Phase 1 text work.

Docker Desktop's MCP Toolkit and Catalog are optional integration surfaces.
Do not make them runtime dependencies until a concrete PAIOS workflow and
security boundary are approved.

## Phase-Specific Tools

| Tool | Needed when | Current state | Notes |
| --- | --- | --- | --- |
| Docker Engine and Compose v2 | First containerized service or `compose.yaml` | Planned; Desktop installed locally, CLI not detected | Validate with `docker info` and `docker compose version` |
| FFmpeg | Phase 1 audio normalization | Not installed | Converts WAV, MP3, M4A, and future Telegram OGG/Opus to canonical WAV |
| `whisper-cli` from `whisper.cpp` | Phase 1 local transcription | Not installed | Requires an explicitly selected local model |
| Whisper GGML model | Real transcription integration | Not installed | Never download implicitly during capture |
| Ollama | Phase 2 local answer synthesis | Installed locally (`brew "ollama"`) | Local LLM runtime; the specific small instruct model is pulled with `ollama pull` and recorded in the Phase 2 ADR |
| Phase 2 synthesis model (Ollama) | Phase 2 ask/answer slice | Not pulled | Never download implicitly; pull the model named in the Phase 2 ADR |
| Codex CLI | AI-assisted repository workflow | Installed locally; optional for runtime | Raw session events remain under ignored `.local/` |
| Docker MCP Toolkit/Catalog | Future connector experiments | Desktop capability installed locally | Not a PAIOS runtime dependency |

Phase-specific tools become required only when their implementation slice
starts. Record exact installation, versions, licensing, disk, and memory
implications before promoting them to current requirements.

Diagnose the Phase 1 audio toolchain without changing the machine:

```bash
./paios knowledge doctor
```

The executable defaults are `ffmpeg` and `whisper-cli` on `PATH`. Configure
explicit paths with `PAIOS_FFMPEG_PATH` and `PAIOS_WHISPER_CLI_PATH`. Configure
the required local GGML model with `PAIOS_WHISPER_MODEL_PATH`; no model is
selected or downloaded implicitly. Relative configured paths resolve from the
repository root. Diagnostics report versions and model checksum metadata while
redacting configured absolute paths.

## Configuration That Must Remain Local

- Git user name and email.
- Codex authentication and configuration.
- Docker Desktop preferences and credentials.
- Whisper models.
- Local `PAIOS_FFMPEG_PATH`, `PAIOS_WHISPER_CLI_PATH`, and
  `PAIOS_WHISPER_MODEL_PATH` values when machine-specific paths are needed.
- Secrets and populated `.env` files. All real secret values live in the single
  store `.local/secrets.env`; the committed template is `.env.example`. The
  authoritative, value-free inventory of every credential (name, format, where
  stored, how to obtain) is [credentials.md](credentials.md).
- Telegram bot token and chat allowlist (Phase 2) — in `.local/secrets.env`.
- Personal knowledge content under `.local/` or another configured data root.

Commit safe templates and version constraints, never credentials or personal
runtime data.

## Automation Path

Use this progression:

1. Keep `lde.sh` as the fast, read-only prerequisite and configuration check.
2. Pin project dependencies through lockfiles and container manifests.
3. Add `compose.yaml` when the first service actually needs containers.
4. `scripts/bootstrap.sh` + `Brewfile` + `.nvmrc` provide the installing
   bootstrap for macOS, keeping the tool inventory declarative and reproducible.
   See [ADR 0004](../architecture/decisions/0004-multi-harness-and-bootstrap.md).
5. Keep installation actions explicit and confined to `scripts/bootstrap.sh`;
   never make `lde.sh` silently mutate a developer machine.

The declarative `Brewfile` and `.nvmrc` can later be lifted into Ansible, Dev
Containers, Nix, or another reproducible environment definition without changing
the inventory.
