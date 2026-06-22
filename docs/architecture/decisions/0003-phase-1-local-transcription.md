# ADR-0003: Use FFmpeg and whisper.cpp for Local Transcription

Status: Accepted
Date: 2026-06-22

## Context

Phase 1 guarantees local transcription of WAV, MP3, and M4A without implicit
network access. The development machine is an Intel Mac with 16 GiB RAM and no
supported GPU acceleration assumption. The TypeScript CLI must not depend
directly on one transcription engine.

The original audio is durable source material. Audio conversion and model
output are processing steps that must be retryable without creating duplicate
records.

## Decision

- Invoke FFmpeg and `whisper-cli` as local subprocesses through separate
  adapter interfaces.
- Normalize every supported input to a temporary 16 kHz mono signed 16-bit PCM
  WAV before transcription.
- Preserve the original imported audio unchanged in managed storage.
- Require explicit installation of FFmpeg, `whisper.cpp`, and a local model.
- Never download a binary or model during capture or transcription.
- Resolve executable and model paths from explicit configuration, with PATH
  lookup allowed for executables.
- Document the multilingual `base` GGML model as the initial default for the
  current Intel 16 GiB machine, while allowing another local model path.
- Record executable version, model filename and checksum, language option,
  timestamps, exit status, and a bounded diagnostic message for each attempt.
- Pass subprocess arguments without a shell and do not log transcript content
  or unrelated absolute paths.
- Keep failed source records and temporary-processing state recoverable; remove
  temporary normalized audio after a completed or recorded failed attempt.

## Alternatives Considered

- `faster-whisper`: potentially faster, but introduces Python, CTranslate2, and
  a second application dependency stack before throughput is measured.
- OpenAI Whisper Python package: reference implementation but heavier due to
  Python and PyTorch.
- A native Node binding: couples the CLI to an engine ABI and complicates Node
  upgrades.
- Cloud transcription: violates the approved Phase 1 privacy boundary.

## Consequences

- Initial setup requires external local packages and a model download initiated
  by the user.
- FFmpeg and `whisper.cpp` versions vary by platform, so startup diagnostics
  and captured implementation metadata are required.
- CPU transcription may be slower than real time for larger models on the
  current Intel machine.
- The subprocess boundary makes future replacement with `faster-whisper`,
  another local engine, or platform acceleration inexpensive.

## Validation

- Test adapters with deterministic fake executables for success, timeout,
  non-zero exit, malformed output, and missing executable/model cases.
- Run an opt-in local integration test against real FFmpeg and `whisper-cli`.
- Verify WAV, MP3, and M4A normalization and transcript-source linkage.
- Verify no network is required after explicit dependency/model installation.
- Benchmark `tiny`, `base`, and `small` on a fixed sample before changing the
  documented default.
- Revisit if the base model is unusably slow or inaccurate on representative
  personal audio.
