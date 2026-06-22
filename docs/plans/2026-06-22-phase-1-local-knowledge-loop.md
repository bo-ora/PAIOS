# Phase 1 Local Knowledge Loop Implementation Plan

Status: Approved
Date: 2026-06-22

## Goal

Implement the approved offline capture-to-retrieval loop for notes, Markdown,
text, repository documents, inbox files, and local audio transcription.

## Authoritative Inputs

- `docs/requirements/phase-1-local-knowledge-loop.md`
- `docs/architecture/decisions/0002-phase-1-storage-search.md`
- `docs/architecture/decisions/0003-phase-1-local-transcription.md`
- `docs/research/2026-06-22-phase-1-storage-transcription.md`

## Constraints

- Node.js 24 LTS minimum.
- No network requests, telemetry, cloud transcription, or implicit downloads.
- Runtime personal data remains under an ignored configurable local root.
- Managed sources are durable; metadata indexes are recoverable and FTS is
  rebuildable.
- Implementation remains behind storage, search, normalization, and
  transcription interfaces.
- Each slice must leave the CLI buildable and tested.

## Progress

- 2026-06-22: Runtime/CLI foundation and the first durable storage vertical
  slice completed. Node.js 24, provider-neutral provenance types, configurable
  data roots, SQLite/FTS5 capability checks and schema, atomic note source
  storage, `add-note`, `show`, duplicate detection, and failed-write resume are
  implemented and verified.
- 2026-06-22: Managed UTF-8 Markdown/plain-text import, deterministic FTS5
  search, phrase queries, excerpts, source references, update triggers, and
  derived-index rebuild completed.
- 2026-06-22: Stable-order repository/directory indexing, idempotent updates,
  symlink skipping, deterministic counts, source timestamps, and stale-source
  suppression for deleted, unreadable, or invalid files completed.
- 2026-06-22: Deterministic recursive inbox discovery, document import reuse,
  post-commit moves, duplicate move recovery, retained failures, and
  per-input/count reporting completed.
- 2026-06-22: Provider-neutral audio descriptors, content-signature detection
  for WAV, MP3, M4A, and OGG/Opus contracts, durable original-audio storage,
  detected container/codec metadata, schema migration, and pending
  `knowledge add-audio` records completed.
- 2026-06-22: Explicit FFmpeg, `whisper-cli`, and local GGML model
  configuration; PATH fallback for executables; bounded version checks; model
  validation and checksum metadata; redacted `knowledge doctor` diagnostics;
  and missing/invalid dependency tests completed.
- 2026-06-22: Provider-neutral, timeout-bound FFmpeg normalization completed
  behind a deterministic process seam. The adapter writes private temporary
  input, requests canonical 16 kHz mono signed 16-bit PCM WAV, validates the
  result, redacts diagnostics, supports the OGG/Opus contract, and removes
  temporary state on every exit path.
- 2026-06-22: Timeout-bound `whisper-cli` transcription completed behind a
  deterministic process seam using explicit model, language, text-output, and
  no-timestamp arguments. The adapter validates and hashes the local model,
  normalizes UTF-8 transcript output, bounds and redacts failure diagnostics,
  and removes temporary output on every exit path. Schema version 4 adds
  immutable, versioned processing-attempt metadata linked to audio records.
- 2026-06-22: Pending-audio orchestration completed. It reloads the durable
  managed source, validates its stored media descriptor, normalizes and
  transcribes through the existing adapters, and atomically commits the
  transcript, FTS-visible ready state, and immutable attempt metadata. Failed
  attempts preserve bounded diagnostics and retry under the same record
  identity; ready records are idempotent no-ops.
- 2026-06-22: `knowledge add-audio` now resolves redacted structured executable
  version metadata, invokes local normalization and transcription when all
  dependencies are ready, reports the resulting state, and retains a durable
  pending record with actionable diagnostics when configuration is incomplete.
- 2026-06-22: Inbox audio now uses the same durable capture and processing
  service, retains inputs and record identifiers across missing configuration
  or transcription failure, retries failed records in place, and moves inputs
  only after the transcript is durably ready and searchable.
- 2026-06-23: Added an explicitly opt-in real-tool integration harness that
  derives disposable WAV, MP3, M4A, and Telegram-compatible OGG/Opus inputs
  with real FFmpeg, sends each through durable import, normalization,
  `whisper-cli`, attempt metadata, and search, and skips clearly when local
  configuration is absent. Offline tests cover opt-in/configuration behavior
  and the exact format plan; the normal suite remains tool-independent.
- 2026-06-23: Real dependency readiness was checked without installing or
  downloading anything. `knowledge doctor` reported FFmpeg and `whisper-cli`
  missing from `PATH` and no configured GGML model. Homebrew reported both
  `ffmpeg` and `whisper-cpp` uninstalled; targeted local searches found no
  executable, GGML model, or suitable speech fixture. The disabled and
  enabled-but-unconfigured harness invocations each completed with one explicit
  skip, so no real format/transcription case ran and no executable version,
  model checksum, fixture result, or benchmark evidence exists yet.
- 2026-06-23: With explicit approval, installed local FFmpeg 8.1.2 and
  whisper.cpp 1.9.1, temporarily downloaded multilingual `ggml-base.bin`
  (147951465 bytes, SHA-256
  `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`),
  and generated an 8.104-second non-sensitive synthetic English fixture with
  the macOS Samantha voice. `knowledge doctor` reported all dependencies ready.
  The real harness passed durable import, normalization, transcription,
  attempt metadata, and lexical search for WAV (2702 ms), MP3 (2816 ms), M4A
  (2821 ms), and Telegram-compatible OGG/Opus (2867 ms), with 14.06 seconds
  total wall time. The temporary fixture, model, generated media, transcripts,
  and runtime records were removed after verification.
- Next approved-boundary proposal: add a separate opt-in fixed-sample benchmark
  for multilingual `ggml-tiny.bin`, `ggml-base.bin`, and `ggml-small.bin`
  without changing production defaults. Generate the same non-sensitive
  English fixture locally, normalize it once to canonical 16 kHz mono PCM WAV,
  run one warm-up plus three measured sequential transcriptions per model with
  the same executable, language, arguments, and machine state, and record tool
  versions, model filenames/byte lengths/checksums, transcript text, word error
  rate against the known sentence, wall time, real-time factor, and peak
  resident memory. Keep the normal suite offline, remove all models and
  generated/runtime data after the run, and document a recommendation without
  changing ADR-0003's `base` default. Downloading the three benchmark models
  and implementing this harness require explicit approval.

## Delivery Sequence

### 1. Runtime and CLI Foundation

- Raise package and CI runtime to Node.js 24.
- Extend command parsing with the `knowledge` namespace and deterministic
  usage/errors.
- Add data-root configuration and safe repository-relative output helpers.
- Add startup SQLite/FTS5 capability checks.

Evidence:

- CLI parser tests for every command and invalid invocation.
- Node 24 CI, lint, typecheck, tests, build, and existing status behavior pass.

### 2. Durable Record and Storage Core

- Define explicit public record, source, processing-attempt, and error types.
- Model source provenance without provider-specific core fields: source adapter,
  external reference metadata, original name, claimed MIME type, detected media
  type, byte length, and checksum.
- Create versioned SQLite migrations using STRICT tables and foreign keys.
- Implement atomic file copy/write using temporary files, fsync where
  available, and rename before reporting success.
- Implement stable identifiers and SHA-256 duplicate detection.
- Implement note capture and `knowledge show`.

Evidence:

- Unit tests for validation, identifiers, checksums, migrations, rollback, and
  redacted errors.
- Integration tests in disposable data roots for restart/resume, duplicate
  capture, failed writes, and source inspection.

### 3. Document Import and Lexical Search

- Import UTF-8 Markdown and text into managed source storage.
- Normalize searchable text without mutating durable source bytes.
- Add FTS5 indexing, query parsing, phrase search, snippets, BM25 ranking, and
  stable tie-breaking.
- Add `knowledge search` and `knowledge rebuild`.

Evidence:

- Fixed retrieval fixture covering matches, non-matches, phrases, ordering,
  updates, source references, malformed queries, and index rebuild.
- Delete FTS-derived state and prove identical expected retrieval results.

### 4. Repository Indexing

- Traverse an explicit directory in stable path order.
- Index supported files in place with path, checksum, and source timestamp.
- Report indexed, unchanged, updated, skipped, missing, and failed files.
- Detect moved/deleted sources during reindex and record stale state.

Evidence:

- Disposable-repository integration tests for idempotence, content changes,
  deletion, unreadable files, symlink policy, and deterministic counts.

### 5. Inbox Processing

- Discover supported document and audio files in stable path order.
- Reuse import services rather than command handlers.
- Move a successful input to the processed area only after durable commit.
- Leave failed input in place with recoverable error evidence.

Evidence:

- Mixed-inbox tests for successes, duplicates, skips, partial failures,
  interrupted moves, and rerun idempotence.

### 6. Audio Normalization and Transcription

- Add FFmpeg and `whisper-cli` subprocess adapters with explicit timeouts.
- Add executable/model diagnostics and configuration.
- Add a provider-neutral media descriptor and content/container probing;
  extensions and claimed MIME types are hints, not authority.
- Preserve original audio, normalize to temporary WAV, transcribe locally, and
  store transcript and implementation metadata.
- Make transcript indexing use the same FTS path as text records.

Evidence:

- Deterministic fake-process tests for every failure boundary.
- Opt-in real integration test for WAV, MP3, and M4A.
- Contract fixture for Telegram-compatible OGG/Opus, misleading extensions, and
  MIME/container disagreement.
- Simulated remote-source adapter test proving Telegram-style provenance enters
  the pipeline without Telegram dependencies in core modules.
- Fixed-sample benchmark for `tiny`, `base`, and `small`; document results.

### 7. Backup, Restore, and Operational Documentation

- Implement or document a consistent backup package containing SQLite metadata,
  managed source files, transcripts, and a manifest with checksums.
- Restore only into an explicit empty destination and validate the manifest
  before activation.
- Document installation, configuration, model setup, disk/memory implications,
  troubleshooting, and recovery.

Evidence:

- Clean-environment backup/restore acceptance test.
- Restart after restore and compare record metadata, checksums, transcript
  linkage, and retrieval fixture results.

### 8. Phase Acceptance and Review

- Run all repository verification commands.
- Perform an independent privacy, data-loss, portability, and correctness
  review.
- Update roadmap, debt, review, and session artifacts only from verified
  evidence.

Evidence:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- CLI human/JSON acceptance checks where applicable
- `python3 -m unittest discover -s tests -v`
- `python3 scripts/validate_repository.py .`
- `git diff --check`
- GitHub Actions pass
- no unresolved critical or high review finding

## Decision Boundaries

Proceed without additional approval for schema details, module layout, command
formatting, test fixtures, migration mechanics, adapter contracts, and other
cheap reversible choices inside the approved requirements and ADRs.

Pause for approval if implementation would:

- send personal content over a network;
- introduce automatic deletion or destructive migration;
- require a hosted or recurring paid service;
- abandon portable source files as durable authority;
- weaken backup/rebuild guarantees;
- add a substantial always-running service or database server;
- materially change supported formats or user workflows.

Adding OGG/Opus to the future Telegram adapter is already inside the approved
boundary when it uses the shared descriptor, normalizer, durable-source, and
transcription contracts. It does not require a storage migration or a new
transcription architecture.

## Done Criteria

Phase 1 is done only when every approved acceptance criterion has executable
evidence, backup/restore succeeds in a clean environment, and independent review
finds no unresolved critical or high issue.
