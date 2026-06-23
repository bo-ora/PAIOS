# Garmin Vivoactive 6 — $0/Local Data Access Research

Status: Exploration — NOT approved scope
Date: 2026-06-24
Role: research (de-risk the future Garmin/health phase before the device arrives)

> Evidence and alternatives for getting Garmin Vivoactive 6 data into PAIOS at
> ~$0 recurring cost while preserving local-first privacy. Does not approve
> scope or architecture. The device arrives 2026-06-27; claims that require the
> physical device are marked as **to validate on/after 2026-06-27**.

## Objective

The user owns (incoming 2026-06-27) a Garmin Vivoactive 6 and is committed to
using it in PAIOS. This de-risks the Garmin/health phase (which follows the
recommended "Conversational Recall" phase — see
[2026-06-23-phase-3-options.md](2026-06-23-phase-3-options.md)) by settling
*how* health data can reach the local store at $0/local, and the ToS/privacy
trade-offs of each path. It does not implement anything.

## Constraint Recap

- **~$0 recurring operating cost.** No paid API or subscription.
- **Local-first.** Personal health data must not leave the machine by default;
  any path that authenticates to Garmin's cloud is an outbound boundary to
  document, distinct from PAIOS's own local storage.
- **Replaceable provider interface.** Per `AGENTS.md`, any wearable access sits
  behind a stable adapter; core logic must not depend on one vendor or one
  access method.
- **TypeScript-first codebase.** The CLI is TypeScript with no runtime npm deps.
  The best-maintained Garmin tooling is **Python** (`services/<name>/` is the
  sanctioned home for Python services per `AGENTS.md`), so some paths imply a
  Python sidecar or a JS equivalent — flagged per option.

## Access Paths

### Path 1 — Garmin Connect "Export Your Data" (bulk GDPR-style dump)

- **What:** Garmin Connect web → Account Management → *Export Your Data*. Garmin
  emails a ZIP (typically within 24–48h) containing original **FIT** files plus
  `WELLNESS`, `METRICS`, and `SLEEPDATA` files — heart rate, sleep, steps,
  stress, and proprietary metrics (Body Battery, training load) where supported.
- **Cost: $0.** No API, no fee.
- **ToS: clean.** Official, user-initiated export of one's own data.
- **Freshness: poor.** Manual, batch, 24–48h latency. Not suitable for "today's"
  data; suitable for periodic history backfill.
- **Privacy: strong.** No stored credentials, no automated cloud calls. One
  authenticated download initiated manually by the user.
- **Data completeness: high.** Includes wellness metrics that are computed in
  Garmin Connect (not just on-device), because the export is from the cloud
  account, which retains full history. **Delaying this loses no data** — Connect
  retains history, so backfill later is lossless.
- **Integration effort: medium.** Requires a **FIT parser**. PAIOS is
  TypeScript: options are Garmin's official **FIT SDK (JS)** or an npm FIT parser
  (`fit-file-parser`), or Garmin's *FIT CSV tool* / `python-fitparse` in a Python
  service. Either way a FIT-parsing dependency is new surface. The parsed records
  then flow through the existing Phase 1 copy-on-import + the CSV/JSON import that
  Health Journal already anticipates.
- **Verdict:** The **$0/local/ToS-clean baseline.** Best first integration:
  lossless history backfill with no credential storage.

### Path 2 — On-device FIT files over USB/MTP

- **What:** Plug the watch in; it mounts as storage exposing `GARMIN/Activity`
  FIT files. **To validate on/after 2026-06-27** for the Vivoactive 6 specifically
  (some newer/smaller Garmin devices restrict mass-storage access).
- **Cost: $0.** ToS: clean. Privacy: strongest (never touches the cloud).
- **Freshness: manual** (plug in when you want it).
- **Data completeness: partial.** Device FIT files cover *activities* well, but
  much daily wellness (sleep stages, Body Battery, stress) is **computed in
  Garmin Connect**, so device-only export is likely incomplete for wellness. **To
  validate on/after 2026-06-27.**
- **Integration effort: medium** (same FIT parser as Path 1).
- **Verdict:** Strongest privacy but likely incomplete for wellness; useful as a
  fully-offline supplement, not the primary path.

### Path 3 — Unofficial `garminconnect` library (automated cloud access)

- **What:** `cyberjunky/python-garminconnect` (Python) — actively maintained,
  **v0.3.6, 2026-06-14**, with a native auth engine that mimics the official app's
  mobile SSO. Programmatic access to HR, sleep, stress, body composition, SpO2,
  HRV, activities, etc. (Note: the older `garth` library is **deprecated** —
  Garmin changed the auth flow and broke it; do not build on `garth`.)
- **Cost: $0.** No fee.
- **ToS: gray.** Unofficial; uses your account credentials against a private API.
  Garmin can change auth and break it (as happened to `garth`), and automated
  access can in principle flag an account. Accept this risk explicitly if chosen.
- **Freshness: good.** Can poll near-daily for automated sync — the only path
  that enables "your sleep last night" without manual export.
- **Privacy: weaker.** Requires **storing Garmin credentials/session** locally
  and making **automated outbound calls** to Garmin's cloud. Personal health data
  still lands locally, but credentials-at-rest and recurring egress are new risk
  surface to secure and document.
- **Integration effort: medium–high.** Python → implies a **Python sidecar
  service** under `services/` behind a wearable adapter (or a JS equivalent such
  as the `garmin-connect` npm package, less battle-tested). New runtime surface
  and a secret to manage.
- **Verdict:** The only path giving automated freshness, at the cost of ToS gray
  area, stored credentials, and recurring egress. Defer to the proper Wearable
  phase behind an adapter; not needed for the first health slice.

### Path 4 — Official Garmin Health API / Connect Developer Program — RULED OUT

- **What:** Garmin's official Health/Activity APIs.
- **Why ruled out:** **Business use only.** The program requires applying as a
  legal entity (company, university, hospital, research institution); **personal-
  use applications are rejected.** No licensing fee for access itself, but it is
  categorically unavailable for an individual. Not a $0/personal option.

## Comparison

| Path | Cost | ToS | Freshness | Privacy | Completeness | Effort | Role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Connect export (bulk) | $0 | Clean | Poor (manual, 24–48h) | Strong | High | Medium (FIT parser) | **Baseline / history backfill** |
| 2. On-device FIT (USB) | $0 | Clean | Manual | Strongest | Partial (activities) | Medium | Offline supplement |
| 3. `garminconnect` (unofficial) | $0 | Gray | Good (auto) | Weaker (creds + egress) | High | Medium–High (Python svc) | Auto-sync, later phase |
| 4. Official Health API | n/a | n/a | n/a | n/a | n/a | n/a | **Ruled out (business only)** |

## Recommendation

**Stage the access the same way the phases are staged.** For the *first* Garmin/
health slice (after Conversational Recall), use **Path 1 (Connect export)** as
the $0/local/ToS-clean baseline — lossless history backfill, no stored
credentials, riding the Phase 1 import path. Treat the **FIT parser** choice
(JS FIT SDK vs npm parser vs Python service) as the one real architecture
decision and record it in an ADR. Defer **Path 3 (`garminconnect`)** automated
sync to the proper Wearable phase, behind a replaceable adapter, only once
manual import has proven the data model — and with an explicit privacy disclosure
for stored credentials and recurring egress. Keep **Path 2** as an optional
fully-offline supplement. **Path 4 is unavailable** for personal use.

This keeps the wearable adapter boundary honest: import-from-export and
auto-sync are two adapters behind one interface, so the cheap clean path ships
first and the gray-area path is added later without changing core logic.

## To Validate On/After 2026-06-27 (needs the physical device)

- Does the Vivoactive 6 expose FIT files over USB/MTP (Path 2 viability)?
- How complete is device-only wellness data vs the Connect export (sleep stages,
  Body Battery, stress)?
- Exact contents/format of *this account's* Connect export ZIP, to fix the import
  data model.
- A live local smoke test (per `AGENTS.md`): import a real export and confirm a
  metric (e.g. a night's sleep, a workout) is captured, traceable to source, and
  answerable through the Conversational Recall surface.

## Open Decisions (for the eventual Garmin/health phase, not now)

1. FIT parsing approach: JS FIT SDK / npm parser (stay in-process, TypeScript) vs
   a Python `services/` sidecar (unlocks `garminconnect` reuse later).
2. Whether auto-sync (Path 3) is in the first Wearable phase or deferred, given
   its ToS/credential/egress trade-offs.
3. Health data model: store Garmin metrics as Phase 1 records with provenance, or
   introduce a typed health schema (the original Health Journal deliverable).
