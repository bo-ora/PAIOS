# Phase 2: Telegram Daily Assistant

Status: Approved
Date: 2026-06-23

## Purpose

Phase 2 makes PAIOS usable during ordinary daily life through Telegram, without
sitting at the repository CLI. It puts capture and retrieval — the loop proven
in Phase 1 — behind a conversational interface the user already carries on their
phone.

Telegram is the primary interface for the product vision
(`docs/requirements/INITIAL.md`). Phase 2 establishes that interface for the
capabilities that already exist locally (capture, transcription, lexical
search) and adds source-backed answering, while keeping every byte of personal
data and every derived index under the same local ownership and recovery
guarantees as Phase 1.

Phase 2 is complete when, from Telegram, the user can capture supported inputs
into the local knowledge base and receive answers that cite traceable local
sources, with no silent data loss and explicit boundaries around any action
that changes state or runs a command.

## User Value

- Capture a thought, voice note, or document from the phone in the moment,
  without opening a terminal.
- Ask a question in plain language and get an answer grounded in previously
  captured personal knowledge, with sources to verify it.
- Keep separate contexts (chats, topics, threads) as separate workspaces.
- Trust that nothing captured is silently dropped and nothing destructive
  happens without an explicit approval step.
- Retain full local ownership: Telegram is a transport, not a data store.

## Primary Workflows

### Connect and Authorize

- A single configured Telegram bot serves one trusted user.
- The bot receives messages by **long-polling** the Telegram API; it requires no
  public endpoint and works behind NAT/firewall.
- Only an explicit allowlist of Telegram chat/user identifiers is served; any
  message from an unlisted identity is ignored or refused without processing.
- The bot token and the allowlist are configuration, never committed; a
  documented `.env.example`-style template lists the required keys with safe
  placeholders.

### Capture from a Message

The user can send, from an authorized workspace:

- **text** — captured as a note, equivalent to `knowledge add-note`;
- **voice / audio** — downloaded to local managed storage and transcribed
  locally, equivalent to `knowledge add-audio`;
- **document** — supported Markdown and plain-text attachments captured,
  equivalent to `knowledge add-file`.

Each capture returns a confirmation that includes the stable record identifier,
so the user can later inspect or trace the record. Capture success is reported
only after the durable Phase 1 record is committed.

### Ask a Question

The user can ask a natural-language question in an authorized workspace and
receive a **synthesized answer in plain language with inline citations**, drawn
only from the local knowledge base. The answer is produced by retrieving the
relevant local records (Phase 1 lexical search) and passing them, with the
question, to a local answer-synthesis model.

In all cases:

- The answer must cite the specific local records it is based on (record
  identifiers and source references), inline.
- The assistant must answer only from the retrieved local sources; it must not
  present a claim it cannot trace to a captured source.
- When no relevant source is found, the assistant says so rather than inventing
  an answer.
- Personal content used for synthesis must not leave the machine in Phase 2
  (see *Privacy and Security* and *Approved Decisions*).

### Workspace Model

- Each Telegram chat, and each forum topic/thread within a chat, is an
  independent workspace with its own conversational context.
- Workspace identity is recorded on captured records so retrieval and answers
  can be scoped to or attributed to a workspace.
- Phase 2 does not require cross-workspace merging, sharing, or multi-user
  collaboration.

### Commands and Approvals

- Phase 2 exposes only capture, ask, and inspect intents; all execute directly
  within the authorized workspace.
- Phase 2 has **no state-changing or system commands** from Telegram. There is
  therefore no command-approval flow to build in this phase, and arbitrary
  shell or code execution from Telegram is out of scope.
- A future phase may add a minimal, approval-gated command allowlist; the
  in-chat approval pattern is deferred to that focused follow-up.

## Source and Storage Model

- Telegram is transport only. All durable knowledge continues to live in the
  Phase 1 managed local data directory under ignored `.local/paios/`.
- Inbound media (voice, documents) is downloaded into managed local storage
  using the same copy-on-import guarantee as Phase 1, so retrieval never depends
  on Telegram's servers.
- Records captured via Telegram are the same durable record type as Phase 1,
  with added provenance: source channel (`telegram`), workspace identity, and
  original message reference.
- Derived search data and any conversation state remain rebuildable from
  durable records.

## Reliability and Recovery

- No supported inbound message is silently dropped: every received message is
  either captured, explicitly refused with a reason, or recorded as a
  recoverable failure the user is told about.
- Transient failures (download, transcription, send) are retried or surfaced;
  they never leave a half-written record reported as success.
- If the bot is offline, messages are recovered on reconnect to the extent
  Telegram's API allows, and any unrecoverable gap is reported rather than
  hidden.
- A restart loses no captured knowledge; in-flight processing leaves a
  recoverable `pending` or `failed` record, consistent with Phase 1.

## Privacy and Security

- Personal content captured through Telegram is ignored by Git, exactly as in
  Phase 1.
- The bot serves only allowlisted identities; unauthorized messages are not
  processed or stored.
- The bot token and any provider credentials are secrets, never committed, and
  loaded from local configuration.
- Telegram inherently routes messages through Telegram's servers; this transport
  exposure must be documented as a known boundary, distinct from PAIOS's own
  storage which stays local.
- Answer synthesis in Phase 2 runs on a **local model only**; retrieved
  personal content used for synthesis must not leave the machine, preserving
  the Phase 1 local-first guarantee. Synthesis must work offline after the model
  is installed.
- The answer-synthesis model sits behind a stable, replaceable provider
  interface. Introducing any non-local (cloud) provider is a separate future
  decision requiring its own privacy disclosure and per-use boundary; the
  default must never silently send personal content off the machine.
- Logs must not print full personal content or secrets.

## Technical Constraints

- Extend the existing repository-local TypeScript CLI/service and reuse the
  Phase 1 storage, transcription, and search interfaces rather than duplicating
  them.
- Keep the Telegram integration behind a stable interface so the messaging
  provider is replaceable and core logic does not depend on Telegram directly.
- Keep the answer-synthesis capability behind a stable, replaceable model
  provider interface, consistent with the vendor-neutrality rule in `AGENTS.md`.
  Phase 2 ships a local-model adapter only; the interface must allow a cloud
  adapter to be added later without changing core logic.
- Reuse the existing build, lint, typecheck, test, and CI workflow. Integration
  tests must not depend on a live Telegram connection or a live synthesis model;
  the messaging and model boundaries must be testable with fakes.
- Prefer the smallest architecture that satisfies the capture, recovery, and
  source-traceability requirements.

## Out of Scope

- Image and PDF understanding, OCR, and office-document extraction (still
  deferred from Phase 1).
- Multi-user accounts, sharing, or collaborative workspaces.
- Autonomous software-engineering execution, multi-agent orchestration, or
  scheduled/proactive messaging initiated by the assistant.
- Health-specific schemas or analysis (Phase 3+).
- Semantic/vector retrieval and embeddings, unless an answer-synthesis decision
  explicitly introduces them under their own approval.
- Arbitrary command or code execution from Telegram.
- Continuous background daemons beyond what is required to receive messages.

## Acceptance Criteria

- An authorized user can capture a text note, a voice message, and a supported
  document from Telegram; each becomes a durable Phase 1 record with a returned
  identifier, traceable back to the originating message and workspace.
- A voice message is transcribed locally and its transcript is searchable and
  linked to the original managed audio.
- An unauthorized identity's messages are not processed or stored.
- The user can ask a question in a workspace and receive a synthesized answer,
  produced by a local model from retrieved local records, with inline citations
  to the specific records used; an unanswerable question is reported as such
  rather than fabricated, and no personal content leaves the machine.
- No supported inbound message is silently dropped; refusals and failures are
  reported and recoverable.
- A restart and recovery test demonstrates no loss of captured knowledge and
  correct recovery of in-flight processing.
- No state-changing or system command can be triggered from Telegram in Phase 2.
- Lint, typecheck, unit tests, integration tests (with messaging and model
  boundaries faked), build, repository validation, and GitHub Actions pass.
- An independent review finds no unresolved critical or high privacy,
  data-loss, authorization, or correctness issue.

## Approved Decisions

Approved by the user on 2026-06-23:

1. **Answer form:** synthesized answers in plain language with inline citations,
   produced only from retrieved local records.
2. **Model location:** local answer-synthesis model only in Phase 2, behind a
   stable, replaceable provider interface. A cloud provider (e.g. a hosted model
   such as Codex) is the anticipated future swap and is a separate decision with
   its own privacy disclosure; it is not part of Phase 2.
3. **Connectivity:** long-polling. No public endpoint or webhook in Phase 2.
4. **Command surface:** capture, ask, and inspect only. No state-changing or
   system commands from Telegram, and therefore no in-chat command-approval flow
   in Phase 2; deferred to a focused follow-up.

Selection of the specific Telegram client library, local model runtime, and
local model remain architecture decisions. Within this approved product
boundary, prefer inexpensive, reversible defaults and record them in ADRs
without an approval pause. Require explicit approval when a choice materially
affects privacy, data-loss risk, portability, recurring cost, or creates an
expensive migration.
