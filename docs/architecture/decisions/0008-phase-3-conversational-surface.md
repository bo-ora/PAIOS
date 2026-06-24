# ADR-0008: Phase 3 Conversational Surface — Recency, Inline Actions, Summarize, and Dialogue State

Status: Accepted
Date: 2026-06-24

## Context

Phase 3 ("Conversational Recall",
`docs/requirements/phase-3-conversational-recall.md`) adds metadata/recency
retrieval, whole-record view and summarize, and multi-turn dialogue. ADR-0007
governs the grounded/assist *mode contract*; this ADR records the reversible
*technical surface* the four capabilities need, all behind the existing
messaging (ADR-0005) and synthesis (ADR-0006) interfaces, with no new npm
runtime dependency and no new storage columns. The user confirmed two reversible
UX choices on 2026-06-24: a persistent mode toggle (ADR-0007) and inline
**View**/**Summarize** buttons.

## Decision

### Recency / metadata retrieval (capability A)

- Add a pure store query `listRecords(dataRoot, filter)` to
  `knowledge/records.ts`: ordered by `capturedAt` descending, optional
  `sourceType` filter, optional workspace scope (matching the
  `externalReference` chat/thread provenance written by ADR-0005), and a bounded
  limit. It reads existing columns only — **no schema change** — and makes **no
  model call**.
- Add a `recall` intent distinct from `ask`: structural phrases ("latest",
  "recent", "my last voice note", "what did I capture today", optionally by
  type) resolve to a `listRecords` call, not lexical search. Content questions
  still route to `ask`. The grammar is keyword/pattern based (reversible) and
  lives in `telegram/intent.ts`.

### Whole-record view + inline actions (capability B)

- Extend `/show <id>` to return the record's **full normalized text** (bounded
  to a safe Telegram reply length with truncation indicated), not only metadata.
- **Extend the `MessagingProvider` interface** (ADR-0005) minimally and behind
  the boundary: `sendReply` accepts optional inline action buttons, and the
  provider exposes inbound `callback_query` updates as a new transport-neutral
  `InboundMessage` kind (`callback`) carrying an opaque action payload and the
  originating workspace. The Telegram adapter implements this with the existing
  built-in `fetch` (`reply_markup.inline_keyboard` on `sendMessage`,
  `getUpdates` `callback_query`, and `answerCallbackQuery`) — **no new npm
  dependency**.
- Capture confirmations and recency listing entries attach **View** and
  **Summarize** buttons whose callback payload encodes the action and record id
  (e.g. `view:<id>`, `sum:<id>`). Tapping routes to the same `/show` /
  `/summarize` handlers. Payloads are bounded and validated; an unknown or
  unservable payload returns a clear message and acknowledges the callback.

### Summarize (capability B)

- Add a second operation to the synthesis boundary rather than overloading
  grounded Q&A: `AnswerSynthesisProvider.summarize({ records })` (or a sibling
  `SummarizationProvider` implemented by the same Ollama adapter), with a
  summarize-specific prompt that transforms the user's own selected whole
  record(s) and does not fabricate beyond them. The source record id(s) are
  always surfaced by the caller, as with grounded answers. Selection is by id,
  by inline button, by "this/that" (last viewed/captured record in the
  workspace), or by a recent set from `listRecords`.

### Dialogue + mode state (capability C, supports ADR-0007)

- Add an **in-memory, per-workspace dialogue store**: a bounded ring of recent
  turns plus the current mode, keyed by `workspaceKey`. It is **TTL'd** (turns
  older than a fixed window are dropped) and **never persisted** — not to the
  durable store, not to disk, not to Git. It is lost on restart by design.
- Follow-up turns may pass recent context to the model for phrasing/reference
  resolution only; retrieval and the grounding guarantee are unchanged. Default
  TTL and turn count are reversible constants (initial defaults: keep the last
  ~8 turns within a ~30-minute window).

### Voice (capability D)

- Configuration only: the whisper model tier is selected by the existing
  `PAIOS_WHISPER_MODEL_PATH`, and language uses the transcriber's existing
  `auto` default (ADR-0003 pipeline unchanged). The tier is chosen from live A/B
  evidence; a repository A/B harness already exists under `tests/paios/` and is
  reused for the comparison.

- **Resolved (2026-06-24, live A/B, user-chosen tier): `large-v3-turbo-q5_0`.**
  On a real ~19s Ukrainian voice note transcribed on this CPU, five tiers were
  compared against the user's ground-truth text (`base`, `small`, `medium-q5`,
  full `medium`, `large-v3-turbo-q5`). `large-v3-turbo-q5_0` (≈547 MB, ≈2.9 s)
  was the most accurate by a clear margin — it was the only tier to get the
  proper name *Зоряною*, the nationality *українець*, *мовою*, and *звуть* all
  correct; its only residual errors were two declension endings and the foreign
  toponym *Oviedo*, which **no** tier transcribed cleanly. Full `medium` (1.46 GB)
  was *less* accurate than turbo, so size did not predict accuracy here.
  - This **supersedes the earlier "`small` default / `large-v3` ruled out"
    framing.** That ruling was about plain `large-v3`'s CPU *latency*; the user
    explicitly relaxed the latency constraint (accuracy-first, longer processing
    acceptable for voice notes), and the large-v3 **turbo** distill delivers
    near-large-v3 accuracy at ≈2.9 s — within tolerance. Plain `large-v3`
    (non-turbo, ≈3 GB, ~10–20 s) remains unused.
  - Evidence: `docs/sessions/2026-06-24-phase-3-conversational-recall.md`.

## Alternatives Considered

- **Command-hint-only view (no buttons)** — offered to the user; the user chose
  inline buttons for daily-use feel. Buttons cost a small, bounded adapter
  extension, fully reversible behind `MessagingProvider`.
- **A Telegram library (grammY/telegraf) for inline keyboards** — rejected for
  the same reason as ADR-0005: the Bot API surface is four endpoints of
  HTTP/JSON; built-in `fetch` keeps the zero-runtime-dependency posture.
- **Overloading grounded `synthesize` for summaries** — rejected: summarization
  is generative over selected content, not grounded Q&A; a distinct operation
  keeps the grounding contract clean and testable.
- **Persisting dialogue/mode to the store or a local file** — rejected:
  conversation is not knowledge (see ADR-0007); in-memory TTL'd state is the
  most privacy-preserving option and satisfies the "ephemeral, local-only,
  never persisted" requirement.
- **New `recall` columns/indexes** — unnecessary; `capturedAt` and `sourceType`
  already exist and recency volume is small.

## Consequences

- The messaging interface grows by one optional `sendReply` field and one
  inbound `callback` kind; the Telegram adapter owns a little more Bot API wiring
  (inline keyboards, `answerCallbackQuery`), covered by fake-transport tests.
- Recency retrieval is instant and model-free; it removes half the "feels
  unusable" pain without latency cost.
- Dialogue state is process-local: a restart degrades to single-turn until the
  conversation rebuilds, losing no captured knowledge.
- Every addition is reversible behind the existing interfaces; core capture/ask
  logic and its tests are unaffected except where deliberately extended.

## Validation

- Unit-test `listRecords` ordering, type filter, workspace scope, limit, and the
  empty result; unit-test the `recall` vs `ask` intent split.
- Unit-test the inbound `callback` normalizer and payload validation (known,
  unknown, oversized); test allowlist enforcement applies to callbacks too.
- Integration-test (fake `MessagingProvider`) the full view/summarize button
  round-trip: confirmation with buttons → callback → full record / summary, with
  no live network.
- Integration-test (fake synthesis provider) summarize over a selected record
  and a recent set; verify source ids are surfaced and nothing is persisted.
- Unit-test dialogue-store TTL/eviction and that no code path writes context to
  the store, disk, or Git.
- Live local smoke test (recorded) per AGENTS.md for the model-dependent slices
  (whisper tier A/B; Ollama multi-turn in both modes).
