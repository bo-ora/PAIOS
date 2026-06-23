# Phase 2: Telegram Daily Assistant — Implementation Plan

> **For agentic workers:** Implement task-by-task with
> `superpowers:test-driven-development`. Steps use checkbox (`- [ ]`) syntax for
> tracking. Run the definition-of-done gate after every chunk.

**Goal:** Let an authorized Telegram user capture text/voice/document knowledge
into the existing Phase 1 local store and ask questions answered by a local
model with inline citations — Telegram and the model both behind stable,
fakeable provider interfaces.

**Architecture:** A new `src/paios/telegram/` (messaging + orchestration) and
`src/paios/synthesis/` (answer synthesis) layer sits on top of unchanged Phase 1
storage/transcription/search. Telegram is reached only through a
`MessagingProvider` interface (Telegram adapter uses Node built-in `fetch`,
ADR-0005). Answer synthesis is reached only through an `AnswerSynthesisProvider`
interface (Ollama adapter uses built-in `fetch`, ADR-0006). Records gain
Telegram provenance via the existing `SourceProvenance.externalReference` map —
no new storage engine.

**Tech Stack:** TypeScript (strict, NodeNext, Node ≥24), Node built-in `fetch`,
`node:test`, existing `node:sqlite` storage. **Zero new runtime npm
dependencies.**

## Global Constraints

- Node.js ≥ 24; ES2022; NodeNext modules; `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` all on. Import paths use the `.js` extension.
- **No new runtime npm dependencies** (`AGENTS.md`). Use built-in `fetch`.
- Telegram types never cross into `src/paios/knowledge/` or `types.ts`
  signatures; provider-specific identity lives only in provenance
  (`externalReference`), per ADR-0003/0005.
- Answer synthesis is local-only in Phase 2; personal content must never reach a
  non-local destination (ADR-0006).
- All personal data and derived state stay under the git-ignored data root
  (default `.local/paios/knowledge`); never commit secrets.
- Integration tests must use **fake** messaging and model providers — no live
  network, no live model.
- Logs must not contain message bodies, question text, retrieved content, answer
  bodies, tokens, or secrets — only bounded identifiers and outcomes.
- Definition of done (run with Node 24 on PATH, after every chunk):
  `npm run lint && npm run typecheck && npm test && npm run build` then
  `python3 scripts/validate_repository.py .` and `git diff --check`.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- `src/paios/knowledge/records.ts` — *modify*: add optional `CaptureProvenance`
  to `addNote`/`addFile`/`addAudio`; persist `external_reference_json` on insert.
- `src/paios/telegram/messaging.ts` — *create*: transport-neutral messaging
  types + `MessagingProvider` interface + `CursorStore` interface.
- `src/paios/telegram/intent.ts` — *create*: pure `parseIntent(message)`.
- `src/paios/telegram/cursor-store.ts` — *create*: file-backed `CursorStore`.
- `src/paios/telegram/telegram-provider.ts` — *create*: Bot API adapter
  (fetch-based long-poll, allowlist, update normalizer).
- `src/paios/telegram/config.ts` — *create*: resolve token, allowlist,
  `OLLAMA_HOST`, `PAIOS_SYNTHESIS_MODEL`.
- `src/paios/synthesis/provider.ts` — *create*: `AnswerSynthesisProvider`
  interface, request/result types, `buildSynthesisPrompt`, `extractCitations`,
  `toSearchQuery`.
- `src/paios/synthesis/ollama-provider.ts` — *create*: Ollama chat adapter.
- `src/paios/telegram/ask.ts` — *create*: `answerQuestion` orchestration.
- `src/paios/telegram/capture.ts` — *create*: `captureMessage` orchestration.
- `src/paios/telegram/assistant.ts` — *create*: `processMessage`,
  `runAssistantOnce`, `runAssistant` loop (commit-before-ack).
- `src/paios/telegram/doctor.ts` — *create*: readiness diagnostics.
- `src/paios/cli.ts` — *modify*: route `telegram serve` / `telegram doctor`.
- `tests/paios/telegram.test.ts`, `tests/paios/synthesis.test.ts` — *create*.
- `docs/operations/development-environment.md` — *modify*: Phase 2 run notes.
- `docs/ROADMAP.md` — *modify*: Phase 2 → in-progress, then completed.

---

## Chunk 1: Telegram provenance on capture records (AC1)

**Files:**
- Modify: `src/paios/knowledge/records.ts`
- Test: `tests/paios/knowledge.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export interface CaptureProvenance {
    adapter: string;
    externalReference?: Record<string, string>;
  }
  export function addNote(dataRoot: string, input: AddNoteInput, provenance?: CaptureProvenance): KnowledgeRecord
  export function addFile(dataRoot: string, path: string, provenance?: CaptureProvenance): KnowledgeRecord
  export function addAudio(dataRoot: string, path: string, provenance?: CaptureProvenance): KnowledgeRecord
  ```

- [ ] **Step 1: Failing test** — append to `tests/paios/knowledge.test.ts`:
  ```ts
  test("addNote records a custom adapter and external reference", () => {
    const root = temporaryRoot();
    const record = addNote(
      root,
      { content: "telegram note body" },
      { adapter: "telegram-note", externalReference: { channel: "telegram", chatId: "42", messageId: "7" } },
    );
    assert.equal(record.provenance.adapter, "telegram-note");
    const reloaded = getRecord(root, record.id);
    assert.deepEqual(reloaded?.provenance.externalReference, {
      channel: "telegram", chatId: "42", messageId: "7",
    });
  });
  ```
- [ ] **Step 2: Run, verify it fails** — `npm test 2>&1 | grep -A3 "external reference"`; expect FAIL (3rd arg ignored / externalReference undefined).
- [ ] **Step 3: Implement.** In `records.ts`:
  - Add the `CaptureProvenance` interface (exported).
  - Add a `sourceExternalReference?: Record<string,string>` field to
    `CaptureManagedInput`.
  - In `captureManagedSource`, extend the INSERT column list with
    `external_reference_json` and bind
    `input.sourceExternalReference === undefined ? null : JSON.stringify(input.sourceExternalReference)`.
    Extend the UPDATE branch to also set `external_reference_json = ?` with the
    same value.
  - Thread an optional `provenance?: CaptureProvenance` param through
    `addNote`/`addFile`/`addAudio`; when present, override `sourceAdapter` with
    `provenance.adapter` and set `sourceExternalReference` from
    `provenance.externalReference`.
- [ ] **Step 4: Run, verify pass** — `npm test 2>&1 | grep -A2 "external reference"`; expect PASS. Also confirm existing 79 tests still pass.
- [ ] **Step 5: DoD gate + commit** — `feat: thread capture provenance through knowledge records`.

---

## Chunk 2: Messaging interface + intent parser (AC1, AC7)

**Files:**
- Create: `src/paios/telegram/messaging.ts`, `src/paios/telegram/intent.ts`
- Test: `tests/paios/telegram.test.ts`

**Interfaces:**
- Produces in `messaging.ts`:
  ```ts
  export type MessageKind = "text" | "voice" | "audio" | "document" | "unsupported";
  export interface Workspace { channel: "telegram"; chatId: string; threadId?: string; }
  export interface InboundAttachment {
    reference: string; uniqueReference?: string;
    originalName?: string; claimedMimeType?: string; byteLength?: number;
  }
  export interface InboundMessage {
    provider: "telegram"; messageId: string; workspace: Workspace; senderId: string;
    kind: MessageKind; text?: string; attachment?: InboundAttachment;
    timestamp: string; cursor: string;
  }
  export interface OutboundReply { workspace: Workspace; text: string; }
  export interface MessagingProvider {
    poll(timeoutSeconds: number): Promise<InboundMessage[]>;
    sendReply(reply: OutboundReply): Promise<void>;
    downloadAttachment(attachment: InboundAttachment): Promise<Uint8Array>;
    acknowledge(cursor: string): Promise<void>;
  }
  export interface CursorStore { read(): string | null; write(cursor: string): void; }
  export function workspaceKey(workspace: Workspace): string; // "telegram:<chatId>[:<threadId>]"
  ```
- Produces in `intent.ts`:
  ```ts
  export type Intent =
    | { kind: "capture" }
    | { kind: "ask"; question: string }
    | { kind: "inspect"; recordId: string }
    | { kind: "help" };
  export function parseIntent(message: InboundMessage): Intent;
  ```
  Rules (text messages only; non-text always `{ kind: "capture" }`):
  `/start` or `/help` → `help`; `/ask <q>` or text starting with `?` →
  `ask` (trimmed question; empty question → `help`); `/show <id>` → `inspect`;
  any other non-empty text → `capture`. **No state-changing intents exist.**

- [ ] **Step 1: Failing tests** (`tests/paios/telegram.test.ts`): assert
  `workspaceKey` for chat-only and chat+thread; assert `parseIntent` for
  `/ask hello world` → `{kind:"ask",question:"hello world"}`, `? what is x` →
  ask, `/show abc` → `{kind:"inspect",recordId:"abc"}`, `/help` → help, plain
  `"note text"` → capture, a `voice` message → capture, `/ask   ` → help.
- [ ] **Step 2: Run, verify fail** (module not found).
- [ ] **Step 3: Implement** `messaging.ts` (types + `workspaceKey`) and
  `intent.ts` (`parseIntent`). `workspaceKey`: `telegram:${chatId}` plus
  `:${threadId}` when present.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: DoD gate + commit** — `feat: add messaging provider interface and intent parser`.

---

## Chunk 3: Config resolution (AC3)

**Files:**
- Create: `src/paios/telegram/config.ts`
- Test: `tests/paios/telegram.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export class TelegramConfigError extends Error {}
  export interface TelegramConfig { botToken: string; allowedChatIds: ReadonlySet<string>; }
  export function resolveTelegramConfig(env: Record<string, string | undefined>): TelegramConfig;
  export interface SynthesisConfig { ollamaHost: string; model: string; }
  export function resolveSynthesisConfig(env: Record<string, string | undefined>): SynthesisConfig;
  export const defaultSynthesisModel = "llama3.1:8b";
  export const defaultOllamaHost = "http://127.0.0.1:11434";
  ```
  `resolveTelegramConfig`: read `TELEGRAM_BOT_TOKEN` (throw
  `TelegramConfigError` if missing/blank); parse `TELEGRAM_ALLOWED_CHAT_IDS` as
  comma-separated, trim, drop empties (throw if the resulting set is empty).
  `resolveSynthesisConfig`: `OLLAMA_HOST` || default; `PAIOS_SYNTHESIS_MODEL` ||
  `defaultSynthesisModel`.

- [ ] **Step 1: Failing tests** — valid env → token + set of two ids; missing
  token → throws `TelegramConfigError`; empty allowlist → throws; synthesis
  defaults applied when env unset; overrides honored.
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: resolve Telegram and synthesis configuration`.

---

## Chunk 4: Telegram adapter (AC1, AC3, AC6)

**Files:**
- Create: `src/paios/telegram/cursor-store.ts`, `src/paios/telegram/telegram-provider.ts`
- Test: `tests/paios/telegram.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  // cursor-store.ts
  export function createFileCursorStore(dataRoot: string): CursorStore; // {dataRoot}/telegram/cursor.json
  // telegram-provider.ts
  export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string,string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer>; }>;
  export interface TelegramProviderOptions {
    config: TelegramConfig; cursorStore: CursorStore; fetch: FetchLike;
    apiBase?: string; // default https://api.telegram.org
  }
  export function createTelegramProvider(options: TelegramProviderOptions): MessagingProvider;
  export function normalizeUpdate(update: unknown, allowed: ReadonlySet<string>): InboundMessage | null; // exported pure helper
  ```
  `normalizeUpdate`: returns `null` when the update has no `message`, when the
  chat/sender id is not in `allowed`, or for unhandled update types. Maps
  `message.text` → text; `message.voice` → voice; `message.audio` → audio;
  `message.document` → document (when none match but a caption exists, treat as
  text); otherwise `kind:"unsupported"`. `workspace.threadId` from
  `message.message_thread_id` when `is_topic_message`. `cursor` is the string
  `update_id`. Attachment `reference` is Telegram `file_id`, `uniqueReference`
  is `file_unique_id`.
  Provider: `poll` calls `getUpdates?offset=<store+1>&timeout=<n>` via `fetch`,
  maps results through `normalizeUpdate`, drops `null`s; `acknowledge(cursor)`
  writes `cursor+1` to the store; `sendReply` POSTs `sendMessage`;
  `downloadAttachment` calls `getFile` then GETs
  `/file/bot<token>/<file_path>` and returns bytes. The bot token never appears
  in returned data or thrown messages.

- [ ] **Step 1: Failing tests** using a **fake `FetchLike`** (a function that
  returns scripted responses keyed by URL substring):
  - `normalizeUpdate` for text/voice/document/unsupported, topic thread id, and
    an unlisted chat id → `null` (allowlist).
  - `poll` issues `getUpdates` with the persisted offset and returns normalized,
    allowlisted messages only; an unlisted update is excluded.
  - `acknowledge("12")` persists offset `13` so the next `poll` requests
    `offset=13`.
  - `downloadAttachment` resolves the file path then fetches bytes.
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: add fetch-based Telegram messaging adapter`.

---

## Chunk 5: Synthesis interface + pure helpers (AC4)

**Files:**
- Create: `src/paios/synthesis/provider.ts`
- Test: `tests/paios/synthesis.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RetrievedRecord { recordId: string; title: string | null; sourceReference: string; text: string; }
  export interface SynthesisRequest { question: string; records: RetrievedRecord[]; }
  export type SynthesisOutcome = "answered" | "no-sources" | "refused";
  export interface SynthesisResult { outcome: SynthesisOutcome; answer: string; citedRecordIds: string[]; }
  export interface AnswerSynthesisProvider { synthesize(request: SynthesisRequest): Promise<SynthesisResult>; }
  export function toSearchQuery(question: string): string;       // NL → safe FTS5 query
  export function buildSynthesisPrompt(request: SynthesisRequest): { system: string; user: string };
  export function extractCitations(answer: string, records: RetrievedRecord[]): string[]; // ids present in records, in order
  ```
  `toSearchQuery`: lowercase, extract `[a-z0-9]+` tokens of length ≥ 2, dedupe,
  wrap each in double quotes, join with ` OR `; empty → throws
  `KnowledgeInputError`-style guard handled by caller (return `""` and let
  caller treat as no-sources). `buildSynthesisPrompt`: system message instructs
  answering strictly from sources, citing record ids inline as `[id]`, and
  saying it cannot answer if sources are insufficient; user message embeds the
  question and each record as `### Source <recordId> (<sourceReference>)` +
  text. `extractCitations`: scan the answer for any supplied `recordId`
  substring, return the matched ids (unique, in record order).

- [ ] **Step 1: Failing tests** — `toSearchQuery("What is my passport number?")`
  → `"what" OR "is" OR "my" OR "passport" OR "number"` (tokens len≥2, deduped);
  `buildSynthesisPrompt` includes each record id and the grounding instruction;
  `extractCitations("see [r1] and [r3]", recordsWithIds r1,r2,r3)` → `["r1","r3"]`;
  citation of an id not in records is ignored.
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: add answer-synthesis interface and grounding helpers`.

---

## Chunk 6: Ollama adapter (AC4)

**Files:**
- Create: `src/paios/synthesis/ollama-provider.ts`
- Test: `tests/paios/synthesis.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export interface OllamaProviderOptions { config: SynthesisConfig; fetch: FetchLike; timeoutMs?: number; }
  export function createOllamaProvider(options: OllamaProviderOptions): AnswerSynthesisProvider;
  ```
  `synthesize`: if `request.records` is empty → return
  `{ outcome: "no-sources", answer: "", citedRecordIds: [] }` **without
  calling fetch**. Otherwise POST `/api/chat` with `model`, `stream:false`,
  `options:{temperature:0.1}`, and the system/user messages from
  `buildSynthesisPrompt`. Parse `message.content`; compute
  `citedRecordIds = extractCitations(content, records)`; outcome is `answered`
  when content is non-empty (citations may be empty → caller still shows
  sources). On non-ok response or transport error, throw a bounded error that
  names neither the host secret nor content.

- [ ] **Step 1: Failing tests** with a fake `FetchLike`: empty records → no
  fetch call, `no-sources`; non-empty records → posts to `/api/chat`, returns
  parsed answer + extracted citations; a non-ok response throws.
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: add local Ollama answer-synthesis adapter`.

---

## Chunk 7: Ask orchestration (AC4)

**Files:**
- Create: `src/paios/telegram/ask.ts`
- Test: `tests/paios/telegram.test.ts` (append)

**Interfaces:**
- Consumes: `searchRecords`, `getRecord` (records.ts); `AnswerSynthesisProvider`,
  `toSearchQuery` (synthesis).
- Produces:
  ```ts
  export interface Citation { recordId: string; sourceReference: string; title: string | null; }
  export interface AskResult { outcome: SynthesisOutcome; answer: string; citations: Citation[]; }
  export const maxAskSources = 5;
  export async function answerQuestion(dataRoot: string, question: string, provider: AnswerSynthesisProvider): Promise<AskResult>;
  export function formatAnswerReply(result: AskResult): string;
  ```
  Flow: `query = toSearchQuery(question)`; if empty → `no-sources`. Else
  `searchRecords(dataRoot, query)` (wrap the FTS call; on
  `KnowledgeInputError` treat as no results), take top `maxAskSources`, load
  each via `getRecord`, build `RetrievedRecord[]`, call `provider.synthesize`.
  If retrieval empty → return `no-sources` (provider not called). Citations are
  the cited records (fall back to all retrieved records when the model cited
  none, so sources are always shown). `formatAnswerReply`: for `answered`, the
  answer followed by a `Sources:` list of `recordId — title`; for `no-sources`,
  "I couldn't find anything in your knowledge base about that."; for `refused`,
  the model's stated inability.

- [ ] **Step 1: Failing tests** with a **fake provider** and a temp data root
  seeded via `addNote`: a question that matches a seeded note → `answered` with
  that note cited and `formatAnswerReply` listing it; a question with no match →
  `no-sources` and the provider's `synthesize` is **not** called (use a fake
  that records call count).
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: add source-backed ask orchestration`.

---

## Chunk 8: Capture orchestration (AC1, AC2, AC5)

**Files:**
- Create: `src/paios/telegram/capture.ts`
- Test: `tests/paios/telegram.test.ts` (append)

**Interfaces:**
- Consumes: `addNote`/`addFile`/`addAudio`/`CaptureProvenance`,
  `DuplicateKnowledgeError`, `KnowledgeInputError` (records.ts);
  `processAudioRecord` + `AudioProcessingOptions` (audio-processing.ts);
  `MessagingProvider`, `InboundMessage` (messaging.ts).
- Produces:
  ```ts
  export type CaptureStatus = "captured" | "duplicate" | "refused" | "failed";
  export interface CaptureResult { status: CaptureStatus; recordId?: string; message: string; }
  export interface CaptureDeps {
    dataRoot: string; tempRoot: string;
    provider: Pick<MessagingProvider, "downloadAttachment">;
    audio?: AudioProcessingOptions; // when present and message is voice/audio, transcribe inline
  }
  export async function captureMessage(message: InboundMessage, deps: CaptureDeps): Promise<CaptureResult>;
  export function captureProvenanceFor(message: InboundMessage, adapter: string): CaptureProvenance;
  ```
  Provenance external reference: `{ channel:"telegram", chatId, threadId?, messageId }`.
  Routing: `text` → `addNote({content:text,...}, telegram-note)` →
  `captured`. `document` → download bytes → write
  `{tempRoot}/<sanitized originalName>` → `addFile(...telegram-document)`;
  unsupported extension (`KnowledgeInputError`) → `refused` with reason.
  `voice`/`audio` → download → write temp file (`.ogg` for voice when no name)
  → `addAudio(...telegram-audio)`; if `deps.audio` set, `processAudioRecord`
  inline and report transcription state; else leave `pending` and report it.
  `unsupported` → `refused`. `DuplicateKnowledgeError` → `duplicate` with the
  existing id. Any other error → `failed` (record, if created, is left in its
  Phase-1 `pending`/`failed` state) with a bounded message. Temp files are
  removed after capture. **Success is reported only after the record is
  committed.**

- [ ] **Step 1: Failing tests** (temp data root + fake provider whose
  `downloadAttachment` returns fixture bytes): text → `captured` + a `note`
  record carrying telegram provenance; a `.md` document → `captured` +
  `managed-file` record; a `.bin` document → `refused`, no record; sending the
  same text twice → second is `duplicate`; a voice message with a WAV fixture
  and a fake audio runner → `captured` and transcript searchable.
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: add Telegram message capture orchestration`.

---

## Chunk 9: Assistant loop with commit-before-ack (AC5, AC6, AC7)

**Files:**
- Create: `src/paios/telegram/assistant.ts`
- Test: `tests/paios/telegram.test.ts` (append)

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  export interface AssistantDeps {
    dataRoot: string; tempRoot: string;
    provider: MessagingProvider; synthesis: AnswerSynthesisProvider;
    audio?: AudioProcessingOptions;
    log?: (event: { event: string; workspace: string; outcome: string; recordId?: string }) => void;
    pollTimeoutSeconds?: number;
  }
  export async function processMessage(message: InboundMessage, deps: AssistantDeps): Promise<string>; // returns reply text
  export async function runAssistantOnce(deps: AssistantDeps): Promise<number>; // poll → process → reply → ack; returns count
  export async function runAssistant(deps: AssistantDeps, control?: { stop?: () => boolean }): Promise<void>;
  ```
  `processMessage`: route by `parseIntent`: `help` → help text; `ask` →
  `answerQuestion` + `formatAnswerReply`; `inspect` → `getRecord` summary (id,
  type, state, captured, source) or "not found"; `capture` (and all non-text) →
  `captureMessage` + a confirmation including the record id. Never executes a
  shell/system command — there is no such intent.
  `runAssistantOnce`: `provider.poll(timeout)`; for each message, in order:
  `reply = processMessage(...)` (a thrown error becomes a failure reply,
  **never an unhandled drop**), `provider.sendReply({workspace,text:reply})`,
  then `provider.acknowledge(message.cursor)` — **ack only after processing +
  reply succeed**, so a crash re-delivers. `log` receives bounded fields only.

- [ ] **Step 1: Failing tests** with a **fake `MessagingProvider`** (scripted
  poll batches; records sends + acks; in-memory attachments) and a **fake
  synthesis provider**:
  - a capture text message → reply contains "Captured" + id; record exists;
    cursor acknowledged.
  - an `/ask` message matching a seeded note → reply contains the answer + the
    source id.
  - a `/show <id>` for an existing record → reply summarizes it.
  - **no-silent-drop:** `processMessage` whose capture fails (download throws)
    → reply explains the failure and the message is still acknowledged only
    after the reply is sent.
  - **restart/recovery:** when `acknowledge` is made to throw before persisting
    (simulating a crash), the next `runAssistantOnce` re-polls from the
    unadvanced offset and re-delivers the same message; a committed record is
    not duplicated (checksum dedupe / `duplicate`).
  - **no state-changing command:** a message like `/delete x` or `rm -rf` is
    parsed as `capture` (a note), proving no command path exists.
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: add Telegram assistant loop with commit-before-ack recovery`.

---

## Chunk 10: CLI wiring + doctor (AC4, AC8)

**Files:**
- Create: `src/paios/telegram/doctor.ts`
- Modify: `src/paios/cli.ts`
- Test: `tests/paios/cli.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  // doctor.ts
  export interface TelegramDoctorResult { tokenConfigured: boolean; allowlistCount: number; ollamaReachable: boolean; modelPresent: boolean; ready: boolean; summary: string[]; }
  export async function collectTelegramDiagnostics(env: Record<string,string|undefined>, fetch: FetchLike): Promise<TelegramDoctorResult>;
  ```
  CLI: add `telegram` routing in `runCli` (async, because serve/doctor await).
  `./paios telegram doctor` → run diagnostics (token+allowlist from config;
  Ollama reachability via `GET {host}/api/tags`; model presence by name), print
  a Phase-1-style report, exit 0 when ready else 1. `./paios telegram serve`
  → build the real Telegram + Ollama providers from env + data root and call
  `runAssistant`; print a startup line naming the bot workspace count and model
  (no token). Usage string added; unknown `telegram` subcommand → exit 2.

- [ ] **Step 1: Failing tests** — `runCli(["telegram","doctor"], ...)` with a
  fake fetch and env: ready path → exit 0 and a summary; missing token → exit 1
  with a clear line; unknown subcommand → exit 2. (Do **not** test `serve` with
  a live loop; only assert it rejects missing config with exit 2/1.)
- [ ] **Step 2/3/4:** verify fail → implement → verify pass.
- [ ] **Step 5: DoD gate + commit** — `feat: wire telegram serve and doctor into the CLI`.

---

## Chunk 11: Docs + roadmap (AC8)

**Files:**
- Modify: `docs/operations/development-environment.md` (Phase 2 run/smoke
  notes: `ollama serve`, `ollama pull llama3.1:8b`, copy `.env.example` →
  `.local/secrets.env`, `./paios telegram doctor`, `./paios telegram serve`).
- Modify: `docs/ROADMAP.md` (Phase 2 state → `completed` with verification
  note once all chunks are green; update Current Position + confidence).
- Verify `.env.example` already carries the Phase 2 keys (it does) — no secret
  is added.

- [ ] **Step 1:** update the two docs; confirm no new secret/placeholder gaps.
- [ ] **Step 2:** run the full DoD gate one final time, plus a real local smoke
  test if Ollama + token are available (manual, optional, evidence recorded in
  the session summary).
- [ ] **Step 3: commit** — `docs: record Phase 2 completion and run notes`.

---

## Self-Review (spec coverage)

- AC1 capture text/voice/doc → durable record + id + traceable → Chunks 1, 2, 4,
  8 (provenance + normalizer + capture).
- AC2 voice transcribed, searchable, linked → Chunk 8 (reuses Phase 1
  `processAudioRecord`).
- AC3 unauthorized not processed/stored → Chunks 3, 4 (allowlist at adapter).
- AC4 ask → local-model synthesized answer with inline citations; unanswerable
  reported; nothing leaves machine → Chunks 5, 6, 7, 10 (Ollama adapter +
  grounding + no-sources short-circuit).
- AC5 no silent drop; refusals/failures reported & recoverable → Chunks 8, 9.
- AC6 restart/recovery no loss; in-flight recovery → Chunks 4 (cursor), 9
  (commit-before-ack), Phase 1 pending/failed records.
- AC7 no state-changing command from Telegram → Chunks 2, 9 (intent surface is
  capture/ask/inspect/help only; explicit test).
- AC8 lint/typecheck/tests/build/validate/CI pass → every chunk's DoD gate +
  Chunk 11.
- AC9 independent review finds no critical/high issue → final review pass after
  Chunk 11 (use `superpowers:requesting-code-review`).
