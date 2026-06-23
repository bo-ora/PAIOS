# ADR-0005: Telegram Messaging via Built-in Fetch Behind a Messaging Provider Interface

Status: Accepted
Date: 2026-06-23

## Context

Phase 2 (`docs/requirements/phase-2-telegram-daily-assistant.md`) makes the
Phase 1 capture/retrieve loop usable from Telegram. The approved decisions fix
the product boundary: long-polling transport (no public endpoint), an allowlist
of trusted chat/user identifiers, capture/ask/inspect intents only, and every
byte of personal data staying local. The requirements leave the **specific
Telegram client library** as a reversible architecture decision, and require
that Telegram sit behind a stable interface so the messaging provider is
replaceable and core logic never depends on Telegram directly.

Two constraints shape the choice. First, the existing CLI deliberately has
**zero runtime npm dependencies** (`AGENTS.md`); TypeScript and `@types/node`
are dev-only. Second, the requirements ask for "the smallest architecture that
satisfies the capture, recovery, and source-traceability requirements" and
integration tests that do not touch a live Telegram connection.

The Telegram Bot API surface Phase 2 needs is small: `getUpdates` (long-poll),
`sendMessage`, `getFile`, and an authenticated file download. All are plain
HTTPS GET/POST calls returning JSON. Node 24 ships a stable global `fetch`.

## Decision

- **Implement the Telegram client with Node's built-in `fetch`** against the
  Bot API. Do **not** add a third-party Telegram library (`telegraf`, `grammY`,
  `node-telegram-bot-api`). This preserves the zero-runtime-dependency posture,
  is the smallest thing that works, and is fully reversible: a library can be
  introduced later behind the interface below without touching core logic.
- **Define a transport-neutral `MessagingProvider` interface** that core logic
  depends on. It exposes only: poll for a batch of inbound messages
  (acknowledging a delivery cursor), send a text reply to a workspace, and
  download a referenced attachment to in-memory bytes. The Telegram adapter is
  the sole implementation in Phase 2.
- **Normalize inbound updates to a transport-neutral `InboundMessage`** before
  core logic sees them, carrying: workspace identity (chat id plus optional
  forum thread/topic id), sender id, provider message id, a `kind`
  (`text` | `voice` | `audio` | `document` | `unsupported`), text body or an
  opaque attachment reference, the original filename and claimed MIME type when
  present, and the message timestamp. Telegram-specific types never cross into
  storage, search, or transcription — matching the provenance contract already
  anticipated in ADR-0003.
- **Enforce the allowlist at the adapter boundary.** Updates whose chat/user id
  is not in `TELEGRAM_ALLOWED_CHAT_IDS` are dropped before any download,
  storage, or model call, and are never persisted.
- **Persist the long-poll cursor** (`update_id` offset) under the git-ignored
  `.local/` data root so a restart resumes from the last acknowledged update.
  An update is acknowledged to Telegram only after its capture record is
  durably committed (or explicitly recorded as failed), so a crash mid-capture
  re-delivers rather than silently drops. Telegram retains undelivered updates
  for ~24h; any longer gap is reported, not hidden.
- **Workspace identity** is the `(chatId, threadId?)` pair, stored as record
  provenance via the existing `externalReference` map (source channel
  `telegram`, chat id, thread id, message id), so retrieval and answers can be
  scoped to or attributed to a workspace without new storage columns.
- **Map media to the Phase 1 pipeline by bytes, not paths.** Downloaded voice/
  audio/document bytes are written to a temporary file under the data root and
  handed to the existing capture functions; provenance records the Telegram
  origin. No new transcription or storage engine is introduced.
- **Logs never print full message content, tokens, or the bot token** — only
  bounded identifiers and outcomes, consistent with the Phase 1 logging rule.

## Alternatives Considered

- **`grammY`** — modern, TypeScript-first, clean long-polling. Rejected as the
  default because it adds the project's first runtime dependency and a
  middleware framework for a four-endpoint need. It remains the most likely
  future swap if the bot grows; the `MessagingProvider` interface makes that
  swap local.
- **`telegraf` / `node-telegram-bot-api`** — popular but heavier and (the
  latter) dated; same dependency objection, less type safety.
- **Webhook transport** — explicitly out of scope; requires a public endpoint,
  contradicting the approved long-polling decision and the NAT/firewall goal.
- **A native binding** — unnecessary for an HTTP/JSON API and couples upgrades
  to an ABI.

## Consequences

- We own a small amount of Bot API wiring (retry/backoff on `getUpdates`,
  multipart-free JSON calls, file-path resolution for downloads) instead of
  importing it. This is bounded and covered by adapter tests with a fake
  transport.
- No dependency audit, supply-chain surface, or version churn from a Telegram
  library; the runtime stays dependency-free.
- Swapping to a library later is a contained change behind `MessagingProvider`;
  core capture/ask/inspect logic and its tests are unaffected.
- Long-poll cursor persistence gives at-least-once delivery with commit-before-
  acknowledge, satisfying the no-silent-drop and restart-recovery criteria.

## Validation

- Unit-test the inbound-update normalizer for each `kind`, missing fields, and
  forum-thread workspaces.
- Test allowlist enforcement: an unlisted identity's update is dropped before
  download/storage and leaves no record.
- Integration-test the full capture and ask flows against a **fake
  `MessagingProvider`** (scripted inbound batches, captured outbound sends, an
  in-memory attachment store) — no live network.
- Test cursor persistence and restart: acknowledge only after a committed
  record; a simulated crash before commit re-delivers and does not drop.
- Verify Telegram types never appear in storage, search, or transcription
  signatures (provenance-only, per ADR-0003).
- Verify logs contain no message bodies, tokens, or secrets.
