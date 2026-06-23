# Session: Research — Phase 3 options exploration and Garmin data-access

Date: 2026-06-24
Role: research
Status: completed

## Objective

Evolve the Phase 2 Telegram assistant from "faithful grounded recall" toward
genuine daily usefulness, and refine ONE focused Phase 3 scope before any code,
at ~$0 recurring operating cost and preserving local-first privacy, zero new
npm runtime deps, and stable provider boundaries. Produce a marked exploration
artifact and end at a scope decision gate — no implementation or plan.
Mid-session the user added that they bought a Garmin Vivoactive 6 (arriving
2026-06-27), extending the objective to settle $0/local Garmin data access.

Completion criteria: a `docs/research/` exploration; a recommended smallest
Phase 3 slice; the decisions needed to lock scope; a Garmin access comparison;
all scope decisions taken by the user.

## Outcome

- The motivating problem was reframed precisely: lexical retrieval fails on
  *structural* and *meta/conceptual* queries; most felt pain is metadata
  selection (cheap, $0) — NOT embeddings (Phase 6). The grounding-vs-conversation
  tension was identified as the core product decision.
- Phase 3 scope was locked as **"Conversational Recall"** (reordered ahead of
  Health Journal): A) metadata/recency retrieval, B) whole-record view +
  summarize, C) multi-turn dialogue under a two-mode contract, D) whisper `small`
  + auto-detect voice. All $0/local, behind existing interfaces, no new npm deps.
- Wishlist items were re-decomposed across phases: YouTube → Phase 3b; group
  chats → MTProto phase; reminders/scheduling/news → Phase 5; SDLC → Phase 7+.
- Garmin $0/local access was settled: Connect "Export Your Data" is the
  ToS-clean baseline; unofficial `garminconnect` (auto-sync) deferred to the
  Wearable phase; the official Health API is ruled out (business-use only).

## Artifacts

Created this session:

- `docs/research/2026-06-23-phase-3-options.md` — exploration + locked decisions
  (sections "Update 2026-06-24" and "Decisions Locked 2026-06-24").
- `docs/research/2026-06-24-garmin-vivoactive-6-data-access.md` — access paths,
  comparison, recommendation, and items to validate once the device arrives.
- Auto-memory (outside the repo): `garmin-vivoactive-6.md`,
  `phase-3-conversational-recall.md`, and `MEMORY.md` index entries.

No commits made (commit not authorized). The modified `Brewfile`,
`scripts/bootstrap.sh`, `docs/operations/development-environment.md` and the
untracked `docs/superpowers/`, `scripts/shell/` were present at session start
and are NOT this session's work.

## Decisions

Taken by the user on 2026-06-24 (evidence: the research doc "Decisions Locked"
section; authoritative homes are the follow-up requirements/ADR/ROADMAP, not yet
written):

1. Reorder roadmap → Conversational Recall as Phase 3; Health Journal → 4;
   Wearable → 5.
2. Mode contract → two explicit modes (grounded default + opt-in assist). Future
   authority: ADR-0007.
3. Voice tier → whisper `small` + language auto-detect; A/B vs `medium-q5` in a
   live local smoke test; `large-v3` ruled out.
4. YouTube ingestion → Phase 3b fast-follow (not core).
5. Group chats → deferred to the dedicated MTProto/group phase.

Earlier sequencing decision (same day): Conversational Recall first, dedicated
Garmin/health phase right after; start Garmin access research now.

## Verification

- `python3 scripts/validate_repository.py .` → "Repository knowledge validation
  passed." (run after each research-doc write and after the locked-decisions
  edit).
- `git diff --check` → clean (no whitespace errors).
- Garmin claims grounded in web sources (verified, not from memory): Garmin
  Connect "Export Your Data" (FIT/WELLNESS/METRICS/SLEEPDATA); `garth` deprecated
  vs `garminconnect` actively maintained (v0.3.6, 2026-06-14); Garmin Connect
  Developer Program is business-use only. URLs cited inline in the access doc.
- Code reality confirmed by an Explore subagent map of `src/paios/telegram/` and
  `src/paios/synthesis/` (provider boundaries, lexical retrieval, whisper-cli
  invocation, store provenance).

## Blockers and Open Questions

- None blocking. Phase 3 scope is locked; the conversational core + voice work
  need no Garmin and are unblocked now.
- Open for the follow-up requirements session: exact mode-switch UX (command vs
  per-workspace default); summarize record-selection semantics; dialogue-context
  TTL/size.
- Open until the device arrives 2026-06-27: Vivoactive 6 USB/MTP FIT access;
  device-only wellness completeness; exact Connect export format for this
  account; FIT-parser choice (JS SDK vs npm vs Python service).

## Process Audit

- Strengths: routed via paios-project-workflow to the correct research role and a
  `docs/research/` artifact; used brainstorming to drive decisions one fork at a
  time; verified the three stated hard constraints (Telegram history/privacy
  mode, grounding tension, embeddings≠metadata) rather than trusting them;
  grounded Garmin claims with live web sources; kept the ~$0/local filter
  first-class; recorded durable state in auto-memory so a fresh session resumes
  on "what's next?".
- Parallelism: batched the four source-doc reads + the code-skim subagent in one
  turn; ran three Garmin web searches concurrently. Good token/wall-clock use.
- Deviations: none material. The new-context interrupts (Garmin purchase, then
  the arrival-date correction) were folded in without re-deriving prior work.
- Weak spots: the base exploration file is dated 2026-06-23 while the session ran
  2026-06-24; reconciled by dated "Update"/"Decisions Locked" sections rather
  than renaming (avoids churn in the doc that memory links to).
- No repeated reads, no unnecessary commands, no context loss. Token metrics from
  `scripts/capture_codex_session.py` are not available for this Claude Code
  session.

## Follow-up

Concrete next actions (a separate requirements-role session — resumable via
"what's next?", since auto-memory points to it):

1. Write `docs/requirements/phase-3-conversational-recall.md` from the locked
   scope.
2. Write `docs/architecture/decisions/0007-conversational-mode-contract.md`
   (grounded + assist two-mode contract).
3. Update `docs/ROADMAP.md`: reorder phases (the table still says "Phase 3 =
   Health Journal" — now stale) and refresh the Mermaid diagram + current
   position.
4. Commit the two research docs (and, with the above, the new requirements/ADR/
   roadmap) — commit was not authorized in this session.
5. Defer until 2026-06-27: validate the Garmin access assumptions against the
   physical device per the access doc's "To Validate" list.

Capability harvest (skills/commands/agents/prompts/hooks): see the harvest table
presented with this closeout — no new capability and no capability change is
proposed; no `docs/audits/` record is warranted (no reusable process failure).
