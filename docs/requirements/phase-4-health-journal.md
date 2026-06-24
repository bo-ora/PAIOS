# Phase 4: Health Journal (Garmin-driven health data foundation)

Status: Approved (implementation-gated on real export, ~2026-06-30)
Date: 2026-06-25

## Purpose

The roadmap originally scoped Phase 4 as a **manual** health journal, sequenced
before the wearable phase so that manually recorded observations would be
understood before relying on wearable APIs. That premise no longer holds: the
user does not want manual entry. The user owns a Garmin Vivoactive 6 (arriving
2026-06-27) and wants health data ingested **automatically from Garmin Connect
data dumps**, normalized, and made available to an AI agent for trend analysis,
daily insight, and — eventually — an on-demand conversational health assistant.

This is a deliberate, evidence-based reorder: Phase 4 is **redefined** as the
Garmin-driven health **data foundation** and effectively merges with what was
Phase 5 (Wearable Health Intelligence). The full "AI personal doctor" vision is
several shippable slices; Phase 4 delivers only the foundation every later slice
depends on:

1. **Ingest** — import a Garmin Connect "Export Your Data" ZIP losslessly.
2. **Normalize** — parse it into a typed, extensible health schema, every
   measurement traceable to its source file.
3. **Deterministic trends + agent access** — answer aggregate/trend queries over
   the typed data with **no model**, and expose the data so an AI agent and the
   existing recall surface can operate on it.

Everything is **$0/local**: no paid API, no stored credentials, no recurring
outbound calls in this phase. The official Garmin Health API is ruled out
(business-only); automated cloud sync carries credential, egress, and ToS
trade-offs and is deferred to a later phase behind a replaceable adapter (see
`docs/research/2026-06-24-garmin-vivoactive-6-data-access.md`).

Phase 4 is complete when a real Garmin Connect export can be imported, at least
one wellness metric and one activity are normalized into the typed schema and
traceable to their source file, a deterministic trend query returns correct
aggregates over a date range, and no health data leaves the machine — verified
by faked-boundary tests **plus** a live local smoke test against a real export.

## User Value

- Drop a Garmin Connect export into PAIOS and have the health data ingested
  losslessly, with no manual entry and no data silently dropped.
- Ask deterministic trend questions ("average sleep last week", "resting-heart-
  rate trend this month", "how many workouts in the last 30 days") and get
  correct answers computed directly from the data, with no model and no guesswork.
- Trace every number in a trend back to the source export file it came from.
- Have the normalized health data **available to an AI agent** as a structured,
  queryable surface — the substrate the later insight, advice, and assistant
  phases build on.
- Keep every prior guarantee: data stays local, the source export is preserved
  on import, and nothing requires Garmin credentials or network egress.

## Primary Workflows

### A. Import a Garmin Connect export (Path 1, $0/clean/local)

The user requests "Export Your Data" from Garmin Connect, receives the ZIP, and
imports it into PAIOS. The import:

- copies the source into managed local storage (the Phase 1 copy-on-import
  pattern) and registers a **source record** for traceability and recall;
- parses the contained FIT / wellness / metrics / sleep files into typed
  measurements;
- is **idempotent**: re-importing the same export (or an overlapping export)
  does not duplicate measurements;
- reports a summary of what was ingested (metric types, date range, counts) and
  never silently discards a recognized record.

No credentials are stored; no outbound network call is made.

### B. Normalize into a typed, extensible health schema

Parsed data is stored as structured measurements, not free text. Each
measurement carries at minimum: metric type, numeric value, unit, timestamp (or
interval), and source provenance (which import / source file it came from). The
schema is **extensible by metric type** so new Garmin metrics can be added
without reshaping the model. The concrete v1 metric set is confirmed against the
first real export (see Open Decisions).

### C. Deterministic trends and agent access (no model)

Aggregate and trend queries run directly on the typed schema — averages, ranges,
counts, min/max, and simple per-period trends over a date range — returning
**source-traceable** results with **no model call**. The data and these queries
are exposed so that an AI agent and the existing CLI/recall surface can operate
on the health data.

## Source and Storage Model

- **Source of truth:** the imported Garmin Connect export files, preserved
  locally on import (Phase 1 pattern). The typed measurements are a derived,
  rebuildable projection of those sources.
- **Typed health schema:** structured measurements `(metric type, value, unit,
  timestamp/interval, source provenance)`, alongside — not replacing — the Phase
  1 records store. Each import also registers a source record so the import is
  visible in the existing recall/`/show` surface.
- **Traceability:** every measurement and every trend result resolves back to
  the source export file.
- **Rebuildable:** the typed projection can be rebuilt from the preserved
  sources without data loss.
- **Adapter boundary:** Garmin access sits behind a replaceable wearable adapter
  per `AGENTS.md`; "import-from-export" is the first adapter implementation, and
  a later automated-sync adapter must fit the same interface without changing
  core logic.

## Reliability and Recovery

- Import is idempotent and re-runnable; partial or repeated imports do not
  duplicate or corrupt measurements.
- A malformed or unrecognized file in the export is reported, not silently
  dropped, and does not abort ingestion of the rest of the export.
- The typed projection is rebuildable from preserved source files.
- All existing backup/restore guarantees continue to cover the new data.

## Privacy and Security

- **$0/local, no egress:** this phase makes no outbound network call and stores
  no Garmin credentials. The only outbound boundary in the user's data flow is
  the manual, user-initiated export download from Garmin Connect, which happens
  outside PAIOS.
- Health data is personal and sensitive; it stays under local managed storage
  and the git-ignored `.local/` conventions. No health data is committed.
- Automated cloud sync (stored credentials + recurring egress + ToS-gray access)
  is explicitly **out of scope** and deferred to a later phase with its own
  privacy disclosure.

## Technical Constraints

- TypeScript-first; preserve local-first, portable, replaceable architecture.
- Garmin access behind a stable wearable adapter; core logic must not depend on
  one vendor or one access method.
- A **FIT parser** is new dependency surface. The parser choice (JS in-process
  FIT SDK / npm parser vs a Python `services/` sidecar) is an architecture
  decision deferred to an ADR, settled once the real export format is confirmed.
- The typed health schema vs records decision is recorded as an ADR.
- Verification follows `AGENTS.md`: a faked-boundary suite is necessary but not
  sufficient; a live local smoke test against a **real** export is required
  before completion.

## Out of Scope

- **Manual health journaling** — dropped; the user does not want manual entry.
- **Automated daily cloud sync** (unofficial `garminconnect` / Path 3:
  credentials, egress, ToS-gray) — deferred to the Wearable phase behind the
  adapter.
- **On-device USB/MTP FIT access** (Path 2) — optional offline supplement, not
  this phase.
- **Local-LLM daily insights and advice** — the next phase.
- **Conversational health assistant / on-demand "doctor" assessment, medical
  safety framing, and paid-model escalation** — a later phase with its own
  safety design.

## Acceptance Criteria

Phase 4 is `completed` only when all hold:

1. A real Garmin Connect "Export Your Data" ZIP is imported end-to-end with no
   stored credentials and no network egress from PAIOS.
2. The source export is preserved in managed local storage and registered as a
   source record visible in the existing recall surface.
3. At least one wellness metric (e.g., a night's sleep) **and** one activity are
   normalized into the typed health schema with correct value, unit, and
   timestamp.
4. Every imported measurement is traceable to its source export file.
5. A deterministic trend query (e.g., average sleep over a date range) returns
   the correct aggregate computed directly from the typed data, with **no model
   call**, and its result is source-traceable.
6. Re-importing the same export does not duplicate measurements (idempotent).
7. A malformed/unrecognized file is reported, not silently dropped, without
   aborting the rest of the import.
8. The typed projection can be rebuilt from preserved sources without loss.
9. Verified by faked-boundary tests **plus** a recorded live local smoke test on
   a real export; no health data leaves the machine; `git diff --check` clean and
   the full diff reviewed; repository validation passes.

## Approved Decisions

Locked 2026-06-25 (this session):

1. **Phase 4 is redefined** as the Garmin-driven health data foundation; the
   manual-journal premise is dropped and the old Phase 5 (Wearable) merges
   forward. Recorded as a roadmap reorder with rationale.
2. **Scope = ingest + normalize + deterministic trends** (slices 1–2 of the
   vision). Local-LLM insights/advice and the conversational "doctor" are
   explicitly later phases.
3. **Garmin access = Path 1 (Connect export)** only for this phase: manual,
   $0, ToS-clean, no stored credentials, no egress. Automated sync (Path 3) is
   deferred behind the adapter.
4. **Storage = typed, extensible health schema** for measurements, with each
   import also registering a source record for traceability and recall (a light
   hybrid). Recorded as an ADR.
5. **Verification timing:** implementation is **gated** on a real Garmin export
   being available (~2026-06-30); requirements are approved now, and the
   concrete v1 metric set and FIT-parser choice are confirmed against the real
   export before the phase can complete.

## Open Decisions (to settle at implementation start, against the real export)

1. **Concrete v1 metric set** — which Garmin metrics are in scope for v1 (sleep,
   resting HR, steps, stress, Body Battery, workouts, …), confirmed against the
   actual export ZIP contents and format.
2. **FIT parser approach** — JS in-process (FIT SDK / npm parser) vs a Python
   `services/` sidecar (which would also unlock later `garminconnect` reuse).
   Recorded as an ADR once the real format is known.
3. **Trend query surface** — exact CLI/recall commands and whether trend queries
   are exposed through the Telegram surface in this phase or the next.
