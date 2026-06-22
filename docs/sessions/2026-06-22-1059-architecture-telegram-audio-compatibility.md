# Session: Architecture — Telegram Audio Compatibility

Date: 2026-06-22
Role: architecture
Status: completed

## Objective

Ensure the Phase 1 audio pipeline can accept future Telegram voice notes and
audio without a storage migration or transcription redesign.

## Outcome

The architecture now defines media ingestion as original bytes plus a
provider-neutral descriptor. Media is content-validated, converted by the
shared normalizer to canonical temporary WAV, and then passed to the existing
transcription adapter. Telegram acquisition and provenance remain outside core
storage, search, normalization, and transcription modules.

OGG/Opus is now a forward-compatibility contract fixture. Phase 1's public
guarantee remains WAV, MP3, and M4A.

## Artifacts

- `docs/research/2026-06-22-phase-1-storage-transcription.md`
- `docs/architecture/decisions/0003-phase-1-local-transcription.md`
- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-22-1059-architecture-telegram-audio-compatibility.md`

## Decisions

- Do not use filename extensions as the media authority.
- Preserve original Telegram bytes and provider-neutral provenance.
- Store Telegram identifiers as provenance, not as sole durable identity.
- Test OGG/Opus and simulated remote-source ingestion before Phase 2.

The authoritative decision is ADR-0003.

## Verification

- Official Telegram Bot API documentation confirmed separate voice, audio, and
  document objects; MIME/file metadata; and non-global `file_id` behavior.
- Official Telegram TDLib documentation confirmed voice notes normally use Opus
  in an OGG container, with MP3 and M4A handled as regular audio.
- `python3 scripts/validate_repository.py .` passed.
- `git diff --check` passed.
- Final diff review confirmed that Telegram-specific types remain outside core
  storage, search, normalization, and transcription contracts.

## Blockers and Open Questions

- No blocker exists. Actual Telegram network acquisition remains Phase 2 scope.
- Phase 2 must define its bot-download authorization, size limits, retry, and
  retention behavior.

## Process Audit

The refinement happened before audio interfaces or schemas were implemented,
avoiding migration work. Research was limited to official Telegram sources.
Exact token metrics are unavailable because this session was not captured by
the repository capture script.

## Follow-up

1. Implement the provider-neutral source and media descriptors in Phase 1.
2. Add OGG/Opus and misleading-metadata contract fixtures.
3. Reuse these contracts when the Telegram adapter is designed in Phase 2.
