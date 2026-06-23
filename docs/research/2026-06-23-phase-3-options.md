# Phase 3 Options Exploration — Making the Telegram Assistant Genuinely Useful

Status: Exploration — NOT approved scope
Date: 2026-06-23
Role: research + requirements exploration
Author: Claude Code session

> This document explores the option space for evolving the Phase 2 Telegram
> assistant from "faithful grounded recall" into something useful in daily
> practice. It is **evidence and alternatives**, per the knowledge model. It does
> not approve scope, sequence, or architecture. It ends at a decision gate for
> the user. No implementation or plan is produced here.

## Objective

Phase 2 shipped a Telegram bot that captures text/voice/document into the local
Phase 1 store with provenance, transcribes voice locally (whisper.cpp), and
answers questions via lexical search + a local Ollama model with inline
citations, refusing when no source matches. It is correct but feels unusable for
real conversation, because **lexical (keyword) retrieval cannot serve
meta/conceptual queries** ("summarize my notes", "what was the latest
transcript", "what is this audio about") — those queries share no keywords with
the stored content.

Goal: find the smallest next slice that makes the assistant feel genuinely
useful day-to-day, at **~$0 recurring operating cost**, while preserving the
non-negotiables: local-first privacy (personal data never leaves the machine by
default), no new runtime npm dependencies where practical, and stable
replaceable provider interfaces.

## Hard Constraints Verified (not taken on trust)

These shape feasibility for several wishlist items and are confirmed factual:

1. **Telegram Bot API cannot read group history before the bot joined, and with
   group privacy mode it sees only messages addressed to it.** A bot added to a
   group with the default privacy mode ON receives only: commands (`/cmd`),
   replies to the bot's own messages, and `@mention`s of the bot. It never
   receives other members' ordinary messages, and it has **no API to fetch
   messages sent before it joined**. Reading full or historical group
   conversation requires a **user client (MTProto)** — Telethon (Python),
   GramJS/MTKruto (JS) — which logs in *as the user* with `api_id`/`api_hash` and
   a phone number. That is a different trust/ToS class (a userbot can be flagged;
   it acts with full account permissions) and a different auth model. **Flag:**
   wishlist items 3 (group history) and 4 (index existing group from the
   beginning) cannot be done with the current bot; they need an MTProto client
   and an explicit privacy/ToS decision. This is its own phase, not Phase 3.

2. **"Chat like a person" is in direct tension with the Phase 2 grounding rule**
   ("never assert a claim it cannot trace to a source"). This is a product
   decision, not a detail. Resolution sketch below: explicit *modes*.

3. **"Summarize my notes / what is this about" does NOT require embeddings.** It
   requires either (a) passing whole record(s) to the model by *metadata*
   selection (latest, this workspace, this id, today) — cheap and easy, $0 local;
   or (b) semantic retrieval (embeddings) for fuzzy topical matching — that is
   Phase 6. These must be separated. Most of the felt pain is (a), not (b).

4. **Reminders and scheduled jobs are a different data class** (ephemeral,
   TTL'd, scheduler-driven) and overlap Phase 5 (Durable Personal Automation).
   News digests touch the public internet (breaks local-only for that feature)
   and calendar briefings touch an external API. **Flag:** these are not $0/local
   by default and belong to Phase 5+, not Phase 3.

## Hardware Reality (drives cost/feasibility of local models)

Development machine: Intel Core i7-8850H, 16 GiB RAM, **no discrete GPU**, macOS.
Everything local runs on CPU. Consequences:

- whisper.cpp `base` (~142 MB) is fast but weak on Ukrainian. `small`/`medium`
  improve Ukrainian markedly but are slow on this CPU; `large-v3` (~3 GB) is best
  quality but likely too slow for interactive voice turnaround here.
- The current synthesis model is `llama3.1:8b` via Ollama — already near the
  comfortable ceiling for an 8th-gen CPU with 16 GiB RAM. Heavier conversational
  models will be slow. Embeddings (Phase 6) via `nomic-embed-text` are cheap even
  on CPU, so cost is not the blocker for Phase 6 — complexity and eval are.

All "local" options below are **$0 recurring** but pay a **latency** cost on this
hardware. That latency, not money, is the real budget for Phase 3.

## Option Inventory

Each capability is rated: **Value** (to daily use), **Effort**, **Op-cost**
($0/local vs paid), **Feasibility/constraints**, **Privacy**, **Phase** it
really belongs to.

### A. Metadata & recency retrieval ("what was the latest transcript", "show my recent notes")

- **Value: High.** This is half the felt "unusable" pain. These are *structural*
  queries (by time, type, workspace), not content search — lexical search will
  never answer them and shouldn't try.
- **Effort: Low.** A list/filter over the existing Phase 1 store (order by
  `capturedAt`, filter by `sourceType`/workspace). No model call.
- **Op-cost: $0/local.** No model needed.
- **Feasibility: High.** Store already records `capturedAt`, `sourceType`,
  workspace provenance. New intents: "latest", "recent", "my last voice note".
- **Privacy: None.** Pure local read.
- **Phase: 3 (core).**

### B. Whole-record operations: tap-to-view transcript + "summarize this / summarize recent"

- **Value: High.** Directly serves wishlist #1 (tap capture confirmation to view
  the stored transcript) and the "summarize my notes / what is this audio about"
  pain — via metadata selection, not embeddings.
- **Effort: Low–Medium.** `/show <id>` (inspect) already exists; add an inline
  keyboard button on capture confirmations that triggers it. "Summarize" = fetch
  selected record(s) by id/recency/workspace and pass full text to the existing
  Ollama provider with a summarize prompt (a non-grounded-recall use of the same
  model behind the same interface).
- **Op-cost: $0/local.**
- **Feasibility: High.** Reuses store + synthesis provider. Note: summarization
  is a *generative* operation, distinct from grounded Q&A — see mode decision (C).
- **Privacy: None** (local model, local data).
- **Phase: 3 (core).**

### C. Conversational, multi-turn dialogue with explicit modes (resolves the grounding tension)

- **Value: High.** Wishlist #2. Turns the bot from a one-shot query box into
  something you can talk to.
- **Effort: Medium.** Two sub-parts: (1) ephemeral per-workspace dialogue context
  (last N turns, TTL'd, never written to the durable KB); (2) **explicit modes**
  to resolve the tension with the grounding rule:
  - **Grounded mode (default, the Phase 2 contract):** answers only from cited
    local sources; refuses otherwise. Unchanged guarantee.
  - **Conversational/assist mode (opt-in):** the model may reason, draft, and
    discuss openly, but is prompted and labelled so it does **not** assert
    personal facts as if retrieved; any personal claim still routes through
    grounded retrieval. Clearly marked in the reply so the user always knows
    which contract is in force.
- **Op-cost: $0/local.** Multi-turn raises latency (longer prompts on CPU).
- **Feasibility: Medium.** Dialogue state is new but ephemeral; the mode split is
  mostly prompt + reply-labelling discipline behind the existing synthesis
  interface. Likely warrants a small ADR (the mode contract is consequential).
- **Privacy: Low risk if ephemeral context stays local and TTL'd.** Must never
  silently persist conversation into the durable store.
- **Phase: 3 (core) — but the mode contract is the key product decision.**

### D. Better Ukrainian + English voice→text

- **Value: High** for a Ukrainian/English speaker; bad transcripts poison
  everything downstream.
- **Effort: Low** (config: model swap + language auto-detect) **but** constrained
  by hardware.
- **Op-cost: $0/local.**
- **Feasibility: Medium.** whisper.cpp supports Ukrainian. Quality scales with
  model size; on this CPU, `small`/`medium` is the realistic quality/latency
  sweet spot, `large-v3` likely too slow interactively. Add language
  auto-detection (or per-workspace language hint) instead of a fixed `-l`.
- **Privacy: None** (fully local).
- **Phase: 3 (core, but bounded by hardware) — pick a model tier as a decision.**

### E. YouTube / video-provider audio → transcript → summary → discuss

- **Value: Medium–High.** Wishlist #5; a genuinely useful "ingest a talk, then
  chat about it" capability.
- **Effort: Medium.** `yt-dlp` extracts audio locally → existing
  normalize/transcribe pipeline → store as a record → summarize (B) → discuss (C).
  Most of the chain already exists.
- **Op-cost: $0** for tooling, **but** it fetches from a third party.
- **Feasibility: Medium.** Reuses the audio pipeline. **Two flags:** (1) `yt-dlp`
  is a **new runtime binary dependency** (not npm; like ffmpeg/whisper-cli — fits
  the existing "external CLI behind an adapter" pattern, but is new surface). (2)
  Outbound request to YouTube reveals *what you fetch* to Google; **no personal KB
  data leaves the machine**, but it is the project's first deliberate outbound
  content fetch — document it as a boundary.
- **Privacy: Low** (outbound metadata to the video host; no personal data egress).
- **Phase: 3b (adjacent fast-follow) — coherent but separable from the
  conversation core.**

### F. Group chats where only the owner drives the bot (by mention), ignoring others

- **Value: Medium.** Wishlist #3 (partial).
- **Effort: Low–Medium** for the *forward* direction (act only on the owner).
- **Op-cost: $0/local.**
- **Feasibility: Medium.** The existing allowlist already restricts who the bot
  *acts for*; with privacy mode ON the bot only sees mentions/replies/commands
  anyway. Driving it by `@mention` + owner-id allowlist in a shared group is
  feasible. **But** "index that conversation's history from the beginning"
  (wishlist #4) is the part that needs MTProto — see Constraint 1. Split these.
- **Privacy: Medium.** A shared group means other people's messages may transit;
  must define exactly what (if anything) is stored and ensure non-owner input is
  ignored, not captured.
- **Phase: live-driving → 3 or 4 (small); history indexing → separate MTProto
  phase.**

### G. Indexing existing group history from the beginning

- **Value: Medium.** Wishlist #4.
- **Effort: High.** Requires an MTProto user client, phone-number auth, and
  session management — a whole new provider and trust model.
- **Op-cost: $0/local** for the client, but real ToS/account risk.
- **Feasibility: Constrained.** Not possible via the Bot API. Needs explicit
  approval of the privacy/ToS trade-off.
- **Privacy: High concern.** A userbot acts with full account permissions and can
  read everything the account can.
- **Phase: separate dedicated phase (not 3).** Recommend a standalone ADR before
  any work.

### H. Reminders (voice-settable, ephemeral, TTL'd, NOT in the KB)

- **Value: High** for daily life. Wishlist #6.
- **Effort: Medium.** Needs a small scheduler and an *ephemeral* store separate
  from the durable KB, plus durable-enough firing across restarts.
- **Op-cost: $0/local.**
- **Feasibility: Medium.** The `telegram serve` loop is already long-running, so a
  timer can piggyback. But "fires reliably across restart" is exactly Phase 5's
  durability concern, and Phase 2 deliberately avoided durable background jobs.
- **Privacy: Low** (local).
- **Phase: 5 (Durable Personal Automation).** A non-durable toy version is
  possible in 3 but would violate the restart-survival expectation; recommend
  deferring to 5 where it is done properly.

### I. Scheduled background jobs (news digest, "your schedule today" briefing)

- **Value: Medium–High** but feature-dependent.
- **Effort: High.** Scheduler + external data sources + personalization.
- **Op-cost: news/calendar are NOT $0/local** — news digest pulls the public
  internet; a calendar briefing needs an external calendar API. Both break the
  local-only default for that feature and add external dependencies.
- **Feasibility: Constrained by the $0/local and privacy goals.** A purely-local
  "briefing from your own captured records" (e.g. "what did I capture yesterday")
  *is* $0/local and feasible — but that is really B+A on a schedule.
- **Privacy: Medium–High** for anything touching external services.
- **Phase: 5 (scheduling) + a separate external-data decision.** Keep external
  data out of Phase 3.

### J. Revive the deferred SDLC / self-development ambition (drive the dev lifecycle via Telegram)

- **Value: High long-term, low near-term.** Wishlist #9 / INITIAL.md's Priority 0.
- **Effort: Very high.** Multi-agent orchestration, durable workflows, command
  execution with approval gates — explicitly out of Phase 2 scope and spanning
  most of the original vision.
- **Op-cost: mixed** (local models cheap; hosted models for hard reasoning are
  paid — and would send code/prompts off-machine, a privacy decision).
- **Feasibility: Low for now.** Depends on the durable workflow engine (Phase 5)
  and a command/approval surface that Phase 2 deliberately deferred.
- **Privacy: High** if hosted models touch the repo.
- **Phase: 7+ / its own track.** Defer firmly; do not fold into Phase 3.

## Re-decomposition Across Phases

| Capability | Belongs to |
| --- | --- |
| A. Metadata/recency retrieval | **Phase 3 (core)** |
| B. Whole-record view + summarize | **Phase 3 (core)** |
| C. Multi-turn dialogue + grounded/assist modes | **Phase 3 (core)** |
| D. Better UK/EN voice (model tier + auto-detect) | **Phase 3 (core, hardware-bounded)** |
| E. YouTube ingest → transcript → discuss | **Phase 3b (adjacent fast-follow)** |
| F. Owner-only live driving in groups | Phase 3 or 4 (small) |
| G. Group **history** indexing (MTProto) | **Separate MTProto phase** + ADR |
| H. Reminders (ephemeral) | **Phase 5** |
| I. Scheduled jobs / news / briefings | **Phase 5** + external-data decision |
| J. SDLC self-development via Telegram | **Phase 7+ / own track** |

## Recommendation — Smallest Phase 3 Slice ("Conversational Recall")

The motivating problem is *conversation*, not health. Phase 2's exit evidence
plus the "feels unusable" signal is exactly the kind of evidence the roadmap
rules accept for **reordering** later phases. Recommend inserting a focused
usefulness phase before Health Journal.

**Phase 3 = "Conversational Recall": make the assistant usable to talk to,
entirely $0/local.** Smallest coherent bundle:

1. **A — Metadata/recency retrieval.** "latest transcript", "recent notes",
   by-type/by-workspace listing. No model. Kills half the pain immediately.
2. **B — Whole-record view + summarize.** Inline "view transcript" button on
   capture confirmations (reusing `/show`), and "summarize this / summarize
   recent / what is this about" by passing selected records to the local model.
3. **C — Multi-turn dialogue with explicit grounded vs assist modes.** Ephemeral,
   TTL'd, local-only context; a clear, labelled mode contract that preserves the
   Phase 2 grounding guarantee in grounded mode while allowing open conversation
   in assist mode.
4. **D — Voice quality: choose a whisper model tier (likely `small`/`medium`) and
   add language auto-detection** for Ukrainian + English, bounded by this CPU's
   latency.

Why this set: it is the **complete answer to "feels unusable for real
conversation,"** every item is **$0/local**, none needs MTProto, a scheduler, or
external data, and all of it sits behind the **existing messaging and synthesis
provider interfaces** (C may warrant one small ADR for the mode contract). It
reuses the store, the audio pipeline, and the Ollama adapter — minimal new
surface, no new npm runtime deps.

**Deliberately excluded from the core slice** (to keep it small): E (YouTube)
as an adjacent 3b; F-live as a small optional add; everything else pushed to its
proper later phase per the table.

## Logical Evolution Path

1. **Phase 3 — Conversational Recall (A–D).** Assistant becomes pleasant to talk
   to, $0/local.
2. **Phase 3b — Content ingestion (E).** YouTube/video → transcript → discuss,
   reusing the audio pipeline; first documented outbound-fetch boundary.
3. **Phase (Health Journal, formerly 3).** Now sits on a genuinely usable
   conversational surface — health observations captured and discussed naturally.
4. **Phase 5 — Durable automation:** reminders (H) and local scheduled briefings
   (I, local-only variant) done properly with durability/restart-survival.
5. **Phase 6 — Semantic memory:** embeddings (`nomic-embed-text`, $0/local) for
   fuzzy topical retrieval — the *fuzzy* half of "summarize my notes" that A/B's
   metadata selection cannot reach. Justified once lexical-search failures are
   documented (the roadmap already requires this evidence).
6. **Separate MTProto phase:** group history indexing (G), behind an explicit
   privacy/ToS ADR.
7. **External-data decision + Phase 7:** news/calendar (I-external) and the SDLC
   ambition (J).

## Decisions Needed to Lock Phase 3 Scope

1. **Reorder the roadmap?** Insert "Conversational Recall" as the next phase
   ahead of Health Journal, per the roadmap's reorder-on-evidence rule? (The
   whole exploration assumes yes; confirm.)
2. **Mode contract (the core product decision):** approve the grounded-default +
   opt-in-assist-mode design for resolving conversation vs grounding? Or keep
   grounded-only and drop open conversation from Phase 3?
3. **Voice model tier:** accept `small`/`medium` whisper + language auto-detect as
   the Ukrainian/English target on this CPU (quality vs latency), explicitly
   ruling `large-v3` out for now?
4. **YouTube ingestion (E):** include as Phase 3b now, or defer? (Decides whether
   we accept `yt-dlp` as a new runtime binary and the first outbound-fetch
   boundary.)
5. **Owner-only group driving (F-live):** in scope for this phase, or deferred
   with history indexing to the MTProto phase?

## Approval Gate

```
Recommendation: Reorder the roadmap to insert "Phase 3 — Conversational Recall"
  (capabilities A–D, all $0/local, behind existing provider interfaces) ahead of
  Health Journal; treat YouTube ingestion (E) as an optional Phase 3b; defer
  reminders/scheduling/news (H, I), group-history/MTProto (G), and the SDLC
  ambition (J) to their proper later phases.
Decision: Confirm the reorder and answer decisions 2–5 above, so the next
  session can write approved Phase 3 requirements (and the mode-contract ADR).
Artifact (only after approval — none created in this research session):
- `docs/requirements/phase-3-conversational-recall.md` (new requirements)
- `docs/architecture/decisions/0007-*.md` (grounded/assist mode contract, if approved)
- `docs/ROADMAP.md` (reorder Phase 3; Health Journal shifts later)
Verification (for the eventual implementation, not this session):
- Faked-boundary unit/integration tests for new intents (metadata retrieval,
  summarize, dialogue context, mode switching).
- One live local smoke test per AGENTS.md: real whisper model tier on a
  Ukrainian voice note, and a real Ollama multi-turn exchange in both modes,
  with recorded evidence.
- `python3 scripts/validate_repository.py .`, `git diff --check`, full diff review.
```

This research session is read-only: no requirements, ADR, plan, or code were
created. The files above are the paths the *next* (requirements) session would
create after the user approves scope.

## Update 2026-06-24 — Garmin Vivoactive 6 acquired; sequencing decided

New context: the user bought a Garmin Vivoactive 6 (arriving 2026-06-27) and is
committed to using it in PAIOS. This turns the previously-provisional Health
Journal and Wearable Health Intelligence phases into high-confidence next-up
work, and likely **merges/compresses** them toward *Garmin import* rather than
manual symptom logging.

Decisions taken by the user on 2026-06-24:

1. **Sequencing: "Conversational Recall" (A–D) remains the next phase, with a
   dedicated Garmin/health phase right after it.** Rationale: health data
   generates exactly the meta/conceptual queries ("how did I sleep this week",
   "summarize my workouts") that the current lexical bot cannot answer — so
   Conversational Recall is the substrate that makes health data *usable*, not a
   detour from it. It is also $0/local and needs no device, so it is unblocked
   now. No data is lost by sequencing health second: Garmin Connect retains full
   history for lossless later backfill.
2. **Garmin $0/local data-access research: start now** (device not required).
   Delivered as
   [2026-06-24-garmin-vivoactive-6-data-access.md](2026-06-24-garmin-vivoactive-6-data-access.md):
   recommends the Garmin Connect "Export Your Data" path as the $0/local,
   ToS-clean baseline (lossless history backfill, no stored credentials),
   deferring the unofficial `garminconnect` auto-sync to the Wearable phase; the
   official Health API is ruled out (business-use only).

Unchanged: the Phase 3 ("Conversational Recall") scope and the five open
decisions above. The Garmin context affects the phase *after* Phase 3, not
Phase 3's scope. Health/wearable still need their own approved requirements
before implementation.

## Decisions Locked 2026-06-24

All five scope decisions were taken by the user:

1. **Reorder:** confirmed. Insert "Conversational Recall" as the new Phase 3;
   Health Journal → Phase 4, Wearable → Phase 5, and later phases shift down.
2. **Mode contract:** **two explicit modes** — grounded (default; cites sources,
   refuses otherwise, unchanged Phase 2 guarantee) + opt-in assist/chat mode
   (open conversation that never asserts personal facts without grounded
   retrieval; replies labelled with the active mode). Warrants ADR-0007.
3. **Voice tier:** default whisper.cpp **`small` + language auto-detection**
   (Ukrainian + English); A/B against quantized `medium` (`medium-q5`) in the
   mandatory live local smoke test on the real CPU and lock the winner. Rule out
   `large-v3` for now.
4. **YouTube ingestion:** **Phase 3b fast-follow** — not in the core slice;
   reuses the audio pipeline; adds `yt-dlp` (new binary) and PAIOS's first
   documented outbound-fetch boundary.
5. **Group chats:** **deferred** to the dedicated MTProto/group phase (live
   driving + history indexing + others'-message privacy handled as one piece).

### Locked Phase 3 ("Conversational Recall") scope

In: A (metadata/recency retrieval), B (whole-record view + summarize), C
(multi-turn dialogue with the two-mode contract), D (`small`+auto-detect voice,
live-validated). All $0/local, behind the existing messaging and synthesis
provider interfaces, reusing the Phase 1 store and audio pipeline; no new npm
runtime deps. Out: YouTube (→ 3b), groups (→ MTProto phase), reminders/
scheduling/news (→ Phase 5), SDLC ambition (→ Phase 7+).

Next authoritative artifacts (a separate requirements session):
`docs/requirements/phase-3-conversational-recall.md`,
`docs/architecture/decisions/0007-*.md` (mode contract), and the `docs/ROADMAP.md`
reorder.
