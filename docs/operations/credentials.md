# Credentials & Access Inventory

Status: Active
Last updated: 2026-06-23

This is the single authoritative, **value-free** list of every credential or
access PAIOS needs to operate. It records, for each secret: what it is, the
variable name, the expected format, where the real value is stored, and how to
obtain or rotate it. Real values are never written here.

## Where Secrets Live

- **Single store (current):** all real secret values go in `.local/secrets.env`,
  a `KEY=value` env file under the git-ignored `.local/` tree. One file, one
  place to look.
- **Committed template:** `.env.example` lists the variable names with safe
  placeholders. Create the store with:

  ```bash
  mkdir -p .local
  cp .env.example .local/secrets.env   # then edit in real values
  chmod 600 .local/secrets.env
  ```

- **Never committed:** `.local/` and `.env*` (except `.env.example`) are
  git-ignored. Do not place real secrets anywhere else in the repository.
- **Future:** a dedicated secrets manager may replace the flat file later. The
  variable names below are the stable contract and should not change when that
  happens.

## Inventory

| Credential | Variable | Format | Stored in | How to obtain / rotate |
| --- | --- | --- | --- | --- |
| Telegram bot token | `TELEGRAM_BOT_TOKEN` | `<digits>:<35-char base64-ish>` | `.local/secrets.env` | Create via [@BotFather](https://t.me/BotFather) `/newbot`; rotate with `/token`. Phase 2. |
| Telegram allowlist | `TELEGRAM_ALLOWED_CHAT_IDS` | comma-separated numeric chat/user IDs | `.local/secrets.env` | Get your numeric ID from [@userinfobot](https://t.me/userinfobot). Not strictly a secret, but it gates access, so it lives with the token. Phase 2. |

## Non-Secret Local Configuration

These are machine-specific but not secret; they belong in local config or
environment, not in this inventory's secret store unless convenient:

- `OLLAMA_HOST` — local Ollama endpoint (default `http://127.0.0.1:11434`).
- `PAIOS_SYNTHESIS_MODEL` — override for the Phase 2 local answer-synthesis
  model; default is recorded in the Phase 2 architecture ADR.
- `PAIOS_FFMPEG_PATH`, `PAIOS_WHISPER_CLI_PATH`, `PAIOS_WHISPER_MODEL_PATH` —
  Phase 1 audio toolchain paths (see development-environment.md). For Phase 3
  (Conversational Recall), point `PAIOS_WHISPER_MODEL_PATH` at the chosen voice
  tier: `ggml-large-v3-turbo-q5_0.bin`, selected from the 2026-06-24 live A/B on
  real Ukrainian voice notes (most accurate of five tiers on this CPU at
  ~2.9 s/note; see ADR-0008 and the session evidence). Language is auto-detected
  (no fixed `-l` flag; Ukrainian + English). Plain `large-v3` (non-turbo) stays
  unused (too slow on this CPU).

## Adding a New Credential

When a new access is introduced:

1. Add a row to the **Inventory** table above (name, variable, format, storage
   location, how to obtain/rotate).
2. Add the variable with a safe placeholder to `.env.example`.
3. Read the real value from `.local/secrets.env`; never hard-code it.

Host tools and binaries are tracked separately in `Brewfile` /
`scripts/bootstrap.sh` / `development-environment.md`, not here.
