# Session: Implementation — Durable Audio Capture

Date: 2026-06-22
Role: implementation
Status: completed

## Objective

Implement the next approved Phase 1 slice: provider-neutral audio description,
content-based media validation, durable original-audio capture, and the
`knowledge add-audio` CLI boundary without introducing network behavior or
prematurely coupling core records to FFmpeg or Whisper.

## Outcome

`knowledge add-audio PATH` now reads a local source, identifies supported media
from its bytes rather than trusting its filename, stores the original unchanged
under managed audio storage, and creates a stable pending audio record.

The public media descriptor records source kind, original name, claimed MIME
hint, detected media type, container, codec, byte length, and checksum. The
content detector covers WAV, MP3, M4A/ISO-BMFF, and the approved future
OGG/Opus adapter contract. A misleading extension cannot override detected
content. Audio remains pending and absent from search until local
normalization and transcription complete in the next slice.

## Artifacts

- `src/paios/knowledge/records.ts`
- `src/paios/knowledge/database.ts`
- `src/paios/cli.ts`
- `src/paios/types.ts`
- `tests/paios/knowledge.test.ts`
- `README.md`
- `HOW_TO_USE.md`
- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-22-1547-implementation-audio-capture.md`

No commit was created during this session. The worktree also contains the
completed repository-indexing and inbox-processing slices recorded by the two
immediately preceding session summaries.

## Decisions

- Keep acquisition separate from normalization and transcription, consistent
  with ADR-0003.
- Store imported audio as a pending record after the original bytes and
  metadata are durable; pending audio is not indexed by FTS.
- Treat filename extensions and MIME values as hints. Select managed source
  extensions from detected containers.
- Add nullable detected-container and detected-codec columns in schema version
  3 so existing note, document, and indexed-file records migrate unchanged.
- Expose OGG/Opus through the provider-neutral detector for future remote
  adapters while keeping the Phase 1 local CLI guarantee focused on WAV, MP3,
  and M4A.

These are reversible implementation details inside
`docs/requirements/phase-1-local-knowledge-loop.md`,
`docs/architecture/decisions/0003-phase-1-local-transcription.md`, and the
approved Phase 1 plan.

## Verification

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 42 tests, 0 failures.
- `npm run build` passed.
- `python3 -m unittest discover -s tests -v` passed: 13 tests.
- `python3 scripts/validate_repository.py .` passed.
- `git diff --check` passed.

Tests cover unchanged durable source bytes, pending record state, persisted
media metadata, misleading extensions, WAV PCM detection, MP3 and M4A
containers, Telegram-compatible OGG/Opus provenance, invalid content,
non-file paths, schema migration, record reopen, and CLI output.

## Blockers and Open Questions

- No blocker prevents the FFmpeg normalizer and `whisper-cli` adapter slice.
- M4A codec remains `unknown` until subprocess probing is added; the current
  detector establishes the ISO-BMFF container boundary only.
- Inbox audio remains retained as a failure until capture, normalization,
  transcription, and transcript commit can succeed as one recoverable workflow.
- Failed content detection currently rejects before creating a record. The
  adapter slice must define whether undecodable but readable user-supplied
  bytes become a durable failed audio record.

## Process Audit

The implementation stayed within the approved architecture and reused the
existing atomic managed-source writer and recovery model. One initial
typecheck exposed an unreachable exhaustive-command fallback after
`add-audio` became implemented; it was corrected before the successful
verification run.

The session initially ran four inspection commands without the required RTK
prefix while reading repository instructions. After reading
`/Users/paios/.codex/RTK.md`, all subsequent shell commands used RTK. Repository
search also confirmed that `rg` is unavailable, so targeted `grep`, `sed`, and
`find` reads were used. Exact token metrics are unavailable because the session
was not run through the repository capture script.

## Follow-up

1. Add explicit executable/model configuration and diagnostics.
2. Implement timeout-bound FFmpeg normalization behind a subprocess adapter.
3. Implement timeout-bound `whisper-cli` transcription and durable attempt
   metadata.
4. Commit transcript text to the existing FTS path, then connect successful
   end-to-end audio processing to inbox moves.
