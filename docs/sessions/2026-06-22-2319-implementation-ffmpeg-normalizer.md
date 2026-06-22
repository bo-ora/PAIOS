# Session: Implementation — FFmpeg Audio Normalizer

Date: 2026-06-22
Role: implementation
Status: completed

## Objective

Implement the next approved Phase 1 slice: a provider-neutral,
timeout-bound FFmpeg adapter that converts validated original audio bytes to a
temporary canonical WAV for local transcription. Completion required
deterministic tests for every process boundary, output validation, diagnostic
redaction, and temporary-file cleanup.

## Outcome

The new normalizer accepts original bytes plus the existing media descriptor,
verifies their byte length and checksum, and writes a private temporary input
using the detected container. It invokes FFmpeg without a shell and requests
16 kHz mono signed 16-bit PCM WAV output.

The adapter validates the resulting WAV header and format before exposing the
normalized path to a caller-supplied callback. The temporary input, output, and
working directory are removed after success, FFmpeg failure, invalid output,
timeout, or callback failure. Typed failures distinguish invalid source,
missing executable, timeout, process failure, and invalid output. Bounded
diagnostics redact the configured executable and temporary directory paths.

The contract supports local WAV, MP3, and M4A descriptors and the approved
future Telegram-compatible OGG/Opus descriptor without introducing Telegram
types. It remains intentionally disconnected from `add-audio` until
transcription and durable attempt recording can complete the recoverable
workflow.

## Artifacts

- `src/paios/knowledge/audio-normalizer.ts`
- `tests/paios/knowledge.test.ts`
- `README.md`
- `HOW_TO_USE.md`
- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-22-2319-implementation-ffmpeg-normalizer.md`

The worktree also contains the preceding uncommitted audio diagnostics slice
recorded in
`docs/sessions/2026-06-22-2307-implementation-audio-diagnostics.md`.
No commit was created.

## Decisions

- Keep normalization behind a callback-scoped temporary-path API so callers
  cannot accidentally retain stale temporary paths.
- Use a 120-second default timeout while allowing deterministic per-call
  overrides.
- Validate canonical WAV output independently of FFmpeg exit status.
- Reject descriptor container values that are unsafe for temporary filenames.
- Keep the adapter independent of records, SQLite, inbox processing, and
  `whisper-cli`.

These are reversible implementation details inside
`docs/requirements/phase-1-local-knowledge-loop.md`,
`docs/architecture/decisions/0003-phase-1-local-transcription.md`, and
`docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`.

## Verification

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 51 tests, 0 failures.
- `npm run build` passed.
- `python3 -m unittest discover -s tests -v` passed: 13 tests.
- `python3 scripts/validate_repository.py .` passed.
- `git diff --check` passed.
- Tests verify canonical FFmpeg arguments, source-byte preservation,
  callback-scoped output, missing executable, timeout, nonzero exit, malformed
  output, descriptor mismatch, diagnostic redaction, cleanup after process and
  callback failures, and the OGG/Opus contract.
- The combined diagnostics and normalizer diff was reviewed against ADR-0003.

## Blockers and Open Questions

- No implementation blocker remains for the `whisper-cli` adapter and durable
  processing-attempt metadata.
- FFmpeg is not installed or configured on the current machine, so the opt-in
  real WAV, MP3, M4A, and OGG/Opus normalization test was not run.
- The exact persisted processing-attempt schema remains a reversible
  implementation choice for the next slice.

## Process Audit

The implementation stayed inside the approved architecture and introduced no
network behavior, implicit installation, shell execution, provider coupling,
or durable normalized-audio copy. The first documentation patch combined
source and test contexts incorrectly and failed without changing files; it was
immediately split into valid file-specific edits. The Node suite again required
one poll beyond the initial 30-second tool window but completed normally.

The repository-local capability inventory contains the project-workflow and
session-close skills plus their agent metadata. No capability change is
justified:

| Item | Target | Action | Session evidence |
| --- | --- | --- | --- |
| Audio adapter implementation pattern | Approved plan and ADR-0003 | Keep in implementation/docs; reject capability harvest | The pattern is product code, not a repeated Codex workflow need. |
| Session closeout | `.agents/skills/paios-session-close/` | Keep unchanged | The existing skill produced the required handoff and harvest audit. |

Exact token metrics are unavailable because the session was not run through
`scripts/capture_codex_session.py`.

## Follow-up

1. Add timeout-bound `whisper-cli` transcription behind a deterministic process
   seam.
2. Add a versioned processing-attempt schema recording implementation version,
   model filename/checksum, language, timestamps, exit status, and bounded
   diagnostics.
3. Connect normalization and transcription to pending audio records, commit
   transcript text through the existing FTS path, and preserve retry identity.
4. Configure real local tools and run the opt-in format integration tests.
5. Commit and push the two completed audio slices when requested.
