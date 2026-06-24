# Phase 3: Conversational Recall

Status: Approved
Date: 2026-06-24

## Purpose

Phase 2 shipped a Telegram assistant that captures text/voice/document into the
local store and answers questions with cited local sources, refusing when
nothing matches. It is correct but **feels unusable for real conversation**:
lexical (keyword) search cannot serve meta/recency queries — "what was the
latest transcript", "show my recent notes", "summarize my notes", "what is this
about" — because those queries share no keywords with the stored content, and a
one-shot grounded query box is not something you can *talk to*.

Phase 3 makes the assistant genuinely usable to talk to, entirely **$0/local**,
without weakening the Phase 2 grounding guarantee. It adds four capabilities,
all behind the existing messaging (ADR-0005) and answer-synthesis (ADR-0006)
provider interfaces, reusing the Phase 1 store and audio pipeline, with **no new
npm runtime dependencies**:

- **A — Metadata/recency retrieval** (no model): list and recall records by
  recency and type/workspace.
- **B — Whole-record view + summarize**: view a stored record in full
  (tap-to-view) and summarize selected records.
- **C — Multi-turn dialogue with a two-mode contract**: grounded by default
  (Phase 2 guarantee unchanged) plus an opt-in assist mode, replies labelled.
- **D — Ukrainian + English voice**: whisper `small` with language
  auto-detection, the tier locked after a live A/B against `medium-q5`.

Phase 3 is complete when, from Telegram, the user can recall records by recency
and type without a model, view and summarize whole records, hold a multi-turn
conversation in either mode with the grounding guarantee preserved in grounded
mode, and reliably transcribe Ukrainian and English voice notes — verified by
faked-boundary tests plus a live local smoke test, with no personal data leaving
the machine and no conversation persisted to the durable store.

## User Value

- Ask "what was my latest voice note" or "show my recent notes" and get an
  answer instantly, with no model and no guesswork.
- Tap a button on a capture confirmation to read the full stored transcript, and
  tap again to get a summary — no need to remember a record id.
- Summarize a record, or a recent set of records, in plain language.
- Hold an actual back-and-forth conversation: ask a follow-up that refers to the
  previous turn without repeating context.
- Choose, per chat, whether the assistant stays strictly grounded (cites
  sources, refuses otherwise) or may converse and brainstorm openly — and always
  know which contract is in force from the reply.
- Dictate Ukrainian and English voice notes and get usable transcripts.
- Retain every Phase 1/2 guarantee: data stays local, nothing is silently
  dropped, and the conversation itself is never written into the durable store.

## Primary Workflows

### A. Metadata and Recency Retrieval (no model)

The user can recall records by structure rather than content, served entirely by
a local store query with **no model call**:

- "latest"/"recent" listings, optionally filtered by type (note, voice/audio,
  document) and scoped to the current workspace.
- "my last voice note", "my recent notes", "what did I capture today".
- Each listed record shows its id, type, captured time, and title/excerpt, and
  is actionable (view/summarize) per the tap-to-view workflow.

Recency/metadata intents are recognised distinctly from content questions: a
structural query is answered from record metadata ordered by capture time and
filtered by type/workspace; it never routes through lexical search or the model.
When no records match the filter, the assistant says so plainly.

### B. Whole-Record View and Summarize

- **View:** `/show <id>` returns the record's full stored content (not only its
  metadata), bounded to a safe reply length with truncation indicated. Every
  capture confirmation and every recency listing entry carries an inline **View**
  button (Telegram inline keyboard + callback) that opens the full record without
  the user typing an id.
- **Summarize:** the user can summarize a selected record (`/summarize <id>`, an
  inline **Summarize** button, or "summarize this/that" referring to the last
  viewed/captured record) or a recent set ("summarize my recent notes / the
  latest transcript"). Summaries are produced by the local synthesis model over
  the selected whole record(s). Summarization is a **generative** operation
  distinct from grounded Q&A: it transforms the user's own selected content and
  does not fabricate beyond it; the source record id(s) are always shown.

### C. Multi-Turn Dialogue with Grounded / Assist Modes

- **Ephemeral context:** each workspace keeps a short, in-memory, TTL'd dialogue
  context (the last few turns). It is **never written to the durable knowledge
  base**, never committed to Git, and is naturally lost on restart; older turns
  expire by time. Follow-up questions may use this context for phrasing and
  reference resolution only.
- **Two explicit modes**, switched by a **persistent per-workspace toggle**
  (`/grounded` and `/assist`, alias `/chat`), default **grounded**:
  - **Grounded mode (default):** the unchanged Phase 2 contract — answers only
    from retrieved, cited local sources; refuses when no source matches.
  - **Assist mode (opt-in):** the model may reason, draft, brainstorm, and
    discuss openly, but is instructed and constrained so it does **not assert
    personal facts as if retrieved**. Any personal claim must still route through
    grounded retrieval (and surface its sources); an open-conversation reply that
    has no grounded backing must not state personal facts about the user.
- **Labelling:** every reply is labelled with the active contract so the user
  always knows which guarantee is in force (e.g. a grounded answer with sources
  vs. an `[assist]` reply, and an `[assist · grounded lookup]` reply when assist
  mode answers a personal-fact question via retrieval).

### D. Ukrainian + English Voice

- The voice pipeline uses whisper `small` with **language auto-detection**
  (Ukrainian + English), not a fixed language flag.
- The model tier is **locked by a live A/B** on the real development CPU:
  `small` (default) vs quantized `medium` (`medium-q5`), judged on Ukrainian
  transcription quality against interactive latency. `large-v3` is ruled out for
  this hardware. The final tier is the one explicit gate in this phase: the A/B
  evidence is presented and the winner chosen before the phase is declared done.

## Source and Storage Model

- Telegram remains transport only; all durable knowledge stays in the Phase 1
  managed local data directory under ignored `.local/paios/`.
- Recency/metadata retrieval reads existing record fields (`capturedAt`,
  `sourceType`, workspace provenance); **no new storage columns** are required.
- Summaries and assist-mode replies are **transient outputs**: they are sent to
  the user and not stored as records. Dialogue context is in-memory only.
- Derived search data and any conversation state remain rebuildable from, or
  subordinate to, the durable records; losing them loses no captured knowledge.

## Reliability and Recovery

- Every Phase 2 reliability guarantee is preserved: no supported inbound message
  is silently dropped; capture is acknowledged only after a durable record is
  committed; a restart loses no captured knowledge.
- Losing the in-memory dialogue context on restart is acceptable and expected;
  it never causes loss of captured knowledge and degrades only to single-turn
  behaviour until the conversation rebuilds.
- A tapped inline button (callback) that cannot be served (e.g. the record was
  removed) returns a clear message, never a crash or a half-action.

## Privacy and Security

- All synthesis (answers, summaries, assist replies) runs on the **local model
  only**; retrieved personal content and conversation context never leave the
  machine. The provider interface still permits a future cloud adapter as a
  separate, disclosed decision; the default must never silently send personal
  content off the machine.
- The conversation itself is private: dialogue context is in-memory, TTL'd, and
  never persisted to the durable store or Git.
- Assist mode must not assert personal facts it cannot ground; this is a privacy
  and trust guarantee, not only a correctness one.
- The allowlist, secret handling, and logging rules from Phase 2 are unchanged:
  logs never print message bodies, transcripts, summaries, conversation context,
  tokens, or secrets — only bounded identifiers, the active mode, and outcomes.

## Technical Constraints

- Extend the existing repository-local TypeScript CLI/service; reuse the Phase 1
  store and audio pipeline and the Phase 2 messaging and synthesis interfaces.
  Do not duplicate them.
- **No new npm runtime dependencies.** Inline keyboards and callback queries use
  the existing built-in-`fetch` Telegram adapter; the recency query uses the
  existing SQLite store; summarize/assist reuse the Ollama adapter.
- Keep all new behaviour behind the stable provider interfaces. The
  `MessagingProvider` extension for inline keyboards/callbacks, the summarize
  synthesis operation, and the dialogue/mode state must be testable with fakes;
  integration tests must not require a live Telegram connection or a live model.
- The voice change is configuration (model tier + `auto` language) plus the live
  A/B; it must not regress the Phase 1/2 transcription contract.
- Prefer the smallest architecture that satisfies the requirements; record
  reversible technical choices in ADRs (ADR-0007 mode contract; ADR-0008
  conversational surface) without an approval pause.

## Out of Scope

- YouTube / video ingestion (deferred to Phase 3b).
- Group chats, MTProto/user-client history indexing, and others'-message
  handling (deferred to the dedicated MTProto phase).
- Reminders, scheduling, news digests, and proactive/scheduled messaging
  (Phase 6 — Durable Personal Automation, plus an external-data decision).
- Embeddings / semantic (vector) retrieval — the *fuzzy* half of "summarize my
  notes" that metadata selection cannot reach (Phase 7 — Semantic Memory).
- Health-specific schemas or analysis (Phase 4+).
- Autonomous software-engineering execution and multi-agent orchestration.
- Any cloud/non-local model, or any outbound fetch of personal content.

## Acceptance Criteria

- From Telegram the user can list/recall records by recency and by type/workspace
  ("latest", "recent notes", "my last voice note", "what did I capture today")
  and receive an ordered, actionable result **with no model call**; an empty
  result is reported plainly.
- `/show <id>` returns the full stored record content (bounded, truncation
  indicated), and an inline **View** button on capture confirmations and recency
  listings opens the full record without typing an id.
- The user can summarize a selected record and a recent set of records; summaries
  are produced by the local model over the user's own selected content, show the
  source record id(s), and never fabricate beyond the selection.
- The user can hold a multi-turn exchange: a follow-up that references the prior
  turn is resolved using ephemeral, in-memory, TTL'd context that is never
  written to the durable store and is lost on restart without losing knowledge.
- Mode switching works: `/grounded` and `/assist` set a persistent per-workspace
  mode (default grounded); grounded mode preserves the Phase 2 guarantee
  (cited sources or explicit refusal); assist mode converses openly but never
  asserts a personal fact without grounded retrieval; every reply is labelled
  with the active contract.
- Ukrainian and English voice notes are transcribed with whisper `small` and
  language auto-detection; the `small`-vs-`medium-q5` tier is chosen from
  recorded live A/B evidence on the real CPU, with `large-v3` ruled out.
- No personal content leaves the machine; no conversation is persisted to the
  durable store or Git; logs contain no bodies, transcripts, summaries, context,
  or secrets.
- Lint, typecheck, unit tests, integration tests (messaging and model boundaries
  faked), build, and repository validation pass; the mandated live local smoke
  test (real whisper `small`-vs-`medium-q5` on a Ukrainian voice note; real
  Ollama multi-turn in both modes) is recorded as evidence.
- An independent review finds no unresolved critical or high privacy, data-loss,
  authorization, or correctness issue.

## Approved Decisions

Locked by the user on 2026-06-24 (see
`docs/research/2026-06-23-phase-3-options.md`, "Decisions Locked 2026-06-24"):

1. **Reorder:** "Conversational Recall" is the new Phase 3; Health Journal →
   Phase 4, Wearable → Phase 5, later phases shift down.
2. **Mode contract:** two explicit modes — grounded (default) + opt-in assist —
   with the constraints above; recorded in ADR-0007.
3. **Voice tier:** whisper `small` + language auto-detection, A/B against
   `medium-q5` in the mandatory live local smoke test; `large-v3` ruled out.
4. **YouTube ingestion:** deferred to Phase 3b (not in this slice).
5. **Group chats:** deferred to the dedicated MTProto/group phase.

Confirmed by the user on 2026-06-24 for this phase (reversible UX choices,
recorded here and in ADR-0008):

6. **Mode-switch UX:** a persistent per-workspace toggle via `/grounded` and
   `/assist` (alias `/chat`), default grounded, with the active mode labelled on
   every reply.
7. **Tap-to-view UX:** inline **View**/**Summarize** buttons (Telegram inline
   keyboard + `callback_query`) on confirmations and recency listings, using the
   existing built-in-`fetch` adapter with no new npm runtime dependency.

Selection of the specific intent grammar, dialogue TTL/turn count, summary
prompt, reply-label wording, and inline-keyboard layout remain reversible
implementation decisions; prefer inexpensive defaults and record them in ADRs
without an approval pause. The final voice tier is the one explicit approval
gate, taken on live A/B evidence.
