# Session: Testing — Real Audio Dependency Readiness

Date: 2026-06-23
Role: testing
Status: completed

## Objective

Prepare and execute the completed opt-in real-tool audio integration harness
with local FFmpeg, `whisper-cli`, a configured GGML model, and a local speech
fixture across WAV, MP3, M4A, and Telegram-compatible OGG/Opus. Determine the
next approved benchmark boundary only if all four cases pass.

## Outcome

Initial discovery found the current machine was not ready for real execution.
After explicit user approval, local dependencies were installed and the
four-format harness completed successfully.

Before approval and setup, FFmpeg and `whisper-cli` did not resolve from
`PATH`, Homebrew reported both formulas uninstalled, no integration environment
variable was set, and targeted read-only searches found no executable, GGML
model, or suitable speech fixture.

Homebrew installed FFmpeg 8.1.2 and whisper.cpp 1.9.1. The multilingual
`ggml-base.bin` model was temporarily downloaded from the official whisper.cpp
Hugging Face repository. It was 147951465 bytes with SHA-256
`60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`.

The non-sensitive fixture was an 8.104-second synthetic English recording
generated locally with the macOS Samantha voice. It said:
`The local knowledge system records this clear English speech sample.
Searchable audio should remain private, durable, and available offline.`

`knowledge doctor` reported all dependencies ready. The harness passed WAV,
MP3, M4A, and Telegram-compatible OGG/Opus through real generation, durable
import, normalization, transcription, attempt metadata, and lexical search.
The fixture, downloaded model, generated media, transcripts, and runtime
records were removed after verification.

## Artifacts

- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-23-0015-testing-real-audio-readiness.md`
- `tests/paios/audio-real.integration.ts`

The session preserved the existing uncommitted audio-processing and harness
changes. No commit was created.

## Decisions

- Install FFmpeg and whisper.cpp and temporarily download the multilingual base
  model only after explicit user approval.
- Do not begin or implement the `tiny`/`base`/`small` benchmark because the
  benchmark implementation and its additional model downloads require a
  separate explicit boundary approval.
- Emit per-format pass/runtime diagnostics from the opt-in harness so execution
  evidence is attributable to each required container.

These decisions follow
`docs/requirements/phase-1-local-knowledge-loop.md`,
`docs/architecture/decisions/0003-phase-1-local-transcription.md`, and
`docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`.

## Verification

- `npm run build` passed before diagnostics.
- `./paios knowledge doctor` exited nonzero and reported:
  - FFmpeg missing from `PATH`;
  - `whisper-cli` missing from `PATH`;
  - no configured `PAIOS_WHISPER_MODEL_PATH`;
  - audio processing not ready.
- Homebrew package metadata reported `ffmpeg: installed=0` and
  `whisper-cpp: installed=0`.
- `/usr/local/opt/ffmpeg/bin/ffmpeg`, `/opt/homebrew/bin/ffmpeg`, and
  `/usr/local/bin/ffmpeg` were unavailable.
- `npm run test:audio-integration` completed with one intentional skip:
  `Set PAIOS_RUN_AUDIO_INTEGRATION=1 to run real audio integration tests.`
- `PAIOS_RUN_AUDIO_INTEGRATION=1 npm run test:audio-integration` completed
  with one intentional skip:
  `Set PAIOS_AUDIO_INTEGRATION_FIXTURE_PATH to a local speech-audio fixture.`
- Installed FFmpeg 8.1.2 and whisper.cpp 1.9.1 through Homebrew after approval.
- `PAIOS_WHISPER_MODEL_PATH=.local/models/ggml-base.bin ./paios knowledge
  doctor` reported all dependencies ready.
- Real invocation:
  `PAIOS_RUN_AUDIO_INTEGRATION=1
  PAIOS_AUDIO_INTEGRATION_FIXTURE_PATH=/private/tmp/paios-audio-integration-fixture.wav
  PAIOS_WHISPER_MODEL_PATH=.local/models/ggml-base.bin
  PAIOS_AUDIO_INTEGRATION_LANGUAGE=en
  PAIOS_AUDIO_INTEGRATION_TIMEOUT_MS=600000
  npm run test:audio-integration`.
- Real harness passed:
  - WAV: 2702 ms;
  - MP3: 2816 ms;
  - M4A: 2821 ms;
  - OGG/Opus: 2867 ms;
  - aggregate test duration: 11907 ms;
  - command wall time: 14.06 seconds.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 65 tests, 0 failures.
- `npm run build` passed.
- `python3 -m unittest discover -s tests -v` passed: 13 tests.
- `python3 scripts/validate_repository.py .` passed:
  `Repository knowledge validation passed.`
- `git diff --check` passed with no output.
- No generated audio, transcript, model, runtime record, personal content, or
  secret was added to the worktree.

## Blockers and Open Questions

The real integration gate is complete. The next decision is whether to approve
implementation and execution of the proposed fixed-sample benchmark, including
temporary downloads of multilingual tiny, base, and small GGML models.

## Process Audit

The session stayed read-only until explicit approval authorized installation,
model download, and fixture generation. Discovery covered `PATH`, configured
environment variables, Homebrew installation metadata, standard local
development and download directories, application directories, and Spotlight
model/executable metadata. It did not inspect or expose personal media-library
content.

The repository-required RTK wrapper does not support compound `find`
predicates, so the documented `rtk proxy find` fallback was used for read-only
discovery. A cold first diagnostic exceeded the five-second executable startup
bound while Homebrew backends initialized; immediate standalone and repeated
diagnostic runs completed in under one second, so this was treated as
installation warm-up rather than a repeatable product defect.

The first successful harness run exposed an evidence-quality gap: only an
aggregate pass was printed. The smallest in-boundary change added per-format
runtime diagnostics, and an identical rerun produced attributable results for
all four formats. No product behavior changed. Exact token metrics are
unavailable because this session was not captured with
`scripts/capture_codex_session.py`.

Capability inventory: repository-local capabilities consist of the
`paios-project-workflow` and `paios-session-close` skills and the existing
Codex evaluation scenarios. There are no repository-local commands, prompts,
hooks, or custom agents.

Capability harvest:

| Item | Target | Action | Session evidence |
| --- | --- | --- | --- |
| Real integration evidence | Approved Phase 1 plan | Promote | Exact versions, model checksum, fixture, runtimes, and four-format results are now recorded. |
| Benchmark boundary | Approved Phase 1 plan | Propose for approval | The real integration gate passed, but model downloads and benchmark implementation remain unapproved. |
| Real audio environment contract | `HOW_TO_USE.md` | Keep unchanged | The documented environment and invocation completed successfully. |
| Project routing | `.agents/skills/paios-project-workflow/` | Keep unchanged | The skill preserved the integration gate and separated benchmark approval. |
| Session closeout | `.agents/skills/paios-session-close/` | Keep unchanged | The skill captured exact execution and cleanup evidence. |
| Commands, prompts, hooks, agents | Repository capability surface | Reject | No capability failure or reusable missing surface was observed. |

No capability edit or separate audit is justified.

## Follow-up

1. Obtain explicit approval for the proposed fixed-sample benchmark boundary
   and temporary tiny/base/small model downloads.
2. Implement the separate opt-in benchmark without changing production
   transcription behavior or the normal deterministic suite.
3. Run one warm-up and three measured sequential transcriptions per model,
   record accuracy/resource evidence, remove all model/runtime artifacts, and
   document a recommendation.
4. Request separate approval before changing ADR-0003's documented base-model
   default.
