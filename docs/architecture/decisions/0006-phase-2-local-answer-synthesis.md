# ADR-0006: Local Answer Synthesis via Ollama Behind a Model Provider Interface

Status: Accepted
Date: 2026-06-23

## Context

Phase 2 adds source-backed answering: the user asks a natural-language question
in a workspace and receives a synthesized plain-language answer with inline
citations, drawn only from local records retrieved by Phase 1 lexical search.
The approved decisions fix the boundary: synthesis runs on a **local model
only** in Phase 2, behind a stable, replaceable provider interface; personal
content must not leave the machine; synthesis must work offline after the model
is installed; a cloud provider is an anticipated future swap requiring its own
privacy disclosure. The requirements leave the **specific local model runtime
and model** as reversible architecture decisions.

Provisioning already chose the runtime family: `brew "ollama"` is in the
Brewfile and `OLLAMA_HOST` / `PAIOS_SYNTHESIS_MODEL` are reserved in
`docs/operations/credentials.md` and `.env.example`, with the concrete model to
be named here (never pulled implicitly). The local Ollama instance currently
has `llama3.1:8b`, `qwen2.5-coder:7b-instruct`, `deepseek-coder-v2:lite`, and
`gemma3:1b` available. The development machine is an Intel Mac with 16 GiB RAM.

As with messaging (ADR-0005), the CLI keeps **zero runtime npm dependencies**;
Ollama exposes a local HTTP/JSON API reachable with Node's built-in `fetch`.

## Decision

- **Define a transport-neutral `AnswerSynthesisProvider` interface** that core
  logic depends on. Input: the user's question plus an ordered list of
  retrieved local records (id, title, source reference, text). Output: a
  synthesized answer string, the set of cited record ids, and an
  `answered | no-sources | refused` outcome. Core ask logic depends only on
  this interface.
- **Ship exactly one adapter in Phase 2: a local Ollama adapter** using the
  Ollama chat HTTP API at `OLLAMA_HOST` (default `http://127.0.0.1:11434`) via
  built-in `fetch`. No runtime npm dependency; no third-party SDK.
- **Default model: `llama3.1:8b`**, overridable by `PAIOS_SYNTHESIS_MODEL`. It
  is a general-purpose instruction-tuned model that runs locally and offline on
  the current 16 GiB machine and is already pulled. Rejected for the default:
  `qwen2.5-coder` and `deepseek-coder-v2` (code-tuned, not general QA),
  `gemma3:1b` (too small for faithful grounded synthesis). The model is pulled
  explicitly with `ollama pull`; it is **never downloaded implicitly** by the
  CLI, mirroring the Phase 1 model rule (ADR-0003).
- **Retrieval reuses Phase 1 `searchRecords`** against the same local index. No
  embeddings or vector store (explicitly out of scope unless separately
  approved).
- **Grounded prompting:** the adapter builds a prompt that supplies only the
  retrieved records as context, instructs the model to answer strictly from
  those sources, to cite the specific record ids it used inline, and to state
  that it cannot answer when the sources are insufficient. When retrieval
  returns nothing, the provider returns `no-sources` **without calling the
  model** — an unanswerable question is reported, never fabricated.
- **Privacy:** because the runtime is local Ollama, retrieved personal content
  never leaves the machine. The interface permits a future cloud adapter, but
  the default must never silently send personal content off the machine;
  introducing any non-local adapter is a separate, disclosed decision.
- **Determinism for tests:** core ask logic is exercised against a **fake
  `AnswerSynthesisProvider`**; no integration test calls a live model. A
  low temperature is used for the real adapter to keep answers grounded.
- **Logging** records the model name, record-id set, and outcome — never the
  question text, retrieved personal content, or the answer body.

## Alternatives Considered

- **llama.cpp `llama-cli` subprocess** (mirroring the Phase 1 `whisper-cli`
  pattern) — viable and dependency-free, but Ollama is already provisioned,
  manages model loading/serving, and gives a stable HTTP contract; the provider
  interface makes a later switch to a raw llama.cpp adapter cheap.
- **Embeddings / semantic retrieval for context selection** — out of scope for
  Phase 2; lexical search is the approved retrieval mechanism.
- **A larger or coder-tuned model as default** — heavier or mistuned for
  general QA on a 16 GiB machine; available via `PAIOS_SYNTHESIS_MODEL` for
  experimentation without a code change.
- **A cloud model (e.g. a hosted Codex/Claude)** — the anticipated future swap,
  but explicitly a separate decision with its own privacy disclosure; not part
  of Phase 2.

## Consequences

- Answering requires a one-time explicit `ollama pull llama3.1:8b` and a running
  local Ollama; a diagnostic reports readiness rather than failing opaquely,
  consistent with the Phase 1 `doctor` pattern.
- CPU inference on the Intel machine may be slow for long contexts; retrieved
  context is bounded to a small number of top records to keep latency and
  prompt size reasonable.
- Citations depend on the model following grounding instructions; the provider
  validates that cited ids belong to the supplied records and the ask flow
  surfaces the underlying sources regardless, so traceability does not rely
  solely on the model's text.
- Swapping the runtime or adding a cloud adapter is a contained change behind
  `AnswerSynthesisProvider`; core logic and its tests are unaffected.

## Validation

- Unit-test the prompt builder and the citation/grounding post-checks
  (cited ids must exist in the supplied records; empty retrieval yields
  `no-sources` without a model call).
- Integration-test the ask flow end to end against a **fake provider** for the
  answered, no-sources, and refused outcomes — no live model.
- An opt-in local integration test may exercise the real Ollama adapter, gated
  on a running instance and the pulled model; it is never part of the default
  suite.
- Verify no personal content path reaches a non-local destination and that
  synthesis works with the machine offline once the model is pulled.
- Verify logs contain no question text, retrieved content, answer body, or
  secrets.
