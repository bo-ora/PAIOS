# Roadmap and Vision Review: 2026-06-24

Review period: 2026-06-24 to 2026-06-24
Current phase: Phase 3 — Conversational Recall
Review trigger: phase boundary (Phase 3 completion)

## Executive Summary

Phase 3 ("Conversational Recall") is complete and meets its exit criteria. The
Telegram assistant is now genuinely usable to talk to: model-free recency/type
recall, whole-record `/show` view with inline View/Summarize buttons, a
generative summarize operation, multi-turn dialogue with a grounded-default /
opt-in-assist mode contract (grounded byte-for-byte identical to Phase 2; assist
never asserts a personal fact without grounded retrieval), and live-validated
Ukrainian+English voice. All work stayed $0/local with no new npm runtime
dependency, no personal data leaving the machine, and no conversation persisted
to the durable store. The roadmap still reflects the intended vision: Health
Journal (Phase 4) remains the right next step because it generates exactly the
meta/recency and summarize queries this phase enables.

## Evidence Reviewed

- Requirements: `docs/requirements/phase-3-conversational-recall.md` (scope A–D).
- ADRs: `0007` (grounded/assist mode contract), `0008` (conversational surface;
  Voice section now resolved to `large-v3-turbo-q5_0`).
- Plan: `docs/plans/2026-06-24-phase-3-conversational-recall.md` (V1–V3).
- Session evidence: `docs/sessions/2026-06-24-phase-3-conversational-recall.md`
  (full faked gate, independent review, two test-first fixes, voice A/B across
  five tiers on two real Ukrainian notes, Ollama multi-turn smoke, live-log
  privacy observation).
- Commits in range `079c6ab~1..` including `a11b934` (heuristic fix) and
  `9e499d3` (summarize-refusal fix).
- Independent code review: no Critical; one Important (fixed); three Minor
  (recorded as TD-005/006/007).
- Tests: 166 pass / 0 fail on Node 24; lint, typecheck, build, repository
  validation, `git diff --check` all green.

## Phase Assessment

- **Phase 3 deliverables:** all present and verified — A (recency/type recall,
  no model), B (whole-record view + inline actions + summarize), C (multi-turn
  grounded/assist with labelling and ephemeral in-memory state), D (voice tier
  live-validated). Exit criteria satisfied by faked-boundary tests **plus** a
  recorded live local smoke; grounding guarantee preserved in grounded mode; no
  personal data egress; no conversation persisted.
- **Two real defects** were caught by the review and live smoke and fixed
  test-first (assist over-routing; summarize refusal). The summarize refusal in
  particular was a genuine product-purpose bug only a live smoke could surface —
  reaffirming the AGENTS.md mandatory-live-smoke rule.
- **Next phase (Phase 4 — Health Journal):** user value and dependencies remain
  valid; it depends on Phase 1 (and optionally 2–3, now both delivered). No
  scope change indicated. The committed Garmin Vivoactive 6 (arriving
  2026-06-27) firms up Phase 5 but does not change Phase 4 sequencing.

## Vision and Roadmap Changes

- State transition: **Phase 3 `in-progress` → `completed`** (approved by this
  review). `docs/ROADMAP.md` Current Position, Visual Roadmap, and Phase Table
  updated accordingly; Current Position advances to Phase 4 as the active
  candidate.
- Voice-tier decision change recorded in ADR-0008 (turbo supersedes the earlier
  "small default / large-v3 ruled out" framing on the user's relaxed-latency,
  accuracy-first basis). No phase additions, removals, or reorderings.

## Technical Debt Review

- No `critical`/`high` items. TD-002 (`medium`, direct-to-master delivery)
  remains open; its trigger recurred but the bootstrap-phase decision to commit
  to `master` still holds for this single-developer phase. Three new `low`
  items added this session: TD-005 (workspace-scope inconsistency in
  recall/summarize/view), TD-006 (callback length-vs-byte bound), TD-007
  (`formatRecordView` header budget). All accepted; none block Phase 3 value.

## Risks and Assumptions

- Foreign proper nouns (e.g. the toponym *Oviedo*) are imperfectly transcribed
  by every available free local tier; acceptable, documented.
- Assist quality depends on the local model (llama3.1:8b); the grounding and
  no-fabrication guarantees are enforced in code and prompt, validated live.
- No new cost, credential, or external dependency introduced. Local-first,
  portable, replaceable architecture preserved.

## Decisions

- **Phase 3 is `completed`.** Authoritative: this review + the exit criteria in
  `docs/ROADMAP.md` Phase Table + session evidence.
- **Voice tier = `large-v3-turbo-q5_0`.** Authoritative: ADR-0008 Voice section.

## Actions

- Flip `docs/ROADMAP.md` Phase 3 state to `completed` and advance Current
  Position to Phase 4 (done in this change).
- Update the auto-memory index line for Phase 3 to "completed".
- Carry TD-005/006/007 to the next phase-boundary review.
- When Phase 4 is taken up, run `$paios-project-workflow` from requirements.
