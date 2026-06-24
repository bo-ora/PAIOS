# PAIOS machine prerequisites for macOS (Homebrew).
#
# This file is the declarative, reproducible inventory consumed by
# `brew bundle` (see scripts/bootstrap.sh). It installs only host-level tools
# that Homebrew owns well. Node.js is intentionally NOT listed here: it is
# managed per-project through nvm and `.nvmrc` so the pinned major version
# (24) is reproducible without conflicting with other projects.
#
# Authoritative inventory and rationale: docs/operations/development-environment.md
#
# Usage:
#   brew bundle --file=Brewfile            # required + Phase 1 tools below
#   scripts/bootstrap.sh                    # full machine bootstrap

# --- Required host tools -----------------------------------------------------
brew "git"        # source control; also used by `paios status`
brew "python"     # Python 3 for repository validation and Codex capture tooling

# --- Phase 1 (Local Knowledge Loop) audio toolchain --------------------------
# Required only once the audio capture/transcription slice is exercised.
brew "ffmpeg"        # canonical-WAV normalization
brew "whisper-cpp"   # provides the `whisper-cli` binary for local transcription

# --- Phase 2 (Telegram Daily Assistant) --------------------------------------
# Local answer-synthesis runtime. Required only once the Phase 2 ask/answer
# slice is exercised. The host binary is installed here; the specific small
# instruct model is pulled with `ollama pull` during Phase 2 setup (never
# implicitly) — the exact model is recorded in the Phase 2 architecture ADR.
# ffmpeg (above) also normalizes Telegram OGG/Opus voice notes.
brew "ollama"        # local LLM runtime for source-backed answer synthesis

# --- Optional / future phases ------------------------------------------------
# Docker becomes required with the first containerized service. Uncomment to
# provision it ahead of time. Docker Desktop is a large cask install.
# cask "docker"
