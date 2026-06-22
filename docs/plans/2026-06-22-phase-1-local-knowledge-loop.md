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
- Next: repository indexing and deletion/stale-source handling.

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
