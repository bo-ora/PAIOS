# ADR-0007: Grounded-Default / Opt-In-Assist Conversation Mode Contract

Status: Accepted
Date: 2026-06-24

## Context

Phase 2 guarantees that every answer is traceable to a cited local source and
that the assistant refuses rather than fabricates (ADR-0006). Phase 3
("Conversational Recall",
`docs/requirements/phase-3-conversational-recall.md`) must let the user actually
*talk to* the assistant — brainstorm, draft, ask open questions — which is in
direct tension with that grounding rule. The user locked the resolution on
2026-06-24: **two explicit modes**, not a single blended behaviour.

The risk to manage is privacy and trust, not only correctness: an open
conversational model can plausibly *invent personal facts* ("you said you'd
call your dentist") that the user would wrongly believe came from their own
records. The contract must make it impossible for an open reply to assert a
personal fact that was not actually retrieved, and must make the active
guarantee visible on every reply.

Synthesis stays local-only (ADR-0006) and behind the `AnswerSynthesisProvider`
interface; this ADR governs the *contract and routing*, not the runtime.

## Decision

- **Two modes, persistent per workspace, default grounded.** Each workspace
  (the ADR-0005 `(chatId, threadId?)` identity) has a current mode, defaulting
  to **grounded**. `/grounded` and `/assist` (alias `/chat`) switch it; the
  setting persists across turns until changed. Mode is **conversation state, not
  knowledge**: it lives in the same ephemeral, in-memory, TTL'd dialogue state as
  the turn history (ADR-0008) and is never written to the durable store.
- **Grounded mode is exactly the Phase 2 contract, unchanged.** Retrieve via
  Phase 1 lexical search, synthesize only from retrieved records, cite record
  ids, refuse when no source matches. No regression to ADR-0006 behaviour.
- **Assist mode may converse openly but may not assert personal facts.** The
  assist prompt instructs the model to reason, draft, and discuss using general
  knowledge, and **forbids stating facts about the user, their data, their
  history, or their plans** unless those facts come from grounded retrieval. When
  an assist-mode turn asks for a personal fact ("what did I note about X"), the
  turn is routed through grounded retrieval first; the personal claim is answered
  only from cited sources, and if retrieval is empty the assistant says it has no
  source rather than inventing one.
- **Every reply is labelled with the active contract.** Grounded answers carry
  their sources as today. Assist replies are prefixed `[assist]`. An assist-mode
  reply that answered a personal-fact question via retrieval is labelled
  `[assist · grounded lookup]` and still shows sources. The label is part of the
  reply contract, not decoration: the user must always be able to tell which
  guarantee produced a statement.
- **The grounding guarantee is enforced in code, not only in the prompt.**
  Personal-fact answers in either mode go through the existing grounded ask path,
  which surfaces the underlying record ids regardless of the model's text
  (ADR-0006). Assist mode cannot reach a code path that emits cited personal
  claims without retrieval having run.
- **Mode switching is not a state-changing/system command.** It only changes how
  the assistant talks in that workspace; it executes nothing and stores nothing,
  so it stays inside the Phase 2 "no state-changing command" boundary.

## Alternatives Considered

- **Single blended mode** that "stays grounded but chats when it can" — rejected:
  it makes the active guarantee invisible and invites exactly the invented
  personal-fact failure the user is protected from. The user explicitly chose two
  explicit modes.
- **Per-message prefix instead of a persistent toggle** (e.g. `!` for one-off
  assist) — considered and offered to the user; the user chose the persistent
  per-workspace toggle. The toggle is friendlier for a real back-and-forth; the
  per-reply label compensates for the "which mode am I in" risk.
- **Grounded-only (drop open conversation from Phase 3)** — rejected by the
  locked decision; it would not resolve the "feels unusable" signal.
- **Persisting mode/conversation to the store** — rejected: conversation is not
  knowledge; persisting it would violate the local-first, rebuildable-state, and
  privacy guarantees. Mode is ephemeral state.

## Consequences

- The Phase 2 grounding guarantee is preserved verbatim in the default mode; a
  user who never switches sees no behavioural change beyond the new recency/view/
  summarize capabilities.
- Assist mode adds real conversational value while bounding the trust risk: open
  replies are labelled and structurally barred from emitting ungrounded personal
  facts.
- Latency rises in assist mode (longer prompts/context on a CPU); this is
  accepted per the requirements' $0/local-with-latency-budget framing.
- The contract is reversible: removing assist mode or changing the switch UX
  touches only the dialogue/mode state and prompt selection behind the existing
  interface.

## Validation

- Unit-test mode resolution: default grounded; `/grounded`, `/assist`, `/chat`
  toggle and persist per workspace; an unrelated message does not change mode.
- Unit-test reply labelling for each path (grounded answer, grounded refusal,
  `[assist]` open reply, `[assist · grounded lookup]` personal-fact answer).
- Integration-test (fake synthesis provider) that an assist-mode personal-fact
  question with empty retrieval yields a no-source reply, never a fabricated
  personal claim, and that grounded mode is byte-for-byte the Phase 2 behaviour
  on the same inputs.
- Live local smoke test (recorded): a real Ollama multi-turn exchange in **both**
  modes, confirming grounded refusal still holds and assist replies are labelled
  and do not assert personal facts without retrieval.
- Revisit if a cloud adapter is ever introduced (separate disclosed decision):
  the personal-fact routing rule must hold across any provider.
