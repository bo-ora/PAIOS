# How to Use PAIOS

This file lists only scenarios that are implemented and verified. Run commands
from the repository root.

## Prepare the CLI

Install the pinned development dependencies and build the ignored `dist/`
output:

```bash
./lde.sh
npm ci
npm run build
```

`./lde.sh` checks the local machine without installing or changing anything.

## Check Project Status

Use the human-readable view after returning to the project:

```bash
./paios status
```

Use JSON when another script or tool needs the same project state:

```bash
./paios status --json
```

Both status commands are read-only. They summarize Git state, repository
validation, roadmap position, technical debt, the latest session, and the next
recorded action.

## Capture a Note

Pipe note content through stdin. This is the preferred form for multiline or
private text because the content does not appear in the command arguments:

```bash
printf '%s\n' \
  "Remember to compare Telegram voice-message retry behavior." |
  ./paios knowledge add-note --title "Telegram follow-up"
```

The command returns a stable record identifier and managed source reference:

```text
Captured note 00000000-0000-0000-0000-000000000000
Source: sources/notes/00000000-0000-0000-0000-000000000000.txt
```

For short non-sensitive content, `--text` is also available:

```bash
./paios knowledge add-note \
  --title "Short reminder" \
  --text "Test the local knowledge workflow."
```

Byte-identical content is rejected as a duplicate and reports the existing
record identifier.

## Inspect a Captured Record

Pass the identifier returned by `add-note`:

```bash
./paios knowledge show RECORD_ID
```

The output includes source type, title, state, capture time, managed source
reference, checksum, byte length, source adapter, and normalized text.

## Import a Markdown or Text Document

Import a UTF-8 Markdown or plain-text file:

```bash
./paios knowledge add-file docs/requirements/INITIAL.md
```

The original bytes are copied into managed local storage. Search uses separately
normalized UTF-8 text, so line-ending and Unicode normalization do not alter the
durable source. Other file formats and invalid or empty UTF-8 documents are
rejected.

Byte-identical content already captured as a note or file is reported as a
duplicate.

## Search Captured Knowledge

Search is deterministic, case-insensitive for ordinary Latin text, and returns
matching source excerpts rather than a generated answer:

```bash
./paios knowledge search "Telegram capture"
```

Use quotes for an exact phrase:

```bash
./paios knowledge search '"local knowledge"'
```

Each result includes its order, record identifier, source type, managed source
reference, capture time, numeric rank, and highlighted excerpt.

## Index a Repository or Directory

Index UTF-8 Markdown and plain-text files in place:

```bash
./paios knowledge index docs
```

Files are traversed in stable path order. PAIOS does not copy or modify indexed
files; their original paths remain authoritative. The command reports indexed,
unchanged, updated, skipped, missing, and failed counts. Unsupported files and
symlinks are skipped, and symlinks are never followed.

Run the same command again after files change or move. Unchanged files retain
their records, changed files update in place, and deleted or invalid sources are
marked failed so stale text no longer appears in search. A partial indexing
failure prints all counts and exits nonzero.

## Process the Local Inbox

Place Markdown and text files under the inbox next to the configured knowledge
data root, then process them in stable relative-path order:

```bash
mkdir -p .local/paios/inbox
printf '%s\n' "Inbox knowledge" > .local/paios/inbox/example.md
./paios knowledge ingest-inbox
```

Successfully imported files move to `.local/paios/inbox-processed/` only after
their durable records exist. Duplicate files also move when the matching
durable record already exists, which makes a rerun recover an interrupted move.
Unsupported entries and failed inputs remain in the inbox. Audio inputs are
captured before processing; missing configuration or a transcription failure
retains both the original inbox input and its durable pending or failed record
for a later retry.

## Import Audio for Local Processing

Import and locally transcribe a WAV, MP3, or M4A source:

```bash
./paios knowledge add-audio PATH
```

The command validates the media signature rather than trusting the filename,
stores the unchanged source under the configured data root, and records
detected container and codec metadata. When the configured local audio
dependencies are ready, it normalizes with FFmpeg, transcribes with
`whisper-cli`, records immutable implementation/model attempt metadata, and
makes the transcript searchable.

If configuration is missing or invalid, the command exits nonzero after
retaining a durable `pending` record and points to `knowledge doctor`. A
transcription failure retains a durable `failed` record and bounded diagnostic;
retrying the same managed record does not create a second record.

## Configure and Diagnose Local Audio Tools

PAIOS resolves FFmpeg and `whisper-cli` from `PATH` by default. Override either
executable and select the required local GGML model with environment variables:

```bash
export PAIOS_FFMPEG_PATH="/opt/homebrew/bin/ffmpeg"
export PAIOS_WHISPER_CLI_PATH="$HOME/src/whisper.cpp/build/bin/whisper-cli"
export PAIOS_WHISPER_MODEL_PATH="$HOME/.local/share/whisper/ggml-base.bin"
./paios knowledge doctor
```

Relative configured paths resolve from the repository root. The diagnostic
checks that both executables start within five seconds, reports their bounded
version output, validates that the model is a readable non-empty regular file,
and reports its filename, byte length, and SHA-256 checksum. It never downloads
dependencies or prints configured absolute paths.

The command exits zero only when all three dependencies are ready. Missing or
invalid dependencies are all reported in one run with the relevant
configuration variable.

The FFmpeg and `whisper-cli` adapters accept the detected media descriptor and
configured local model, use bounded subprocess timeouts, and remove temporary
audio and transcript files after success or failure. `add-audio` and inbox
processing reuse the same durable orchestration.

## Run the Opt-In Real Audio Integration Harness

The normal `npm test` suite remains deterministic, offline, and independent of
installed audio tools. The separate real-tool harness is disabled unless
explicitly enabled. It requires:

- `PAIOS_RUN_AUDIO_INTEGRATION=1` to opt in;
- `PAIOS_AUDIO_INTEGRATION_FIXTURE_PATH` pointing to a readable local audio
  file containing speech;
- `PAIOS_WHISPER_MODEL_PATH` pointing to a readable local GGML model;
- optional `PAIOS_FFMPEG_PATH` and `PAIOS_WHISPER_CLI_PATH` overrides, otherwise
  the executables resolve from `PATH`;
- optional `PAIOS_AUDIO_INTEGRATION_LANGUAGE`, default `auto`, using `auto` or
  a two- or three-letter lowercase language code;
- optional `PAIOS_AUDIO_INTEGRATION_TIMEOUT_MS`, default `600000`, applied to
  each FFmpeg or transcription subprocess.

Example:

```bash
export PAIOS_RUN_AUDIO_INTEGRATION=1
export PAIOS_AUDIO_INTEGRATION_FIXTURE_PATH="$HOME/test-audio/spoken-sample.wav"
export PAIOS_FFMPEG_PATH="/opt/homebrew/bin/ffmpeg"
export PAIOS_WHISPER_CLI_PATH="$HOME/src/whisper.cpp/build/bin/whisper-cli"
export PAIOS_WHISPER_MODEL_PATH="$HOME/.local/share/whisper/ggml-base.bin"
export PAIOS_AUDIO_INTEGRATION_LANGUAGE="en"
npm run test:audio-integration
```

The harness first checks the existing redacted audio diagnostics. It uses real
FFmpeg to derive disposable WAV, MP3, M4A, and Telegram-compatible OGG/Opus
inputs from the supplied fixture, then sends each through durable import,
normalization, real `whisper-cli` transcription, processing-attempt metadata,
and lexical search. All generated media, transcripts, and runtime records stay
under a temporary directory and are removed at the end. The harness never
downloads a tool, model, or fixture.

Without the opt-in variable or required local paths, the harness reports a
clear skip. Invalid language or timeout values fail with a configuration error.
This harness does not run the separate `tiny`, `base`, and `small` benchmark.

## Run the Opt-In Fixed-Sample Audio Benchmark

The fixed-sample benchmark is separate from normal tests and the real-format
integration harness. It is disabled unless explicitly enabled:

```bash
PAIOS_RUN_AUDIO_BENCHMARK=1 npm run benchmark:audio
```

The benchmark requires local `ffmpeg`, `whisper-cli`, `/usr/bin/say`,
`/usr/bin/time`, and `curl`. It generates the approved non-sensitive English
fixture with the macOS Samantha voice, normalizes it once to canonical 16 kHz
mono signed 16-bit PCM WAV, and temporarily downloads the official whisper.cpp
multilingual `ggml-tiny.bin`, `ggml-base.bin`, and `ggml-small.bin` models from
a pinned repository revision. Each model's approved byte length and SHA-256
checksum are verified before `whisper-cli` processes it.

For each model it runs one unmeasured warm-up followed by three sequential
measured transcriptions with language `en` and identical arguments. The report
includes tool versions, model byte lengths and SHA-256 checksums, fixture
duration and reference sentence, each wall time, median wall time, real-time
factor, maximum measured peak resident memory, normalized transcript, and word
error rate.

Optional configuration:

- `PAIOS_AUDIO_BENCHMARK_TIMEOUT_MS` sets the positive per-subprocess timeout;
  the default is `600000`.
- `PAIOS_AUDIO_BENCHMARK_ROOT` changes the ignored temporary model root; the
  default is `.local/paios-benchmark`.

The configured benchmark root must be outside the repository or ignored by
Git, and it must not already exist. The harness uses shell-free subprocesses
and removes only its known downloaded models, generated audio, transcripts,
and runtime directories after success or failure. Keep only a non-sensitive
aggregate report. Running the benchmark does not change the documented
production default model.

## Rebuild the Search Index

Recreate the derived FTS5 index from durable SQLite records:

```bash
./paios knowledge rebuild
```

Rebuild does not rewrite managed source files or record identifiers.

## Back Up and Restore Local Knowledge

Create a portable backup package outside the active knowledge data root:

```bash
./paios knowledge backup "$HOME/backups/paios-knowledge-2026-06-23"
```

Use `--data-root` or `PAIOS_DATA_ROOT` when backing up a non-default data root.
The destination must not already exist. PAIOS builds the package in a private
sibling staging directory and publishes it atomically. The package contains a
consistent SQLite snapshot, every managed source file, and `manifest.json`
with each file's byte length and SHA-256 checksum. Transcripts and processing
metadata are included in the SQLite snapshot. Indexed external files are not
copied because their original paths remain authoritative.

Restore into an explicitly selected empty data root:

```bash
mkdir "$HOME/.local/share/paios-restored"
./paios knowledge restore \
  "$HOME/backups/paios-knowledge-2026-06-23" \
  --data-root "$HOME/.local/share/paios-restored"
```

Restore validates the manifest, rejects missing, extra, modified, or unsafe
package paths before copying files, opens the restored database, and rebuilds
the derived search index. It never merges into an existing data root. If
activation fails, the partially restored destination is removed.

After a restore, point `PAIOS_DATA_ROOT` at the restored directory and verify a
known record and query:

```bash
export PAIOS_DATA_ROOT="$HOME/.local/share/paios-restored"
./paios knowledge show RECORD_ID
./paios knowledge search '"known phrase"'
```

Keep backup packages on storage appropriate for personal data. Phase 1 does not
encrypt backups or manage retention. A checksum failure means the package is
damaged or modified; retain the empty destination, select another backup, and
run restore again. If only search behavior is incorrect while records remain
readable, run `./paios knowledge rebuild`.

## Use an Isolated Data Directory

Use `--data-root` to try knowledge commands without touching the default local
data:

```bash
data_root=$(mktemp -d)
output=$(printf '%s\n' "Disposable example" |
  ./paios knowledge add-note --data-root "$data_root")
record_id=$(printf '%s\n' "$output" | sed -n 's/^Captured note //p')
./paios knowledge show "$record_id" --data-root "$data_root"
rm -rf "$data_root"
```

For repeated commands, set `PAIOS_DATA_ROOT`:

```bash
export PAIOS_DATA_ROOT="$HOME/.local/share/paios/knowledge"
printf '%s\n' "Persistent local note" | ./paios knowledge add-note
```

Precedence is `--data-root`, then `PAIOS_DATA_ROOT`, then the default
`.local/paios/knowledge/`.

## Run Project Verification

Before committing implementation or documentation changes:

```bash
npm run lint
npm run typecheck
npm test
npm run test:audio-integration  # optional; requires the configuration above
npm run benchmark:audio         # optional; requires explicit opt-in
npm run build
python3 -m unittest discover -s tests -v
python3 scripts/validate_repository.py .
git diff --check
```

## Delivery Status

Phase 1 implementation and local acceptance are complete. The phase remains
`in-progress` until the current uncommitted change is explicitly authorized for
commit/push and GitHub Actions passes it.
