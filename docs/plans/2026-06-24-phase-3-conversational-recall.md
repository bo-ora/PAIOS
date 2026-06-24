# Phase 3 — Conversational Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Telegram assistant genuinely usable to talk to — recency/metadata recall, whole-record view + summarize with inline buttons, multi-turn dialogue with a grounded-default/opt-in-assist mode contract, and Ukrainian+English voice — entirely $0/local.

**Architecture:** Extend the existing repository-local TypeScript CLI/service behind the Phase 2 messaging (ADR-0005) and synthesis (ADR-0006) provider interfaces. Add a model-free recency query to the Phase 1 store, a generative summarize operation to the synthesis boundary, an in-memory TTL'd per-workspace dialogue/mode store, and a minimal `MessagingProvider` extension for Telegram inline keyboards + `callback_query`. Voice is configuration (whisper `small` + `auto` language) validated by a live A/B.

**Tech Stack:** Node.js 24, strict TypeScript, `node:sqlite`, `node:test`, built-in `fetch` (Telegram Bot API + Ollama HTTP), whisper-cli + ffmpeg (Phase 1 audio pipeline). Authoritative refs: `docs/requirements/phase-3-conversational-recall.md`, ADR-0007 (mode contract), ADR-0008 (conversational surface), ADR-0005, ADR-0006.

## Global Constraints

- **No new npm runtime dependencies.** TypeScript and `@types/node` are dev-only. Telegram and Ollama use built-in `fetch`.
- **No new storage columns.** Recency reads existing `capturedAt`, `sourceType`, and `externalReference` provenance.
- **Local-only.** No personal content, transcript, summary, or conversation context leaves the machine. No cloud adapter.
- **Conversation is not knowledge.** Dialogue context and mode are in-memory, TTL'd, never written to the durable store, disk, or Git; lost on restart by design.
- **Provider boundaries stay fakeable.** Integration tests must not require a live Telegram connection or a live model.
- **Logs** never print message bodies, transcripts, summaries, context, tokens, or secrets — only bounded identifiers, active mode, and outcomes.
- **Grounding guarantee preserved.** Grounded mode is byte-for-byte the Phase 2 contract; assist mode never asserts a personal fact without grounded retrieval.
- **Capability changes** (skill/command/agent/hook/prompt) follow the RED→GREEN protocol in `evals/codex/README.md`. This plan changes application code, not Codex capabilities; no eval scenario is required unless a step says so.
- **House style:** strict TypeScript, small modules, explicit public types, pure parsing/formatting with IO at boundaries, four-space indentation only for Python. Match surrounding code.
- **Per-slice gate before "done":** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `python3 scripts/validate_repository.py .`, `git diff --check`.

---

## File Structure

- `src/paios/knowledge/records.ts` — add `listRecords` (model-free recency/type/workspace query). Modify.
- `src/paios/telegram/intent.ts` — add `recall`, `summarize`, mode-toggle intents; callback parsing. Modify.
- `src/paios/telegram/recall.ts` — format recency listings + reply. Create.
- `src/paios/telegram/dialogue.ts` — in-memory TTL'd per-workspace dialogue/mode store. Create.
- `src/paios/telegram/messaging.ts` — extend `OutboundReply` with optional inline buttons; add inbound `callback` kind + `CallbackAction`. Modify.
- `src/paios/telegram/telegram-provider.ts` — inline keyboard send, `callback_query` polling, `answerCallbackQuery`. Modify.
- `src/paios/synthesis/provider.ts` — add `summarize` op + summarize prompt + assist prompt + reply-label helpers. Modify.
- `src/paios/synthesis/ollama-provider.ts` — implement `summarize` + assist synthesis. Modify.
- `src/paios/telegram/ask.ts` — add summarize orchestration + assist path + multi-turn context + labelling. Modify.
- `src/paios/telegram/assistant.ts` — route new intents/callbacks; thread dialogue store; attach buttons. Modify.
- `src/paios/cli.ts` — construct dialogue store; pass through serve; update help/usage. Modify.
- `tests/paios/telegram.test.ts`, `tests/paios/knowledge.test.ts`, `tests/paios/synthesis.test.ts` — unit/integration with faked boundaries. Modify.
- `.env.example`, `docs/operations/credentials.md`, `docs/operations/development-environment.md` — whisper tier/language notes. Modify.
- `docs/sessions/2026-06-24-phase-3-conversational-recall.md` — session evidence + live smoke results. Create at close.

---

## Slice A — Recency / Metadata Retrieval (no model)

### Task A1: `listRecords` store query

**Files:**
- Modify: `src/paios/knowledge/records.ts`
- Test: `tests/paios/knowledge.test.ts`

**Interfaces:**
- Produces: `interface RecordListItem { id: string; sourceType: KnowledgeSourceType; title: string | null; capturedAt: string; sourceReference: string; state: KnowledgeRecord["state"]; }` and `interface RecordListFilter { sourceTypes?: KnowledgeSourceType[]; workspace?: { chatId: string; threadId?: string }; limit?: number; }` and `function listRecords(dataRoot: string, filter?: RecordListFilter): RecordListItem[]`.
- Consumes: existing `openKnowledgeDatabase`, the `records` table columns, `external_reference_json`.

- [ ] **Step 1: Write the failing tests** in `tests/paios/knowledge.test.ts`. Use the existing test harness/fixtures (see how `searchRecords`/`addNote` are tested). Cover:

```typescript
// returns ready records newest-first, bounded by limit
test("listRecords returns ready records newest first within limit", () => {
    const root = makeTempDataRoot();
    const a = addNote(root, { content: "first" });
    const b = addNote(root, { content: "second" });
    const items = listRecords(root, { limit: 10 });
    assert.equal(items[0]?.id, b.id); // most recent first
    assert.equal(items[1]?.id, a.id);
    assert.ok(items.every((i) => i.state === "ready"));
});

test("listRecords filters by sourceType", () => {
    const root = makeTempDataRoot();
    addNote(root, { content: "a note" });
    const items = listRecords(root, { sourceTypes: ["note"] });
    assert.ok(items.every((i) => i.sourceType === "note"));
});

test("listRecords scopes by workspace provenance", () => {
    const root = makeTempDataRoot();
    addNote(root, { content: "ws1" }, { adapter: "telegram-note", externalReference: { channel: "telegram", chatId: "111", messageId: "1" } });
    addNote(root, { content: "ws2" }, { adapter: "telegram-note", externalReference: { channel: "telegram", chatId: "222", messageId: "2" } });
    const items = listRecords(root, { workspace: { chatId: "111" } });
    assert.equal(items.length, 1);
});

test("listRecords on empty store returns []", () => {
    assert.deepEqual(listRecords(makeTempDataRoot()), []);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL — `listRecords` is not exported.

- [ ] **Step 3: Implement `listRecords`.** Add to `records.ts`. Default limit 20; only `state = 'ready'`; order `captured_at DESC, id ASC`; optional `source_type IN (...)`; workspace scope by JSON-matching `external_reference_json` (`json_extract(external_reference_json,'$.chatId') = ?` and, when `threadId` given, `$.threadId = ?`). Map rows to `RecordListItem`.

```typescript
export interface RecordListItem {
    id: string;
    sourceType: KnowledgeSourceType;
    title: string | null;
    capturedAt: string;
    sourceReference: string;
    state: KnowledgeRecord["state"];
}

export interface RecordListFilter {
    sourceTypes?: KnowledgeSourceType[];
    workspace?: { chatId: string; threadId?: string };
    limit?: number;
}

export function listRecords(
    dataRoot: string,
    filter: RecordListFilter = {},
): RecordListItem[] {
    const limit =
        filter.limit !== undefined && Number.isInteger(filter.limit) && filter.limit > 0
            ? Math.min(filter.limit, 100)
            : 20;
    const clauses = ["state = 'ready'"];
    const params: (string | number)[] = [];
    if (filter.sourceTypes !== undefined && filter.sourceTypes.length > 0) {
        clauses.push(`source_type IN (${filter.sourceTypes.map(() => "?").join(", ")})`);
        params.push(...filter.sourceTypes);
    }
    if (filter.workspace !== undefined) {
        clauses.push("json_extract(external_reference_json, '$.chatId') = ?");
        params.push(filter.workspace.chatId);
        if (filter.workspace.threadId !== undefined) {
            clauses.push("json_extract(external_reference_json, '$.threadId') = ?");
            params.push(filter.workspace.threadId);
        }
    }
    const connection = openKnowledgeDatabase(dataRoot);
    try {
        const rows = connection.database
            .prepare(
                `SELECT id, source_type, title, captured_at, source_reference, state
                 FROM records WHERE ${clauses.join(" AND ")}
                 ORDER BY captured_at DESC, id ASC LIMIT ?`,
            )
            .all(...params, limit) as unknown as Array<{
            id: string;
            source_type: KnowledgeSourceType;
            title: string | null;
            captured_at: string;
            source_reference: string;
            state: KnowledgeRecord["state"];
        }>;
        return rows.map((row) => ({
            id: row.id,
            sourceType: row.source_type,
            title: row.title,
            capturedAt: row.captured_at,
            sourceReference: row.source_reference,
            state: row.state,
        }));
    } finally {
        connection.close();
    }
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS. (If `json_extract` is unavailable in the bundled SQLite build, fall back to reading `external_reference_json` and filtering in JS; add a note and keep the test green.)

- [ ] **Step 5: Commit.** `git add -A && git commit` — `feat: add model-free listRecords recency query (Phase 3 A)`.

### Task A2: `recall` intent + listing reply

**Files:**
- Modify: `src/paios/telegram/intent.ts`
- Create: `src/paios/telegram/recall.ts`
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Consumes: `listRecords`, `RecordListItem`, `InboundMessage`.
- Produces: intent `{ kind: "recall"; sourceTypes?: KnowledgeSourceType[]; limit?: number }`; `function formatRecallReply(items: RecordListItem[]): { text: string; actions: RecordAction[] }` where `RecordAction` is defined in Task B2 (import its type). For Task A2 alone, return `{ text }`; buttons are attached in Task B4.

- [ ] **Step 1: Write failing tests.** In `telegram.test.ts`:

```typescript
test("parseIntent recognises recency phrases as recall", () => {
    for (const text of ["latest", "recent notes", "my last voice note", "what did I capture today", "/recent"]) {
        const intent = parseIntent(textMessage(text));
        assert.equal(intent.kind, "recall", text);
    }
});

test("parseIntent maps 'voice note' to audio source type", () => {
    const intent = parseIntent(textMessage("my last voice note"));
    assert.deepEqual(intent.kind === "recall" ? intent.sourceTypes : null, ["audio"]);
});

test("parseIntent still treats content questions as ask", () => {
    assert.equal(parseIntent(textMessage("?what is my blood pressure")).kind, "ask");
});

test("formatRecallReply lists records newest-first with ids and empty case", () => {
    assert.match(formatRecallReply([]).text, /didn't find|no records/i);
    const text = formatRecallReply([{ id: "r1", sourceType: "note", title: "T", capturedAt: "2026-06-24T10:00:00.000Z", sourceReference: "sources/notes/r1.txt", state: "ready" }]).text;
    assert.match(text, /r1/);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `intent.ts`, BEFORE the `/ask`/`?` checks, detect recency. Keep it pattern-based and conservative (only fire on clear structural phrases so content questions still reach `ask`):

```typescript
const recencyPattern = /^(\/recent|\/latest|latest|recent|my (recent|last)\b|what did i capture)\b/i;
const voicePattern = /\b(voice|audio|recording|transcript)s?\b/i;
const notePattern = /\bnotes?\b/i;
const docPattern = /\b(documents?|files?)\b/i;
// inside parseIntent, after the empty/help checks:
if (recencyPattern.test(text)) {
    const sourceTypes: KnowledgeSourceType[] = [];
    if (voicePattern.test(text)) sourceTypes.push("audio");
    if (notePattern.test(text)) sourceTypes.push("note");
    if (docPattern.test(text)) sourceTypes.push("managed-file");
    return { kind: "recall", ...(sourceTypes.length > 0 ? { sourceTypes } : {}) };
}
```

Add `{ kind: "recall"; sourceTypes?: KnowledgeSourceType[]; limit?: number }` to the `Intent` union and import `KnowledgeSourceType`. In `recall.ts`:

```typescript
import type { RecordListItem } from "../knowledge/records.js";

export function formatRecallReply(items: RecordListItem[]): { text: string } {
    if (items.length === 0) {
        return { text: "I didn't find any matching records yet." };
    }
    const lines = items.map((item) => {
        const when = item.capturedAt.slice(0, 16).replace("T", " ");
        const label = item.title ?? item.sourceType;
        return `• ${item.id} — ${label} (${item.sourceType}, ${when})`;
    });
    return { text: ["Most recent first:", ...lines].join("\n") };
}
```

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: add recall intent and recency listing reply (Phase 3 A)`. (Assistant wiring lands in Task E1.)

---

## Slice B — Whole-Record View, Inline Actions, Summarize

### Task B1: `/show` returns full record content

**Files:**
- Modify: `src/paios/telegram/assistant.ts` (the `inspect` branch) or extract a `formatRecordView` into `recall.ts`.
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces: `function formatRecordView(record: KnowledgeRecord, maxChars?: number): string` (put in `recall.ts`, reused by callback handler in Task B4).

- [ ] **Step 1: Write failing tests.**

```typescript
test("formatRecordView includes full text bounded with truncation marker", () => {
    const record = { id: "r1", sourceType: "note", title: "T", sourceReference: "sources/notes/r1.txt", capturedAt: "2026-06-24T10:00:00.000Z", state: "ready", normalizedText: "x".repeat(5000), provenance: { adapter: "telegram-note", byteLength: 5000, checksum: "c" }, error: null } as KnowledgeRecord;
    const out = formatRecordView(record, 1000);
    assert.match(out, /r1/);
    assert.ok(out.length <= 1200);
    assert.match(out, /truncated/i);
});

test("formatRecordView shows short text in full without truncation", () => {
    const record = /* short normalizedText "hello world" */;
    const out = formatRecordView(record);
    assert.match(out, /hello world/);
    assert.doesNotMatch(out, /truncated/i);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `formatRecordView`** in `recall.ts` (default `maxChars = 3500`, safely under Telegram's 4096 limit):

```typescript
export function formatRecordView(record: KnowledgeRecord, maxChars = 3500): string {
    const header = [
        `Record ${record.id}`,
        `Type: ${record.sourceType}`,
        `Captured: ${record.capturedAt}`,
        `Source: ${record.sourceReference}`,
    ].join("\n");
    const body = record.normalizedText.trim();
    if (body.length === 0) {
        return `${header}\n\n(no text content)`;
    }
    const bounded = body.length > maxChars ? `${body.slice(0, maxChars)}\n…(truncated)` : body;
    return `${header}\n\n${bounded}`;
}
```

Update the `inspect` branch in `assistant.ts` to call `formatRecordView(record)` instead of the metadata-only string.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: /show returns full bounded record content (Phase 3 B)`.

### Task B2: Extend messaging boundary for inline buttons + callbacks

**Files:**
- Modify: `src/paios/telegram/messaging.ts`
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces (transport-neutral types):

```typescript
export interface RecordAction {
    label: string;            // button text, e.g. "👁 View"
    payload: string;          // bounded action token, e.g. "view:<id>" (<= 64 bytes)
}
export interface OutboundReply {
    workspace: Workspace;
    text: string;
    actions?: RecordAction[]; // rendered as a single-row inline keyboard
}
export type MessageKind = "text" | "voice" | "audio" | "document" | "callback" | "unsupported";
export interface CallbackPayload { action: string; recordId?: string; }
// InboundMessage gains: callback?: { payload: string; callbackId: string }
export interface MessagingProvider {
    poll(timeoutSeconds: number): Promise<InboundMessage[]>;
    sendReply(reply: OutboundReply): Promise<void>;
    downloadAttachment(attachment: InboundAttachment): Promise<Uint8Array>;
    acknowledge(cursor: string): Promise<void>;
    answerCallback?(callbackId: string): Promise<void>; // optional; ack the tap
}
export function parseCallbackPayload(payload: string): CallbackPayload | null;
```

- [ ] **Step 1: Write failing tests.**

```typescript
test("parseCallbackPayload parses view/sum tokens and rejects junk", () => {
    assert.deepEqual(parseCallbackPayload("view:abc"), { action: "view", recordId: "abc" });
    assert.deepEqual(parseCallbackPayload("sum:abc"), { action: "sum", recordId: "abc" });
    assert.equal(parseCallbackPayload(""), null);
    assert.equal(parseCallbackPayload("x".repeat(200)), null);
    assert.equal(parseCallbackPayload("drop;table"), null);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** the type changes and `parseCallbackPayload` (reject payloads > 64 bytes, unknown actions, or ids that are not `[A-Za-z0-9-]+`). Add `callback` to `MessageKind`, the optional `callback` field on `InboundMessage`, `actions` on `OutboundReply`, and `answerCallback?` on the interface.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: extend messaging boundary for inline actions and callbacks (Phase 3 B)`.

### Task B3: Telegram adapter — inline keyboard, callback polling, answerCallback

**Files:**
- Modify: `src/paios/telegram/telegram-provider.ts`
- Test: `tests/paios/telegram.test.ts` (use a fake `fetch` as existing provider tests do)

**Interfaces:**
- Consumes: `OutboundReply.actions`, `parseCallbackPayload`, allowlist.
- Produces: `sendReply` adds `reply_markup.inline_keyboard` when `actions` present; `poll` normalizes `callback_query` updates to `kind: "callback"` InboundMessages with the originating workspace + sender (allowlist-enforced); `answerCallback` calls `answerCallbackQuery`.

- [ ] **Step 1: Write failing tests** driving the provider with a scripted fake `fetch`:

```typescript
test("sendReply attaches inline_keyboard when actions present", async () => {
    const calls: any[] = [];
    const provider = createTelegramProvider({ config, cursorStore, fetch: fakeFetch(calls, [...]) });
    await provider.sendReply({ workspace, text: "hi", actions: [{ label: "👁 View", payload: "view:r1" }] });
    const body = JSON.parse(lastSendMessageBody(calls));
    assert.equal(body.reply_markup.inline_keyboard[0][0].callback_data, "view:r1");
});

test("poll normalizes callback_query from allowlisted user to callback kind", async () => {
    const provider = createTelegramProvider({ config, cursorStore, fetch: fakeGetUpdates(callbackUpdateFixture) });
    const messages = await provider.poll(0);
    assert.equal(messages[0]?.kind, "callback");
    assert.equal(messages[0]?.callback?.payload, "view:r1");
});

test("poll drops callback_query from non-allowlisted user", async () => {
    /* allowlist excludes sender → messages is empty */
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** in `telegram-provider.ts`: add `reply_markup` to the `sendMessage` body builder when `actions` are present (one row of `{ text: label, callback_data: payload }`); in update normalization, handle `update.callback_query` → enforce allowlist on `callback_query.from.id` / `message.chat.id`, build an `InboundMessage` with `kind: "callback"`, `callback: { payload: cq.data, callbackId: cq.id }`, workspace from `cq.message.chat`, `cursor` from `update.update_id`; add `answerCallback(callbackId)` → POST `answerCallbackQuery`. Keep logs id/outcome-only.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: Telegram inline keyboards and callback handling via fetch (Phase 3 B)`.

### Task B4: Summarize synthesis operation + orchestration + button wiring

**Files:**
- Modify: `src/paios/synthesis/provider.ts`, `src/paios/synthesis/ollama-provider.ts`, `src/paios/telegram/ask.ts`, `src/paios/telegram/intent.ts`
- Test: `tests/paios/synthesis.test.ts`, `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces: `interface SummarizeRequest { records: RetrievedRecord[] }`; `interface SummarizeResult { summary: string; recordIds: string[] }`; `AnswerSynthesisProvider.summarize(request: SummarizeRequest): Promise<SummarizeResult>`; `buildSummaryPrompt(request)`; orchestration `summarizeRecords(dataRoot, selector, provider): Promise<{ summary: string; recordIds: string[]; outcome: "summarized" | "no-records" }>` where `selector` is `{ recordId: string } | { recent: { sourceTypes?: KnowledgeSourceType[]; limit?: number } }`; intent `{ kind: "summarize"; recordId?: string; recent?: {...} }`.

- [ ] **Step 1: Write failing tests.** Synthesis: `summarize` builds a prompt from records, returns summary + ids; the **fake provider** in tests returns a canned summary. Telegram: `parseIntent("/summarize r1")` → `{ kind: "summarize", recordId: "r1" }`; `parseIntent("summarize my recent notes")` → `{ kind: "summarize", recent: { sourceTypes: ["note"] } }`; `summarizeRecords` with empty selection returns `no-records`; with a record returns the fake summary and the record id.

```typescript
test("buildSummaryPrompt instructs transform-only over given records", () => {
    const { system, user } = buildSummaryPrompt({ records: [{ recordId: "r1", title: "T", sourceReference: "s", text: "long content" }] });
    assert.match(system, /summari/i);
    assert.match(user, /r1|long content/);
});

test("summarizeRecords returns no-records when selection empty", async () => {
    const out = await summarizeRecords(makeTempDataRoot(), { recordId: "missing" }, fakeSynth);
    assert.equal(out.outcome, "no-records");
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.** Add the summarize types + `buildSummaryPrompt` (system prompt: "Summarize the user's own records below faithfully; do not add facts not present; be concise.") to `provider.ts`; implement `summarize` in `ollama-provider.ts` (same chat endpoint, low temperature, no citation post-check but echo the input record ids); implement `summarizeRecords` in `ask.ts` (resolve selector → `getRecord` or `listRecords` → `RetrievedRecord[]` → `provider.summarize`); add the `summarize` intent parsing in `intent.ts` (`/summarize <id>`, `/summarize`, "summarize …"). Update the **fake provider** used in tests to implement `summarize`.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: add summarize synthesis op and orchestration (Phase 3 B)`.

---

## Slice C — Multi-Turn Dialogue + Grounded/Assist Modes

### Task C1: In-memory TTL'd dialogue/mode store

**Files:**
- Create: `src/paios/telegram/dialogue.ts`
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces:

```typescript
export type Mode = "grounded" | "assist";
export interface Turn { role: "user" | "assistant"; text: string; at: number; }
export interface DialogueStore {
    getMode(key: string): Mode;
    setMode(key: string, mode: Mode): void;
    recentTurns(key: string, now?: number): Turn[];
    appendTurn(key: string, turn: Turn): void;
    lastRecordId(key: string): string | undefined;
    setLastRecordId(key: string, id: string): void;
}
export function createDialogueStore(options?: { ttlMs?: number; maxTurns?: number; now?: () => number }): DialogueStore;
```

- [ ] **Step 1: Write failing tests.** Default mode grounded; `setMode` persists per key; turns evict beyond `maxTurns`; turns older than `ttlMs` are excluded by `recentTurns`; `lastRecordId` round-trips; keys are independent. Use injected `now` for determinism.

```typescript
test("dialogue store defaults to grounded and toggles per key", () => {
    const store = createDialogueStore();
    assert.equal(store.getMode("ws:1"), "grounded");
    store.setMode("ws:1", "assist");
    assert.equal(store.getMode("ws:1"), "assist");
    assert.equal(store.getMode("ws:2"), "grounded");
});

test("recentTurns drops turns older than ttl and caps at maxTurns", () => {
    let t = 1000;
    const store = createDialogueStore({ ttlMs: 100, maxTurns: 2, now: () => t });
    store.appendTurn("k", { role: "user", text: "old", at: 0 });
    store.appendTurn("k", { role: "user", text: "a", at: 980 });
    store.appendTurn("k", { role: "user", text: "b", at: 990 });
    t = 1001;
    const turns = store.recentTurns("k");
    assert.equal(turns.length, 2);
    assert.deepEqual(turns.map((x) => x.text), ["a", "b"]);
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** a `Map<string, { mode: Mode; turns: Turn[]; lastRecordId?: string }>` with TTL filtering on read and a ring cap on append. Defaults: `ttlMs = 30 * 60_000`, `maxTurns = 8`. No persistence APIs at all (no read/write to disk).

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: in-memory TTL'd dialogue and mode store (Phase 3 C)`.

### Task C2: Mode-toggle intents

**Files:**
- Modify: `src/paios/telegram/intent.ts`
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces: `{ kind: "set-mode"; mode: Mode }`.

- [ ] **Step 1: Write failing tests.** `/grounded` → `{set-mode, grounded}`; `/assist` and `/chat` → `{set-mode, assist}`; case-insensitive; bare words without slash still capture as notes (don't hijack ordinary text).

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** in `intent.ts`: match `/grounded`, `/assist`, `/chat` exactly. Import `Mode` from `dialogue.ts`. Add to the `Intent` union.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: add mode-toggle intents (Phase 3 C)`.

### Task C3: Assist synthesis path + reply labelling

**Files:**
- Modify: `src/paios/synthesis/provider.ts`, `src/paios/synthesis/ollama-provider.ts`, `src/paios/telegram/ask.ts`
- Test: `tests/paios/synthesis.test.ts`, `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces: `AnswerSynthesisProvider.converse(request: { message: string; context: Turn[] }): Promise<{ reply: string }>`; `buildAssistPrompt(request)`; label helpers `function labelGrounded(reply: string): string` (unchanged sources format), `function labelAssist(reply: string): string` → prefixes `[assist] `, `function labelAssistGroundedLookup(answerReply: string): string` → prefixes `[assist · grounded lookup]`.
- Consumes: ADR-0007 rules — assist must not assert personal facts without retrieval.

- [ ] **Step 1: Write failing tests.** `buildAssistPrompt` system text forbids asserting personal facts without sources (assert the prompt contains that instruction). `labelAssist("hi")` === `"[assist] hi"`. Integration with **fake** `converse`: an assist-mode general question yields a `[assist]`-prefixed reply; a personal-fact question in assist mode routes through `answerQuestion` (grounded) and, when retrieval is empty, returns the no-source reply (never a fabricated fact) labelled as a grounded lookup.

```typescript
test("buildAssistPrompt forbids ungrounded personal facts", () => {
    const { system } = buildAssistPrompt({ message: "hi", context: [] });
    assert.match(system, /not (state|assert).*personal|without (a )?source/i);
});
test("assist personal-fact question with empty retrieval never fabricates", async () => {
    // route through answerQuestion with a fake synth that would fabricate if called;
    // empty store → no-sources path, reply has no invented personal claim
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.** Add `converse` + `buildAssistPrompt` to the synthesis interface/adapter (the assist system prompt: open conversation using general knowledge; explicitly "do not state facts about the user, their data, history, or plans unless they come from provided sources"). Add label helpers to `ask.ts` (or a small `labels.ts`). The personal-fact routing decision (when to call grounded retrieval vs. open converse) is made in Task C4's handler; here, ensure the building blocks exist and the fake provider implements `converse`.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: add assist conversation op and reply labels (Phase 3 C)`.

### Task C4: Multi-turn routing in the assist/ask handlers

**Files:**
- Modify: `src/paios/telegram/ask.ts` (or a new `converse.ts`)
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces: `function handleConversation(deps, key, message, store): Promise<string>` that: appends the user turn; if mode is grounded → `answerQuestion` (Phase 2 path) with optional recent-turn context for phrasing; if assist → decide personal-fact vs general (heuristic: first-person/possessive about the user, e.g. /\b(my|i|me|did i|have i)\b/i) → personal-fact routes to grounded `answerQuestion` labelled `[assist · grounded lookup]`, general routes to `converse` labelled `[assist]`; appends the assistant turn.
- Consumes: `DialogueStore`, `answerQuestion`, `converse`, label helpers.

- [ ] **Step 1: Write failing tests.** Grounded mode unchanged vs Phase 2 (same reply as `answerQuestion`+`formatAnswerReply`). Assist general question → `[assist]`. Assist "what did I note about X" with a matching fake source → `[assist · grounded lookup]` + sources. Assist personal question with empty store → no-source reply, no fabrication. Turns are appended (assert via `store.recentTurns`).

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** `handleConversation` per the interface above; keep grounded mode byte-for-byte the Phase 2 output (reuse `answerQuestion` + `formatAnswerReply`).

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: multi-turn grounded/assist routing (Phase 3 C)`.

---

## Slice D — Ukrainian + English Voice (config + A/B)

### Task D1: Language auto-detect default + model-tier configurability + docs

**Files:**
- Modify: `src/paios/cli.ts` (`audioOptionsIfReady` already passes no `language`, so transcriber defaults to `auto` — verify and lock with a test), `.env.example`, `docs/operations/credentials.md`, `docs/operations/development-environment.md`.
- Test: `tests/paios/telegram.test.ts` or `tests/paios/knowledge.test.ts`

**Interfaces:**
- Consumes: existing `AudioTranscriberOptions.language` (defaults to `auto`), `PAIOS_WHISPER_MODEL_PATH`.

- [ ] **Step 1: Write a failing/guard test** asserting that the assistant audio options leave `language` unset so the transcriber uses `auto` (regression guard for UK+EN auto-detect), and that an explicit `PAIOS_WHISPER_LANGUAGE` (if added) of `auto` validates. If no code change is needed beyond a guard, the test documents the contract.

```typescript
test("assistant audio transcriber uses auto language detection by default", () => {
    // audioOptionsIfReady(...) returns transcriber without a fixed `language`,
    // so transcribeNormalizedAudio resolves language to "auto"
});
```

- [ ] **Step 2: Run to verify.** Run: `npm test`. Expected: PASS if already `auto`; otherwise FAIL → set default to `auto`/omit `language`, then PASS.

- [ ] **Step 3: Document the tier.** In `.env.example` and `docs/operations/credentials.md`, note `PAIOS_WHISPER_MODEL_PATH` should point to `ggml-small.bin` (default tier) with `ggml-medium-q5_0.bin` as the A/B alternative; language is auto-detected (UK+EN); `large-v3` is ruled out on this CPU. In `development-environment.md`, note the live A/B step.

- [ ] **Step 4: Run repo validation.** Run: `python3 scripts/validate_repository.py .`. Expected: pass.

- [ ] **Step 5: Commit.** `docs: lock whisper small + auto-detect voice tier and A/B note (Phase 3 D)`.

> The **final tier pick is a gate**: it is chosen from the live A/B smoke evidence (Verification step V2), not in this task. `large-v3` is excluded.

---

## Slice E — Integration, CLI Wiring, Help

### Task E1: Route new intents and callbacks in the assistant loop

**Files:**
- Modify: `src/paios/telegram/assistant.ts`, `src/paios/cli.ts`
- Test: `tests/paios/telegram.test.ts` (full flow against fake `MessagingProvider` + fake synthesis)

**Interfaces:**
- Consumes: all of the above. `AssistantDeps` gains `dialogue: DialogueStore`. `processMessage` routes: `set-mode` → `store.setMode` + labelled confirmation; `recall` → `listRecords` + `formatRecallReply` + attach View/Summarize actions per item; `callback` → `parseCallbackPayload` → `formatRecordView` (view) or `summarizeRecords` (sum) + `provider.answerCallback`; `summarize` → `summarizeRecords`; `ask` and any other text → `handleConversation` (mode-aware). Capture confirmations attach a View/Summarize action for the new record id.

- [ ] **Step 1: Write failing integration tests.** Using the existing fake `MessagingProvider` pattern: (a) `/assist` then a general message → `[assist]` reply and persisted mode; (b) capture a note → confirmation carries `view:<id>`/`sum:<id>` actions; (c) a `callback` message `view:<id>` → reply contains the full record and `answerCallback` was called; (d) `recall` lists newest-first with actions; (e) grounded ask unchanged. Assert no record is written for summaries/assist replies (store count stable).

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** routing in `processMessage`/`runAssistantOnce` (handle `kind: "callback"` before `parseIntent`; call `answerCallback` after replying); construct `createDialogueStore()` once in `cli.ts` serve and pass into `AssistantDeps`; attach actions to capture confirmations and recall listings; ensure callbacks are allowlist-protected (already enforced in the adapter).

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat: wire recall, view, summarize, modes, callbacks into the assistant (Phase 3)`.

### Task E2: Help text, usage, and env template

**Files:**
- Modify: `src/paios/telegram/assistant.ts` (help reply), `src/paios/cli.ts` (serve banner), `.env.example`.
- Test: `tests/paios/telegram.test.ts`

- [ ] **Step 1: Write failing test** asserting the help reply documents recency (`recent`/`latest`), `/show`, `/summarize`, `/grounded` and `/assist`, and the inline buttons.

- [ ] **Step 2: Run to verify failure.** Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** the expanded help text and banner.

- [ ] **Step 4: Run to verify pass.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `docs: expand Telegram help for Phase 3 capabilities`.

---

## Verification (run before declaring the phase done)

### V1: Full faked-boundary gate

- [ ] Run: `npm run lint` → clean.
- [ ] Run: `npm run typecheck` → clean.
- [ ] Run: `npm test` → all pass (messaging + synthesis boundaries faked; no live network/model).
- [ ] Run: `npm run build` → compiles.
- [ ] Run: `python3 scripts/validate_repository.py .` → passes.
- [ ] Run: `git diff --check` → no whitespace errors. Review the full diff.

### V2: Live local smoke tests (mandatory per AGENTS.md) — produce recorded evidence

- [ ] **Voice A/B (the gate):** transcribe a real Ukrainian voice note with whisper `small` and with `medium-q5` on the real CPU; record transcript quality and latency for each. Use the existing `tests/paios/audio-real-harness.ts` / `audio-benchmark` harness (opt-in, never in the default suite). **Present the A/B evidence to the user and let them pick the tier** (`large-v3` excluded).
- [ ] **Ollama multi-turn:** with a running Ollama + pulled model, run a real multi-turn exchange in BOTH modes: confirm grounded refusal still holds on an unknown question, an assist general reply is labelled `[assist]` and asserts no personal fact, and an assist personal-fact question is answered only via grounded retrieval (`[assist · grounded lookup]` + sources) or refused.
- [ ] Record both results in `docs/sessions/2026-06-24-phase-3-conversational-recall.md`.

### V3: Independent review + closeout

- [ ] Request a code review (superpowers:requesting-code-review) focused on privacy, data-loss, authorization (callback allowlist), and the grounding guarantee; resolve any critical/high finding.
- [ ] Record any shortcut in `docs/TECH_DEBT.md`.
- [ ] Flip ROADMAP Phase 3 state to `in-progress` at start and only to `completed` after V1–V3 evidence + a roadmap/vision review (store the dated review under `docs/reviews/`).
- [ ] Close with superpowers/`paios-session-close` (closeout + capability harvest).

---

## Self-Review Notes

- **Spec coverage:** A → Tasks A1–A2; B (view) → B1, (buttons/callbacks) → B2–B3, (summarize) → B4; C (dialogue) → C1, (modes) → C2, (assist+labels) → C3, (multi-turn routing) → C4; D → D1 + V2 gate; integration/help → E1–E2; privacy/no-persist/grounding assertions → tests in A1, C1, C3, C4, E1; live smoke → V2.
- **No new runtime deps:** all Telegram/Ollama work uses built-in `fetch`; confirmed in B3/B4.
- **Type consistency:** `RecordAction`/`OutboundReply.actions`/`parseCallbackPayload` defined in B2 and consumed in B3/E1; `Mode`/`DialogueStore` defined in C1 and consumed in C2/C4/E1; `summarizeRecords`/`SummarizeRequest` defined in B4 and consumed in E1; `formatRecordView` defined in B1 and consumed in E1.
- **Gate respected:** voice tier final pick deferred to V2 with user choice; everything else reversible and ADR-recorded.
