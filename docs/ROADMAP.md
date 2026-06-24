# PAIOS Roadmap

Status: Active  
Last reviewed: 2026-06-24
Next scheduled review: 2026-07-22

This file is the authoritative source for project phases, their state, user
value, deliverables, dependencies, and exit criteria. The Mermaid diagram is a
visual projection of the phase table. If they disagree, the table wins.

## Current Position

- Current phase: **Phase 3 — Conversational Recall** (in progress)
- State: **in-progress**
- Current value target: make the Telegram assistant genuinely usable to talk to
  — recency/metadata recall, whole-record view and summaries, multi-turn
  dialogue with a grounded-default / opt-in-assist mode contract, and
  Ukrainian+English voice — all $0/local.
- Next candidate: **Phase 4 — Health Journal**
- Roadmap confidence: Phases 0, 1, and 2 are completed. Phase 2 (Telegram Daily
  Assistant) was implemented behind stable messaging and answer-synthesis
  provider interfaces (ADR-0005, ADR-0006), reusing Phase 1 storage,
  transcription, and lexical search; it satisfied its exit criteria after the
  full local gate (lint, typecheck, 123 unit/integration tests with both
  provider boundaries faked, build, repository validation), a live local-model
  readiness and answer smoke test, and an independent review finding no critical
  or high privacy, data-loss, authorization, or correctness issue.
- Reorder (2026-06-24): Phase 2's exit evidence plus a documented "feels
  unusable for real conversation" signal — lexical search cannot serve
  meta/recency queries ("latest transcript", "summarize my notes") — justified
  inserting a focused usefulness phase ahead of Health Journal, per the
  reorder-on-evidence rule. Scope and the five locked decisions are recorded in
  `docs/research/2026-06-23-phase-3-options.md` ("Decisions Locked 2026-06-24");
  requirements in `docs/requirements/phase-3-conversational-recall.md`; the
  mode contract in ADR-0007. Health Journal → Phase 4, Wearable → Phase 5, and
  later phases shift down by one. Health data is sequenced right after because
  it generates exactly the meta/recency queries this phase enables.

## Visual Roadmap

```mermaid
flowchart LR
    P0["Phase 0<br/>Development Operating System<br/>COMPLETED"]
    P1["Phase 1<br/>Local Knowledge Loop<br/>COMPLETED"]
    P2["Phase 2<br/>Telegram Daily Assistant<br/>COMPLETED"]
    P3["Phase 3<br/>Conversational Recall<br/>APPROVED"]
    P4["Phase 4<br/>Health Journal<br/>PROVISIONAL"]
    P5["Phase 5<br/>Wearable Health Intelligence<br/>PROVISIONAL"]
    P6["Phase 6<br/>Durable Personal Automation<br/>PROVISIONAL"]
    P7["Phase 7<br/>Semantic Memory<br/>PROVISIONAL"]
    P8["Phase 8<br/>Personal Operations<br/>PROVISIONAL"]

    P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8
```

## Phase Table

| Phase | State | User value | Main deliverables | Depends on | Exit criteria |
| --- | --- | --- | --- | --- | --- |
| **0 — Development Operating System** | `completed` | PAIOS can be developed consistently and resumed after time away. | Codex operating model; requirements/ADR/plan/session/audit structure; RED–GREEN capability evaluations; repository validation; local raw-session capture; TypeScript `./paios status`; roadmap and debt tracking; one audited delivery cycle. | None | Status CLI passes lint, typecheck, tests, build, human/JSON acceptance checks; roadmap appears in status; CI, delivery session, process audit, and phase review are committed. |
| **1 — Local Knowledge Loop** | `completed` | Capture personal knowledge locally and find it later with sources. | CLI and inbox capture; Markdown/text and repository-document ingestion; audio-file transcription; local durable storage; lexical/full-text search; sourced retrieval. | Phase 0 | A note, document, and audio recording can each be captured, stored, searched, and retrieved offline with source references. |
| **2 — Telegram Daily Assistant** | `completed` | Use PAIOS naturally during daily life from Telegram. | Telegram workspace model; text, voice, and document capture; transcription; knowledge search; source-backed answers; safe command/approval boundaries. | Phase 1 | Telegram can capture supported inputs and answer from the local knowledge base with traceable sources and no silent data loss. |
| **3 — Conversational Recall** | `in-progress` | Make the Telegram assistant genuinely usable to talk to, entirely $0/local. | Metadata/recency retrieval (latest/recent, by type/workspace, no model); whole-record view (tap-to-view via `/show`) and summarize selected records; multi-turn dialogue with a grounded-default / opt-in-assist mode contract (replies labelled; assist never asserts personal facts without grounded retrieval); Ukrainian+English voice (whisper `small` + language auto-detect, live-validated against `medium-q5`). Behind the existing messaging and synthesis provider interfaces; reuses the Phase 1 store and audio pipeline; no new npm runtime deps. | Phase 1; Phase 2 | From Telegram the user can list/recall records by recency and type without a model, view and summarize whole records, hold a multi-turn conversation in either mode with the grounding guarantee preserved in grounded mode, and transcribe Ukrainian and English voice notes at the locked tier — verified by faked-boundary tests plus a live local smoke test, with no personal data leaving the machine and no conversation persisted to the durable store. |
| **4 — Health Journal** | `provisional` | Understand manually recorded health observations before relying on wearable APIs. | Symptoms, habits, workouts, sleep observations, manual measurements, CSV/JSON imports, sourced trend reports. | Phase 1; optionally Phase 2–3 | The user can record and import health data, review trends, and trace every conclusion to source records. |
| **5 — Wearable Health Intelligence** | `provisional` | Automate collection and analysis of health metrics. | Replaceable wearable adapters; normalized health model; synchronization; anomalies; trends; correlations; recommendation safeguards. | Phase 4 | At least one wearable provider synchronizes reliably through an adapter, and normalized insights remain traceable and recoverable. |
| **6 — Durable Personal Automation** | `provisional` | Run long-lived personal workflows that survive interruptions. | Scheduling; approval gates; checkpoints; retries; resumability; execution history; cancellation; failure recovery. | Phase 0; informed by real Phase 1–5 workflows | A useful multi-step workflow survives restart and recoverable failures without losing approved state or history. |
| **7 — Semantic Memory** | `provisional` | Discover related knowledge that keyword search misses. | Embeddings; semantic retrieval; entity/relationship linking; rebuildable indexes; retrieval evaluation. | Phase 1 with documented lexical-search failures | Semantic retrieval improves an approved evaluation set while source records remain authoritative and indexes remain rebuildable. |
| **8 — Personal Operations** | `provisional` | Extend PAIOS into a broader personal executive assistant. | Personal CRM; project and recurring-workflow management; dashboards; mobile interfaces; cross-domain planning. | Validated needs from earlier phases | At least one broader personal-operations workflow delivers repeatable value without weakening privacy, portability, or replaceability. |

## State Definitions

| State | Meaning |
| --- | --- |
| `provisional` | Candidate direction derived from the vision; sequencing and scope are not approved. |
| `proposed` | A concrete value boundary exists but requirements are not approved. |
| `refining` | Requirements discovery is active. |
| `approved` | Requirements and exit criteria are approved; implementation has not started. |
| `in-progress` | Approved deliverables are being implemented and verified. |
| `blocked` | Progress requires a documented decision or external condition. |
| `completed` | Exit criteria and phase audit are complete. |
| `deferred` | Intentionally postponed with a recorded reason. |

## Roadmap Rules

- Every phase must deliver standalone user value.
- Later phases may be reordered when evidence changes value or dependency
  assumptions.
- A phase cannot become `approved` without authoritative requirements and exit
  criteria.
- A phase cannot become `completed` without verification evidence and a
  roadmap/vision review.
- At most one phase may be executing (`in-progress` or `blocked`) at a time.
- Between implementation phases, the first `refining` or `approved` phase is
  the current phase.
- New scope belongs in the smallest phase that can deliver it independently.
- Technical shortcuts and deferred quality work must be recorded in
  `docs/TECH_DEBT.md`.

## Review Triggers

Review this roadmap:

- when a phase completes;
- before approving the next phase;
- after a major requirements or architecture change;
- when implementation diverges from phase deliverables;
- monthly while active, even if no phase completes.

Store dated reviews under `docs/reviews/`.
