# Session: Implementation — Audio Tool Configuration and Diagnostics

Date: 2026-06-22
Role: implementation
Status: completed

## Objective

Implement the next approved Phase 1 slice: explicit FFmpeg,
`whisper-cli`, and local Whisper model configuration plus read-only,
path-redacted diagnostics. Completion required deterministic success,
missing-dependency, and invalid-configuration tests and the full repository
verification suite.

## Outcome

The CLI now provides `./paios knowledge doctor`. FFmpeg and `whisper-cli`
resolve from explicit environment configuration or fall back to `PATH`; the
GGML model requires an explicit local path. Diagnostics execute each tool
without a shell and with a five-second timeout, report bounded version output,
validate the model as a readable non-empty regular file, and report its
filename, byte length, and SHA-256 checksum without printing configured
absolute paths.

The command reports all dependency states in one run and exits zero only when
FFmpeg, `whisper-cli`, and the model are ready. The current development
environment reports all three as missing, which is expected and now produces
actionable configuration guidance.

## Artifacts

- `src/paios/knowledge/audio-diagnostics.ts`
- `src/paios/knowledge/config.ts`
- `src/paios/knowledge/commands.ts`
- `src/paios/cli.ts`
- `tests/paios/knowledge.test.ts`
- `tests/paios/cli.test.ts`
- `README.md`
- `HOW_TO_USE.md`
- `docs/operations/development-environment.md`
- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-22-2307-implementation-audio-diagnostics.md`

The changes remain uncommitted.

## Decisions

- Use `PAIOS_FFMPEG_PATH`, `PAIOS_WHISPER_CLI_PATH`, and
  `PAIOS_WHISPER_MODEL_PATH` as explicit machine-local configuration.
- Allow executable lookup through `PATH`; never infer or download a model.
- Resolve relative configured paths from the repository root.
- Keep diagnostics read-only and avoid exposing configured absolute paths.
- Compute the model checksum incrementally so large model files do not require
  a full in-memory read.

These are reversible implementation details inside
`docs/requirements/phase-1-local-knowledge-loop.md`,
`docs/architecture/decisions/0003-phase-1-local-transcription.md`, and
`docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`.

## Verification

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 46 tests, 0 failures.
- `npm run build` passed.
- `python3 -m unittest discover -s tests -v` passed: 13 tests.
- `python3 scripts/validate_repository.py .` passed.
- `git diff --check` passed.
- Compiled `./paios knowledge doctor` reported FFmpeg, `whisper-cli`, and the
  model as missing without exposing an absolute path and exited nonzero.
- The full diff was reviewed for scope, configuration precedence, diagnostic
  failure handling, and path redaction.

## Blockers and Open Questions

- No implementation blocker remains for the FFmpeg normalization adapter.
- FFmpeg, `whisper-cli`, and a GGML model are not installed or configured on
  the current machine; real integration tests remain opt-in until they are.
- The approved `tiny`, `base`, and `small` fixed-sample benchmark remains
  pending after real transcription is implemented.

## Process Audit

The change stayed inside the approved Phase 1 and ADR-0003 boundary and did not
introduce network behavior, downloads, a shell subprocess, or transcript
logging. Type checking found one union-narrowing issue in the first
implementation; it was corrected before successful verification. The initial
Node test run exceeded the first 30-second polling window but completed
successfully without intervention; the final run confirmed 46 passing tests.

The repository-local capability inventory contains the project-workflow and
session-close skills plus their agent metadata. No skill, command, agent,
prompt, or hook change is justified by this session:

| Item | Target | Action | Session evidence |
| --- | --- | --- | --- |
| Audio diagnostics workflow | Existing CLI and approved plan | Reject capability harvest | The implementation followed existing workflow guidance without a repeated process failure or user correction. |
| Session closeout | `.agents/skills/paios-session-close/` | Keep unchanged | The existing skill supplied the required evidence, handoff, and harvest structure. |

Exact token metrics are unavailable because the session was not run through
`scripts/capture_codex_session.py`.

## Follow-up

1. Implement timeout-bound FFmpeg normalization behind a subprocess adapter.
2. Add deterministic fake-process tests for success, timeout, nonzero exit,
   malformed output, and temporary-file cleanup.
3. Install or explicitly configure FFmpeg before running the opt-in real
   normalization integration tests.
4. Commit and push this completed slice when requested.
