# Session: Requirements — Phase 4 Health Journal (Garmin data foundation)

Date: 2026-06-25
Role: requirements
Status: completed

## Objective

Take Phase 4 from `provisional` to approved requirements with exit criteria, so
the next phase has an authoritative artifact. Completion criteria: a requirements
doc under `docs/requirements/`, an updated roadmap, this session summary, and
passing repository validation.

## Outcome

Phase 4 was **redefined** through brainstorming. The user does not want manual
health journaling (the original Phase 4 premise); they own a Garmin Vivoactive 6
(arriving 2026-06-27) and want health data ingested automatically from Garmin
Connect dumps, normalized, and available to an AI agent — evolving over later
phases into daily insights/advice and a conversational health assistant.

The vision was decomposed into shippable slices. Phase 4 is scoped to the
**data foundation** only: ingest a Garmin Connect export → normalize into a
typed, source-traceable health schema → deterministic, model-free trend queries.
The old Phase 5 (Wearable) merges forward; automated cloud sync, local-LLM
insights/advice, and the conversational "doctor" become later phases.

## Artifacts

- Created `docs/requirements/phase-4-health-journal.md` (Approved,
  implementation-gated).
- Updated `docs/ROADMAP.md`: Current Position, redefine+reorder note, Mermaid
  P4/P5 nodes, and the Phase 4/5 table rows; last-reviewed → 2026-06-25.
- Created this session summary.
- Grounded in existing `docs/research/2026-06-24-garmin-vivoactive-6-data-access.md`.

## Decisions

Authoritative requirement: `docs/requirements/phase-4-health-journal.md`
("Approved Decisions"). Locked this session:

1. Phase 4 redefined as the Garmin-driven health data foundation; manual-journal
   premise dropped; old Phase 5 merges forward.
2. Scope = ingest + normalize + deterministic trends (no model). Insights/advice
   and the conversational assistant are later phases.
3. Garmin access = Path 1 (Connect export) only — $0, ToS-clean, no stored
   credentials, no egress. Path 3 auto-sync deferred behind the adapter.
4. Storage = typed, extensible health schema, with each import also registering a
   source record for traceability (light hybrid). To be recorded as an ADR.
5. Implementation gated on a real export (~2026-06-30); concrete v1 metric set
   and FIT-parser choice confirmed against the real export before completion.

## Verification

- `python3 scripts/validate_repository.py .` — passes (see terminal evidence).
- `git diff --check` — clean.
- Full diff reviewed; changes are docs-only (requirements, roadmap, session).
- No implementation in this session; behavior verification deferred to the
  implementation phase per the gated exit criteria.

## Blockers and Open Questions

- Implementation is blocked until a real Garmin Connect export is available
  (~2026-06-30), since the export format fixes the metric set and parser choice.
- Open decisions deferred to implementation start: concrete v1 metric set; FIT
  parser approach (JS in-process vs Python `services/` sidecar — future ADR);
  whether trend queries are exposed via Telegram in this phase or the next.

## Process Audit

- Brainstorming surfaced a roadmap conflict early (manual-journal premise
  rejected), avoiding wasted effort speccing the wrong phase.
- Reused the existing Garmin access-path research instead of re-deriving it.
- Downstream phase renumbering was intentionally kept minimal (P6–P8 untouched)
  to avoid speculative churn on still-provisional phases.

## Follow-up

- User reviews the written requirements spec before planning.
- Next: an implementation plan (`docs/plans/`) gated on the real export; ADRs for
  (a) typed health schema and (b) FIT-parser choice once the export format is
  known.
- When the device arrives (2026-06-27) and the export lands (~2026-06-30),
  confirm the v1 metric set and run the live local smoke test.
