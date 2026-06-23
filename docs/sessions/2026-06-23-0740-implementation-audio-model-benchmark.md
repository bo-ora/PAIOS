# Session: Implementation and Testing — Audio Model Benchmark

Date: 2026-06-23
Role: implementation/testing
Status: completed

## Objective

Implement and execute the approved separately opt-in fixed-sample multilingual
`tiny`/`base`/`small` whisper.cpp transcription benchmark. Preserve the
deterministic offline normal suite, record exact non-sensitive aggregate
evidence, remove all temporary artifacts, and leave changes uncommitted.

## Outcome

Added an opt-in benchmark command, deterministic offline tests for its
configuration and calculations, and operating documentation. The benchmark
generated the approved Samantha English fixture, normalized it once, and
completed one warm-up plus three sequential measured runs for each official
multilingual model.

Tiny and base both transcribed the normalized reference exactly. Tiny was
faster and used less peak resident memory and disk. Small was slower than real
time and introduced two word errors. The evidence-based recommendation for
this fixed synthetic sample and Intel Mac is tiny, but this does not change
ADR-0003's documented base default because representative personal-audio
evidence was outside this task.

All downloaded models, partial downloads, generated audio, transcripts, and
benchmark runtime directories were removed. Repository changes remain
uncommitted.

## Artifacts

- `tests/paios/audio-benchmark-harness.ts`
- `tests/paios/audio-benchmark.test.ts`
- `tests/paios/audio-benchmark.ts`
- `package.json`
- `HOW_TO_USE.md`
- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-23-0740-implementation-audio-model-benchmark.md`

No commit was created.

## Decisions

- Keep the benchmark separate from the normal suite and require
  `PAIOS_RUN_AUDIO_BENCHMARK=1`.
- Use official multilingual whisper.cpp model downloads only inside the
  explicit benchmark process.
- Use the same `whisper-cli`, language `en`, canonical fixture, argument shape,
  and sequential machine state for all models.
- Measure wall time with Node's monotonic clock and peak resident memory with
  `/usr/bin/time -l`, both through shell-free timeout-bound subprocesses.
- Aggregate wall time by median, peak memory by the maximum measured value, and
  transcript by deterministic majority text; calculate word error rate with
  normalized word-level Levenshtein distance.
- Recommend tiny only for this fixed benchmark. Keep ADR-0003's base default
  unchanged pending separately approved representative-audio evidence.

These decisions remain within
`docs/requirements/phase-1-local-knowledge-loop.md`,
`docs/architecture/decisions/0003-phase-1-local-transcription.md`, and
`docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`.

## Verification

- Initial `git status --short --branch` showed clean
  `master...origin/master` at commit `ee98aad`.
- `./lde.sh` passed with 0 failures and 0 warnings using Node.js 24.17.0.
- Pre-benchmark `./paios knowledge doctor` reported:
  - FFmpeg 8.1.2 ready;
  - whisper.cpp 1.9.1 ready;
  - model intentionally missing;
  - audio processing not ready only because no production model was configured.
- Disabled `npm run benchmark:audio` exited zero with:
  `Set PAIOS_RUN_AUDIO_BENCHMARK=1 to run the local audio benchmark.`
- Exact live invocation:
  `PAIOS_RUN_AUDIO_BENCHMARK=1
  PAIOS_AUDIO_BENCHMARK_TIMEOUT_MS=600000 npm run benchmark:audio`.
- Fixture:
  - macOS Samantha voice;
  - language `en`;
  - 8.116 seconds;
  - canonical 16 kHz mono signed 16-bit PCM WAV;
  - reference:
    `The local knowledge system records this clear English speech sample.
    Searchable audio should remain private, durable, and available offline.`
- Common transcription arguments:
  `-m <model> -f <fixture> -l en -otxt -of <output> -np -nt`.
- `ggml-tiny.bin`:
  - 77691713 bytes;
  - SHA-256
    `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`;
  - wall times 2.058, 2.043, and 2.043 seconds;
  - median 2.043 seconds;
  - real-time factor 0.252;
  - maximum measured peak resident memory 183005184 bytes;
  - normalized transcript matched the normalized reference exactly;
  - word error rate 0.000000.
- `ggml-base.bin`:
  - 147951465 bytes;
  - SHA-256
    `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`;
  - wall times 3.511, 3.507, and 3.511 seconds;
  - median 3.511 seconds;
  - real-time factor 0.433;
  - maximum measured peak resident memory 297254912 bytes;
  - normalized transcript matched the normalized reference exactly;
  - word error rate 0.000000.
- `ggml-small.bin`:
  - 487601967 bytes;
  - SHA-256
    `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`;
  - wall times 9.823, 9.791, and 9.865 seconds;
  - median 9.823 seconds;
  - real-time factor 1.210;
  - maximum measured peak resident memory 792637440 bytes;
  - normalized transcript:
    `with a local knowledge system records this clear english speech sample
    searchable audio should remain private durable and available offline`;
  - word error rate 0.105263.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 70 tests, 0 failures.
- `npm run build` passed.
- `python3 -m unittest discover -s tests -v` passed: 13 tests.
- `python3 scripts/validate_repository.py .` passed:
  `Repository knowledge validation passed.`
- `git diff --check` passed with no output.
- Post-run searches found no tiny, base, small, or partial model file under
  `.local/`.
- The benchmark root and generated temporary benchmark directories were absent
  after the run.

## Blockers and Open Questions

No blocker prevented the approved benchmark. A production default-model change
remains outside this task and would require separate approval plus
representative personal-audio evidence.

## Process Audit

The session stayed inside the approved implementation/testing boundary. It
inspected the complete committed audio implementation and governing
requirements, ADR, plan, usage documentation, and latest handoff before edits.
The benchmark used bounded shell-free subprocesses and isolated cleanup on
every exit path.

One initial inspection command did not use the required RTK prefix before the
RTK instruction file had been read. All subsequent shell commands used RTK.
One cleanup assertion attempted to pass shell syntax through `rtk test`; direct
file searches were used instead. Neither deviation changed repository or
benchmark state.

Exact Codex token metrics are unavailable because this session was not started
through `scripts/capture_codex_session.py`.

Capability inventory: repository-local capabilities remain the
`paios-project-workflow` and `paios-session-close` skills plus existing Codex
evaluation scenarios. There are no repository-local custom agents, hooks, or
prompts.

Capability harvest:

| Item | Target | Action | Session evidence |
| --- | --- | --- | --- |
| Benchmark operating procedure | `HOW_TO_USE.md` | Update existing documentation | The exact opt-in command, prerequisites, metrics, and cleanup behavior completed successfully. |
| Benchmark evidence | Approved Phase 1 plan | Promote observed aggregate facts | All three models completed the approved fixed scenario with exact checksums and measurements. |
| Default-model decision | ADR-0003 | Reject change in this session | One synthetic English fixture is insufficient representative evidence; base remains documented. |
| Project workflow skill | `.agents/skills/paios-project-workflow/` | Keep unchanged | The skill confirmed an already approved reversible boundary with no approval ambiguity. |
| Session-close skill | `.agents/skills/paios-session-close/` | Keep unchanged | The required evidence and harvest fit the existing closeout structure. |
| Commands, agents, hooks, prompts | Repository capability surface | Reject | No reusable capability failure was observed. |

No capability edit or separate audit is justified.

## Follow-up

1. Continue Phase 1 with the approved backup/restore and recovery slice.
2. Keep ADR-0003's base default unless a separate approved representative-audio
   evaluation supports a change.
3. Commit this benchmark implementation and evidence only when explicitly
   requested.
