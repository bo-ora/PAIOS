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
- 2026-06-23: Implemented and executed the separately opt-in fixed-sample
  multilingual transcription benchmark without changing ADR-0003's `base`
  default. Exact invocation:
  `PAIOS_RUN_AUDIO_BENCHMARK=1
  PAIOS_AUDIO_BENCHMARK_TIMEOUT_MS=600000 npm run benchmark:audio`.
  The harness generated the approved Samantha English fixture, normalized it
  once to an 8.116-second canonical 16 kHz mono signed 16-bit PCM WAV, then ran
  one warm-up and three sequential measured transcriptions per model with
  whisper.cpp 1.9.1, language `en`, and identical arguments. FFmpeg was 8.1.2.
  Results:
  - `ggml-tiny.bin`: 77691713 bytes, SHA-256
    `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`;
    measured wall times 2.058, 2.043, and 2.043 seconds; median 2.043
    seconds; real-time factor 0.252; maximum measured peak resident memory
    183005184 bytes; exact normalized reference transcript; word error rate
    0.000000.
  - `ggml-base.bin`: 147951465 bytes, SHA-256
    `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`;
    measured wall times 3.511, 3.507, and 3.511 seconds; median 3.511
    seconds; real-time factor 0.433; maximum measured peak resident memory
    297254912 bytes; exact normalized reference transcript; word error rate
    0.000000.
  - `ggml-small.bin`: 487601967 bytes, SHA-256
    `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`;
    measured wall times 9.823, 9.791, and 9.865 seconds; median 9.823
    seconds; real-time factor 1.210; maximum measured peak resident memory
    792637440 bytes; normalized transcript began `with a local knowledge`
    instead of `the local knowledge`; word error rate 0.105263.
  On this fixed synthetic sample and machine, `tiny` is the evidence-based
  benchmark recommendation because it matched `base` at zero word error while
  using less time, memory, and disk. This is not enough representative personal
  audio evidence to change the production default, so ADR-0003 remains
  unchanged. All downloaded models, generated audio, transcripts, partial
  downloads, and benchmark runtime directories were removed after execution.

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

Status:

- 2026-06-23: Completed the backup/restore slice. `knowledge backup` uses the
  Node SQLite backup API for a consistent metadata snapshot, copies regular
  managed source files, and writes a versioned manifest with byte lengths and
  SHA-256 checksums. `knowledge restore` requires an explicit empty
  `--data-root`, validates safe paths and the exact package contents before
  copying, rebuilds derived FTS state, and removes partial output on activation
  failure. Automated clean-environment evidence compares note, imported-file,
  audio transcript, processing-attempt, source-byte, and lexical-search state
  after reopening the restored root. Operational backup, restore,
  troubleshooting, and recovery steps are documented in `HOW_TO_USE.md`.

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

Status:

- 2026-06-23: Local Phase 1 acceptance completed. `./lde.sh` passed with zero
  failures and warnings; `npm ci` reported zero vulnerabilities; lint,
  typecheck, 79 Node tests, build, CLI capture/search/rebuild/backup/restore
  smoke checks, 13 Python tests, repository validation, and whitespace checks
  passed. The opt-in real audio integration had previously passed WAV, MP3,
  M4A, and OGG/Opus with local FFmpeg and whisper.cpp, and the approved
  tiny/base/small benchmark had completed with exact aggregate evidence.
- Independent measured read-only reviews found and drove fixes for incomplete
  failed-record backups, stale restored indexed sources, unpinned model
  downloads, destructive cleanup races, repository-local privacy paths,
  symlink aliases, orphan managed files, restore count reporting, portability,
  and staged restore validation. The final review reported no critical or high
  finding. Raw review evidence remains ignored under `.local/paios-sessions/`.
- Remote GitHub Actions has not run for the current uncommitted worktree.
  Phase 1 remains `in-progress` until the complete change is explicitly
  authorized for commit/push and the resulting workflow run passes. No remote
  CI success is claimed.

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
