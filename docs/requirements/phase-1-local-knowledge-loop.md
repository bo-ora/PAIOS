# Phase 1: Local Knowledge Loop

Status: Proposed
Date: 2026-06-22

## Purpose

Phase 1 gives the user a dependable local loop for capturing personal
knowledge, finding it later, and inspecting the exact source behind every
result. It establishes useful knowledge management before Telegram, semantic
retrieval, autonomous workflows, or health-specific intelligence.

Phase 1 is complete when a note, a supported document, a repository document,
and an audio recording can each move through capture, durable local storage,
search, retrieval, and source inspection without network access or silent data
loss.

## User Value

- Capture information quickly without deciding its final organization first.
- Search previously captured information using ordinary words.
- Understand why a result matched and open the underlying source.
- Rebuild derived search data from durable local records.
- Keep personal content under local ownership by default.

## Primary Workflows

### Capture a Note

The user can capture UTF-8 text with an optional title:

```bash
printf '%s\n' "Content" | ./paios knowledge add-note --title "Optional title"
```

Short content may also be supplied with `--text`, but stdin is the documented
default so multiline content does not require shell escaping or enter shell
history as a command argument.

The command returns a stable record identifier and storage confirmation.

### Import a Document

The user can import a supported local file:

```bash
./paios knowledge add-file PATH
```

Phase 1 guarantees UTF-8 Markdown (`.md`) and plain-text (`.txt`) input.
PDF, office documents, images, and web pages are outside the guaranteed Phase 1
boundary unless separately approved.

### Index Repository Documents

The user can index Markdown and text files under an explicitly supplied
repository or directory:

```bash
./paios knowledge index PATH
```

The command reports indexed, unchanged, updated, skipped, and failed counts.
Repeated indexing is idempotent for unchanged content.

### Process the Local Inbox

The user can place supported files into a local inbox and process them in one
operation:

```bash
./paios knowledge ingest-inbox
```

The default inbox is `.local/paios/inbox/` and is configurable with the same
local data-root mechanism as managed knowledge storage. The command:

- discovers supported Markdown, text, and audio files;
- processes files deterministically in stable path order;
- reports each success, duplicate, skip, and failure;
- moves successfully captured inputs to a local processed area only after the
  durable record is committed;
- leaves failed inputs in the inbox with recoverable error evidence;
- never deletes inbox content automatically.

### Import and Transcribe Audio

The user can import a supported local audio file:

```bash
./paios knowledge add-audio PATH
```

Phase 1 guarantees WAV, MP3, and M4A input. Transcription runs locally by
default. No audio or transcript may be sent to a cloud service without a future
approved requirement and an explicit per-operation user action.

The durable record links the original audio, transcript, transcription status,
and transcription implementation metadata.

### Search

The user can perform deterministic lexical/full-text search:

```bash
./paios knowledge search "QUERY"
```

Results include:

- stable record identifier;
- title or source filename;
- source type;
- matching excerpt;
- source path or managed-source reference;
- capture or source timestamp when available;
- match ordering information.

Search must not generate an answer, summary, or unsupported claim. Phase 1
returns matching source material.

### Inspect a Record

The user can inspect one captured record:

```bash
./paios knowledge show RECORD_ID
```

The output includes metadata, normalized searchable text, original-source
reference, content checksum, ingestion status, and errors or warnings.

## Source and Storage Model

- All managed knowledge data remains under an ignored local PAIOS data
  directory, configurable by environment or command option.
- The default data directory is `.local/paios/knowledge/` at the repository
  root during Phase 1 development.
- The default inbox and processed-input directories are
  `.local/paios/inbox/` and `.local/paios/inbox-processed/`.
- Captured notes are stored as durable source records, not only as index rows.
- Files imported with `add-file` or `add-audio` are copied into managed local
  storage so later retrieval does not depend on the original path.
- Files discovered through `knowledge index PATH` remain authoritative at their
  original path. PAIOS stores metadata, checksum, and normalized searchable
  text but does not modify those files.
- Every record has a stable identifier, source type, source reference, checksum,
  capture time, processing state, and normalized searchable text.
- Search indexes and other derived artifacts are rebuildable from source
  records and indexed source paths.
- Deleting or moving an indexed external source is reported explicitly during
  reindex or retrieval; PAIOS must not silently present stale content as
  current.

## Capture and Processing Behavior

- Capture commands validate input before reporting success.
- Processing state is one of `pending`, `ready`, or `failed`.
- A failed parse or transcription preserves the source record and records a
  useful error; retry must not create an accidental duplicate.
- Duplicate byte-identical imports are detected by checksum and reported.
- The user can intentionally retain a duplicate only through an explicit future
  option; Phase 1 may reject duplicates by default.
- Commands print all available results before returning a failure exit code.
- Normal operation is deterministic for unchanged inputs and configuration.

## Retrieval Requirements

- Phase 1 uses lexical or full-text retrieval only.
- Search is case-insensitive for ordinary Latin text.
- Quoted phrases are supported.
- Results are ordered deterministically.
- Every result contains enough source information to verify the matched text.
- No embedding, vector database, semantic ranking, generated answer, or
  retrieval-augmented generation is required.
- A fixed evaluation fixture must test expected matches, non-matches, phrase
  search, ordering, updates, deletion handling, and source references.

## Privacy and Security

- Capture, parsing, transcription, indexing, and search work offline after
  installation.
- Personal source content, transcripts, and indexes are ignored by Git.
- No telemetry, analytics, AI API call, or implicit network request is allowed.
- Logs must not print full personal content unless the user requested record
  display.
- Paths in normal user output may be repository-relative, data-directory
  relative, or the explicit source path supplied by the user. Diagnostic output
  must not expose unrelated home-directory paths.
- The managed data directory must be portable through documented backup and
  restore steps.
- Secrets are not required for the approved Phase 1 boundary.

## Reliability and Recovery

- Capture success is reported only after durable source and metadata writes
  complete.
- Interrupted processing leaves a recoverable `pending` or `failed` record.
- Re-running ingestion or transcription is idempotent for the same record.
- A rebuild command recreates derived search state from durable records:

```bash
./paios knowledge rebuild
```

- Backup and restore verification must demonstrate that records, transcripts,
  metadata, and search behavior survive a clean application restart.
- Runtime data and indexes must not be committed to Git.

## Technical Constraints

- Extend the repository-local TypeScript CLI and existing build, lint, test, and
  CI workflow.
- Keep core knowledge behavior behind stable storage, transcription, and search
  interfaces.
- The durable source model must not depend on one database, transcription
  engine, or AI provider.
- Prefer mature local components and the smallest architecture that satisfies
  recovery and retrieval requirements.
- Any native binary or model dependency must have documented installation,
  version, disk, memory, and licensing implications.
- Python bootstrap tooling does not need to be rewritten unless Phase 1 creates
  shared models or substantial cross-language maintenance.

## Out of Scope

- Telegram or other remote interfaces.
- Continuous directory watching or background daemons.
- Cloud transcription or hosted AI providers.
- Semantic/vector retrieval, embeddings, knowledge graphs, or entity linking.
- Generated summaries, answers, recommendations, or autonomous research.
- PDF OCR, image understanding, office-document extraction, or web crawling.
- Multi-user accounts, remote synchronization, sharing, or collaborative edits.
- Health-specific schemas or analysis.
- Automatic deletion, retention policies, or destructive cleanup commands.

## Acceptance Criteria

- A note can be captured, stored, searched, retrieved, and traced to its durable
  source record offline.
- Markdown and plain-text files can be imported and found through expected
  lexical queries.
- A mixed local inbox of supported documents and audio can be processed without
  silent deletion; successful, duplicate, skipped, and failed files are
  reported and recoverable.
- An explicitly selected repository directory can be indexed and reindexed
  idempotently; changed and deleted files are reported correctly.
- WAV, MP3, and M4A files can be imported and transcribed locally; transcripts
  are searchable and linked to the original managed audio.
- Duplicate imports, failed parsing, and failed transcription preserve
  consistent recoverable state.
- Search results include stable identifiers, excerpts, and verifiable source
  references with deterministic ordering.
- Derived search data can be deleted and rebuilt without losing source records
  or changing expected retrieval results.
- A backup/restore acceptance test recovers the complete local knowledge loop
  in a clean temporary environment.
- Lint, typecheck, unit tests, integration tests, build, repository validation,
  and GitHub Actions pass.
- An independent review finds no unresolved critical or high privacy,
  data-loss, portability, or correctness issue.

## Approval Decisions

The following recommendations require explicit approval before Phase 1 changes
to `approved` or implementation begins:

1. Use `./paios knowledge ...` as the Phase 1 command namespace.
2. Guarantee Markdown and plain text for document import; defer PDF and office
   formats.
3. Guarantee WAV, MP3, and M4A for audio import.
4. Require local-only transcription and prohibit cloud transcription in
   Phase 1.
5. Copy explicitly imported files and audio into managed storage, while
   repository indexing references authoritative files in place.
6. Use deterministic lexical/full-text retrieval and defer semantic search.
7. Default runtime storage to ignored `.local/paios/knowledge/`, while allowing
   configuration for another local path.

Storage engine and transcription-engine selection are architecture decisions to
make after these product requirements are approved.
