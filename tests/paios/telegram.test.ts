import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import type {
  AnswerSynthesisProvider,
  ConverseRequest,
  ConverseResult,
  SummarizeRequest,
  SummarizeResult,
  SynthesisRequest,
  SynthesisResult,
} from "../../src/paios/synthesis/provider.js";
import type {
  CursorStore,
  InboundMessage,
} from "../../src/paios/telegram/messaging.js";
import {
  workspaceKey,
  parseCallbackPayload,
} from "../../src/paios/telegram/messaging.js";
import { parseIntent } from "../../src/paios/telegram/intent.js";
import {
  formatRecallReply,
  formatRecordView,
} from "../../src/paios/telegram/recall.js";
import type { RecordListItem } from "../../src/paios/knowledge/records.js";
import type { KnowledgeRecord } from "../../src/paios/types.js";
import {
  defaultOllamaHost,
  defaultSynthesisModel,
  resolveSynthesisConfig,
  resolveTelegramConfig,
  TelegramConfigError,
} from "../../src/paios/telegram/config.js";
import type { FetchLike } from "../../src/paios/http-fetch.js";
import {
  createTelegramProvider,
  normalizeUpdate,
} from "../../src/paios/telegram/telegram-provider.js";
import { addNote, getRecord, searchRecords } from "../../src/paios/knowledge/records.js";
import type { AudioProcessingOptions } from "../../src/paios/knowledge/audio-processing.js";
import {
  answerQuestion,
  formatAnswerReply,
  handleConversation,
  summarizeRecords,
} from "../../src/paios/telegram/ask.js";
import { captureMessage } from "../../src/paios/telegram/capture.js";
import type {
  MessagingProvider,
  OutboundReply,
} from "../../src/paios/telegram/messaging.js";
import {
  processMessage,
  runAssistant,
  runAssistantOnce,
  type AssistantDeps,
} from "../../src/paios/telegram/assistant.js";
import { collectTelegramDiagnostics } from "../../src/paios/telegram/doctor.js";
import { createDialogueStore } from "../../src/paios/telegram/dialogue.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "paios-telegram-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots.length = 0;
});

/** A synthesis provider that records calls and echoes a fixed answer. */
function fakeSynthesis(answer: string): {
  provider: AnswerSynthesisProvider;
  requests: SynthesisRequest[];
  converseCalls: ConverseRequest[];
} {
  const requests: SynthesisRequest[] = [];
  const converseCalls: ConverseRequest[] = [];
  const provider: AnswerSynthesisProvider = {
    synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
      requests.push(request);
      const citedRecordIds = request.records.map((r) => r.recordId);
      return Promise.resolve({
        outcome: "answered",
        answer,
        citedRecordIds,
      });
    },
    summarize(request: SummarizeRequest): Promise<SummarizeResult> {
      return Promise.resolve({
        summary: `summary of ${request.records.length} record(s)`,
        recordIds: request.records.map((r) => r.recordId),
      });
    },
    converse(request: ConverseRequest): Promise<ConverseResult> {
      converseCalls.push(request);
      return Promise.resolve({ reply: "open conversational reply" });
    },
  };
  return { provider, requests, converseCalls };
}

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; bytes?: Uint8Array } = {},
): Awaited<ReturnType<FetchLike>> {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
    arrayBuffer: () =>
      Promise.resolve(
        (init.bytes ?? new Uint8Array()).buffer as ArrayBuffer,
      ),
  };
}

function scriptedFetch(
  routes: { match: string; respond: () => Awaited<ReturnType<FetchLike>> }[],
): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = (url) => {
    calls.push(url);
    for (const route of routes) {
      if (url.includes(route.match)) {
        return Promise.resolve(route.respond());
      }
    }
    return Promise.resolve(jsonResponse({ ok: false }, { ok: false }));
  };
  return { fetch, calls };
}

function memoryCursorStore(initial: string | null = null): CursorStore {
  let value = initial;
  return {
    read: () => value,
    write: (cursor) => {
      value = cursor;
    },
  };
}

function textUpdate(updateId: number, chatId: number, text: string): unknown {
  return {
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      chat: { id: chatId, type: "private" },
      from: { id: chatId },
      date: 1750000000,
      text,
    },
  };
}

function textMessage(text: string): InboundMessage {
  return {
    provider: "telegram",
    messageId: "1",
    workspace: { channel: "telegram", chatId: "100" },
    senderId: "100",
    kind: "text",
    text,
    timestamp: "2026-06-23T00:00:00.000Z",
    cursor: "1",
  };
}

test("workspaceKey encodes chat-only and chat+thread workspaces", () => {
  assert.equal(
    workspaceKey({ channel: "telegram", chatId: "100" }),
    "telegram:100",
  );
  assert.equal(
    workspaceKey({ channel: "telegram", chatId: "100", threadId: "5" }),
    "telegram:100:5",
  );
});

test("handleConversation grounded mode matches the Phase 2 answer path", async () => {
  const root = temporaryRoot();
  addNote(root, { content: "The spare key is under the blue flowerpot." });
  const store = createDialogueStore();
  const { provider } = fakeSynthesis("It is under the blue flowerpot.");
  const expected = formatAnswerReply(
    await answerQuestion(root, "where is the spare key", provider),
  );
  const reply = await handleConversation(
    { dataRoot: root, synthesis: provider },
    "telegram:100",
    "where is the spare key",
    store,
  );
  assert.equal(reply, expected);
});

test("handleConversation assist general question yields a labelled open reply", async () => {
  const root = temporaryRoot();
  const store = createDialogueStore();
  store.setMode("telegram:100", "assist");
  const { provider, converseCalls } = fakeSynthesis("unused");
  const reply = await handleConversation(
    { dataRoot: root, synthesis: provider },
    "telegram:100",
    "brainstorm names for a project",
    store,
  );
  assert.match(reply, /^\[assist\]/);
  assert.equal(converseCalls.length, 1);
});

test("handleConversation assist does not treat imperative 'me' as a personal fact", async () => {
  const root = temporaryRoot();
  const store = createDialogueStore();
  store.setMode("telegram:100", "assist");
  const { provider, converseCalls } = fakeSynthesis("unused");
  for (const text of [
    "give me three quick tips for focused work",
    "tell me a joke",
    "show me how to write a haiku",
  ]) {
    const reply = await handleConversation(
      { dataRoot: root, synthesis: provider },
      "telegram:100",
      text,
      store,
    );
    assert.match(reply, /^\[assist\]/, text);
    assert.doesNotMatch(reply, /grounded lookup/i, text);
  }
  assert.equal(converseCalls.length, 3);
});

test("handleConversation assist personal-fact routes through grounded retrieval", async () => {
  const root = temporaryRoot();
  addNote(root, { content: "My dentist appointment is on Tuesday at 9am." });
  const store = createDialogueStore();
  store.setMode("telegram:100", "assist");
  const { provider, converseCalls } = fakeSynthesis("Tuesday at 9am.");
  const reply = await handleConversation(
    { dataRoot: root, synthesis: provider },
    "telegram:100",
    "when is my dentist appointment",
    store,
  );
  assert.match(reply, /grounded lookup/i);
  assert.match(reply, /Sources:/);
  assert.equal(converseCalls.length, 0);
});

test("handleConversation assist personal-fact with no source never fabricates", async () => {
  const root = temporaryRoot();
  const store = createDialogueStore();
  store.setMode("telegram:100", "assist");
  const { provider, converseCalls, requests } = fakeSynthesis("should not be used");
  const reply = await handleConversation(
    { dataRoot: root, synthesis: provider },
    "telegram:100",
    "what did i note about my car",
    store,
  );
  assert.match(reply, /grounded lookup/i);
  assert.match(reply, /couldn't find|could not find/i);
  assert.equal(requests.length, 0); // empty retrieval: synthesize never called
  assert.equal(converseCalls.length, 0); // never falls back to open invention
});

test("handleConversation appends user and assistant turns", async () => {
  const root = temporaryRoot();
  const store = createDialogueStore();
  store.setMode("telegram:100", "assist");
  const { provider } = fakeSynthesis("unused");
  await handleConversation(
    { dataRoot: root, synthesis: provider },
    "telegram:100",
    "hello there",
    store,
  );
  const turns = store.recentTurns("telegram:100");
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.role, "user");
  assert.equal(turns[1]?.role, "assistant");
});

test("dialogue store defaults to grounded and toggles mode per key", () => {
  const store = createDialogueStore();
  assert.equal(store.getMode("ws:1"), "grounded");
  store.setMode("ws:1", "assist");
  assert.equal(store.getMode("ws:1"), "assist");
  assert.equal(store.getMode("ws:2"), "grounded");
});

test("dialogue store drops turns older than the ttl and caps at maxTurns", () => {
  let now = 1000;
  const store = createDialogueStore({ ttlMs: 100, maxTurns: 2, now: () => now });
  store.appendTurn("k", { role: "user", text: "old", at: 0 });
  store.appendTurn("k", { role: "user", text: "a", at: 980 });
  store.appendTurn("k", { role: "user", text: "b", at: 990 });
  now = 1001;
  const turns = store.recentTurns("k");
  assert.equal(turns.length, 2);
  assert.deepEqual(turns.map((t) => t.text), ["a", "b"]);
});

test("dialogue store round-trips the last record id per key", () => {
  const store = createDialogueStore();
  assert.equal(store.lastRecordId("k"), undefined);
  store.setLastRecordId("k", "r1");
  assert.equal(store.lastRecordId("k"), "r1");
  assert.equal(store.lastRecordId("other"), undefined);
});

test("parseCallbackPayload parses view/sum tokens and rejects junk", () => {
  assert.deepEqual(parseCallbackPayload("view:abc-123"), {
    action: "view",
    recordId: "abc-123",
  });
  assert.deepEqual(parseCallbackPayload("sum:abc-123"), {
    action: "sum",
    recordId: "abc-123",
  });
  assert.equal(parseCallbackPayload(""), null);
  assert.equal(parseCallbackPayload("x".repeat(200)), null);
  assert.equal(parseCallbackPayload("drop;table"), null);
  assert.equal(parseCallbackPayload("view:bad id"), null);
  assert.equal(parseCallbackPayload("unknown:abc"), null);
});

test("parseIntent recognises ask via /ask and ?", () => {
  assert.deepEqual(parseIntent(textMessage("/ask hello world")), {
    kind: "ask",
    question: "hello world",
  });
  assert.deepEqual(parseIntent(textMessage("? what is x")), {
    kind: "ask",
    question: "what is x",
  });
});

test("parseIntent recognises inspect and help", () => {
  assert.deepEqual(parseIntent(textMessage("/show abc-123")), {
    kind: "inspect",
    recordId: "abc-123",
  });
  assert.deepEqual(parseIntent(textMessage("/help")), { kind: "help" });
  assert.deepEqual(parseIntent(textMessage("/start")), { kind: "help" });
});

test("parseIntent recognises mode toggles", () => {
  assert.deepEqual(parseIntent(textMessage("/grounded")), {
    kind: "set-mode",
    mode: "grounded",
  });
  assert.deepEqual(parseIntent(textMessage("/assist")), {
    kind: "set-mode",
    mode: "assist",
  });
  assert.deepEqual(parseIntent(textMessage("/chat")), {
    kind: "set-mode",
    mode: "assist",
  });
  // Bare words without a slash are still captured as notes, not mode toggles.
  assert.deepEqual(parseIntent(textMessage("assist me please")), {
    kind: "capture",
  });
});

test("parseIntent recognises summarize by id, bare, and recent", () => {
  assert.deepEqual(parseIntent(textMessage("/summarize r1")), {
    kind: "summarize",
    recordId: "r1",
  });
  assert.deepEqual(parseIntent(textMessage("/summarize")), {
    kind: "summarize",
  });
  const recent = parseIntent(textMessage("summarize my recent notes"));
  assert.equal(recent.kind, "summarize");
  assert.deepEqual(
    recent.kind === "summarize" ? recent.recent?.sourceTypes : null,
    ["note"],
  );
  assert.deepEqual(parseIntent(textMessage("summarize this")), {
    kind: "summarize",
  });
});

test("summarizeRecords summarizes a record and reports an empty selection", async () => {
  const root = temporaryRoot();
  const note = addNote(root, { content: "a note worth summarizing" });
  const { provider } = fakeSynthesis("unused");
  const ok = await summarizeRecords(root, { recordId: note.id }, provider);
  assert.equal(ok.outcome, "summarized");
  assert.deepEqual(ok.recordIds, [note.id]);
  assert.match(ok.summary, /summary of 1/);

  const missing = await summarizeRecords(
    root,
    { recordId: "does-not-exist" },
    provider,
  );
  assert.equal(missing.outcome, "no-records");
});

test("summarizeRecords summarizes a recent set by type", async () => {
  const root = temporaryRoot();
  addNote(root, { content: "first recent note" });
  addNote(root, { content: "second recent note" });
  const { provider } = fakeSynthesis("unused");
  const out = await summarizeRecords(
    root,
    { recent: { sourceTypes: ["note"], limit: 5 } },
    provider,
  );
  assert.equal(out.outcome, "summarized");
  assert.equal(out.recordIds.length, 2);
});

test("parseIntent recognises recency phrases as recall", () => {
  for (const text of [
    "latest",
    "recent notes",
    "my last voice note",
    "what did I capture today",
    "/recent",
    "/latest",
  ]) {
    assert.equal(parseIntent(textMessage(text)).kind, "recall", text);
  }
});

test("parseIntent maps voice phrasing to the audio source type", () => {
  const intent = parseIntent(textMessage("my last voice note"));
  assert.deepEqual(
    intent.kind === "recall" ? intent.sourceTypes : null,
    ["audio"],
  );
  const notes = parseIntent(textMessage("recent notes"));
  assert.deepEqual(
    notes.kind === "recall" ? notes.sourceTypes : null,
    ["note"],
  );
});

test("parseIntent still treats content questions as ask, not recall", () => {
  assert.equal(parseIntent(textMessage("?what is my blood pressure")).kind, "ask");
});

test("formatRecallReply lists records newest-first and handles empty", () => {
  assert.match(formatRecallReply([]).text, /didn't find|no records/i);
  const item: RecordListItem = {
    id: "r1",
    sourceType: "note",
    title: "Groceries",
    capturedAt: "2026-06-24T10:00:00.000Z",
    sourceReference: "sources/notes/r1.txt",
    state: "ready",
  };
  const text = formatRecallReply([item]).text;
  assert.match(text, /r1/);
  assert.match(text, /Groceries/);
});

function knowledgeRecordFixture(text: string): KnowledgeRecord {
  return {
    id: "r1",
    sourceType: "note",
    title: "T",
    sourceReference: "sources/notes/r1.txt",
    capturedAt: "2026-06-24T10:00:00.000Z",
    state: "ready",
    normalizedText: text,
    provenance: { adapter: "telegram-note", byteLength: text.length, checksum: "c" },
    error: null,
  };
}

test("formatRecordView shows short content in full without truncation", () => {
  const out = formatRecordView(knowledgeRecordFixture("hello world"));
  assert.match(out, /r1/);
  assert.match(out, /hello world/);
  assert.doesNotMatch(out, /truncated/i);
});

test("formatRecordView bounds long content with a truncation marker", () => {
  const out = formatRecordView(knowledgeRecordFixture("x".repeat(5000)), 1000);
  assert.ok(out.length <= 1200);
  assert.match(out, /truncated/i);
});

test("parseIntent treats plain text as capture and empty ask as help", () => {
  assert.deepEqual(parseIntent(textMessage("just a note")), {
    kind: "capture",
  });
  assert.deepEqual(parseIntent(textMessage("/ask    ")), { kind: "help" });
});

test("parseIntent treats non-text messages as capture", () => {
  const voice: InboundMessage = {
    provider: "telegram",
    messageId: "2",
    workspace: { channel: "telegram", chatId: "100" },
    senderId: "100",
    kind: "voice",
    attachment: { reference: "file-1" },
    timestamp: "2026-06-23T00:00:00.000Z",
    cursor: "2",
  };
  assert.deepEqual(parseIntent(voice), { kind: "capture" });
});

test("resolveTelegramConfig reads token and allowlist", () => {
  const config = resolveTelegramConfig({
    TELEGRAM_BOT_TOKEN: "123:abc",
    TELEGRAM_ALLOWED_CHAT_IDS: "100, 200 ,300",
  });
  assert.equal(config.botToken, "123:abc");
  assert.deepEqual([...config.allowedChatIds].sort(), ["100", "200", "300"]);
});

test("resolveTelegramConfig rejects missing token and empty allowlist", () => {
  assert.throws(
    () => resolveTelegramConfig({ TELEGRAM_ALLOWED_CHAT_IDS: "100" }),
    TelegramConfigError,
  );
  assert.throws(
    () =>
      resolveTelegramConfig({
        TELEGRAM_BOT_TOKEN: "123:abc",
        TELEGRAM_ALLOWED_CHAT_IDS: " , ",
      }),
    TelegramConfigError,
  );
});

test("resolveSynthesisConfig applies defaults and honours overrides", () => {
  const defaults = resolveSynthesisConfig({});
  assert.equal(defaults.ollamaHost, defaultOllamaHost);
  assert.equal(defaults.model, defaultSynthesisModel);
  const overridden = resolveSynthesisConfig({
    OLLAMA_HOST: "http://10.0.0.1:1234",
    PAIOS_SYNTHESIS_MODEL: "mistral",
  });
  assert.equal(overridden.ollamaHost, "http://10.0.0.1:1234");
  assert.equal(overridden.model, "mistral");
});

const allowed = new Set(["100"]);

test("normalizeUpdate maps text, voice, audio, and document", () => {
  const text = normalizeUpdate(textUpdate(5, 100, "hi"), allowed);
  assert.equal(text?.kind, "text");
  assert.equal(text?.text, "hi");
  assert.equal(text?.workspace.chatId, "100");
  assert.equal(text?.cursor, "5");

  const voice = normalizeUpdate(
    {
      update_id: 6,
      message: {
        message_id: 60,
        chat: { id: 100, type: "private" },
        from: { id: 100 },
        date: 1,
        voice: { file_id: "vf", file_unique_id: "vu", mime_type: "audio/ogg" },
      },
    },
    allowed,
  );
  assert.equal(voice?.kind, "voice");
  assert.equal(voice?.attachment?.reference, "vf");
  assert.equal(voice?.attachment?.uniqueReference, "vu");

  const doc = normalizeUpdate(
    {
      update_id: 7,
      message: {
        message_id: 70,
        chat: { id: 100, type: "private" },
        from: { id: 100 },
        date: 1,
        document: {
          file_id: "df",
          file_unique_id: "du",
          file_name: "note.md",
          mime_type: "text/markdown",
        },
      },
    },
    allowed,
  );
  assert.equal(doc?.kind, "document");
  assert.equal(doc?.attachment?.originalName, "note.md");
});

test("normalizeUpdate sets a forum thread workspace", () => {
  const message = normalizeUpdate(
    {
      update_id: 8,
      message: {
        message_id: 80,
        chat: { id: 100, type: "supergroup" },
        from: { id: 100 },
        date: 1,
        is_topic_message: true,
        message_thread_id: 42,
        text: "in topic",
      },
    },
    allowed,
  );
  assert.equal(message?.workspace.threadId, "42");
});

test("normalizeUpdate drops unlisted identities and non-messages", () => {
  assert.equal(normalizeUpdate(textUpdate(9, 999, "blocked"), allowed), null);
  assert.equal(normalizeUpdate({ update_id: 10 }, allowed), null);
});

test("normalizeUpdate marks unhandled content unsupported", () => {
  const sticker = normalizeUpdate(
    {
      update_id: 11,
      message: {
        message_id: 110,
        chat: { id: 100, type: "private" },
        from: { id: 100 },
        date: 1,
        sticker: { file_id: "sf" },
      },
    },
    allowed,
  );
  assert.equal(sticker?.kind, "unsupported");
});

function callbackUpdate(
  updateId: number,
  chatId: number,
  data: string,
): unknown {
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: chatId },
      message: {
        message_id: updateId * 10,
        chat: { id: chatId, type: "private" },
        date: 1750000000,
      },
      data,
    },
  };
}

test("sendReply attaches an inline keyboard when actions are present", async () => {
  const bodies: string[] = [];
  const fetch: FetchLike = (_url, init) => {
    if (init?.body !== undefined) {
      bodies.push(String(init.body));
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  };
  const provider = createTelegramProvider({
    config: { botToken: "t", allowedChatIds: allowed },
    cursorStore: memoryCursorStore(null),
    fetch,
  });
  await provider.sendReply({
    workspace: { channel: "telegram", chatId: "100" },
    text: "hi",
    actions: [{ label: "👁 View", payload: "view:r1" }],
  });
  const body = JSON.parse(bodies[0] ?? "{}") as {
    reply_markup: {
      inline_keyboard: { text: string; callback_data: string }[][];
    };
  };
  const button = body.reply_markup.inline_keyboard[0]?.[0];
  assert.equal(button?.callback_data, "view:r1");
  assert.equal(button?.text, "👁 View");
});

test("poll normalizes a callback_query from an allowlisted user", async () => {
  const { fetch } = scriptedFetch([
    {
      match: "/getUpdates",
      respond: () =>
        jsonResponse({ ok: true, result: [callbackUpdate(20, 100, "view:r1")] }),
    },
  ]);
  const provider = createTelegramProvider({
    config: { botToken: "t", allowedChatIds: allowed },
    cursorStore: memoryCursorStore(null),
    fetch,
  });
  const messages = await provider.poll(0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.kind, "callback");
  assert.equal(messages[0]?.callback?.payload, "view:r1");
  assert.equal(messages[0]?.callback?.callbackId, "cb-20");
  assert.equal(messages[0]?.workspace.chatId, "100");
});

test("poll drops a callback_query from a non-allowlisted user", async () => {
  const { fetch } = scriptedFetch([
    {
      match: "/getUpdates",
      respond: () =>
        jsonResponse({ ok: true, result: [callbackUpdate(21, 999, "view:r1")] }),
    },
  ]);
  const provider = createTelegramProvider({
    config: { botToken: "t", allowedChatIds: allowed },
    cursorStore: memoryCursorStore(null),
    fetch,
  });
  assert.equal((await provider.poll(0)).length, 0);
});

test("answerCallback posts to answerCallbackQuery", async () => {
  const { fetch, calls } = scriptedFetch([
    { match: "/answerCallbackQuery", respond: () => jsonResponse({ ok: true }) },
  ]);
  const provider = createTelegramProvider({
    config: { botToken: "t", allowedChatIds: allowed },
    cursorStore: memoryCursorStore(null),
    fetch,
  });
  await provider.answerCallback?.("cb-20");
  assert.ok(calls.some((url) => url.includes("/answerCallbackQuery")));
});

test("provider polls with the stored offset and filters the allowlist", async () => {
  const { fetch, calls } = scriptedFetch([
    {
      match: "/getUpdates",
      respond: () =>
        jsonResponse({
          ok: true,
          result: [textUpdate(12, 100, "ok"), textUpdate(13, 999, "blocked")],
        }),
    },
  ]);
  const provider = createTelegramProvider({
    config: { botToken: "t", allowedChatIds: allowed },
    cursorStore: memoryCursorStore("13"),
    fetch,
  });
  const messages = await provider.poll(0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, "ok");
  assert.ok(calls.some((url) => url.includes("offset=13")));
});

test("provider acknowledge advances the stored offset", async () => {
  const store = memoryCursorStore(null);
  const { fetch, calls } = scriptedFetch([
    { match: "/getUpdates", respond: () => jsonResponse({ ok: true, result: [] }) },
  ]);
  const provider = createTelegramProvider({
    config: { botToken: "t", allowedChatIds: allowed },
    cursorStore: store,
    fetch,
  });
  await provider.acknowledge("12");
  assert.equal(store.read(), "13");
  await provider.poll(0);
  assert.ok(calls.some((url) => url.includes("offset=13")));
});

test("provider downloads an attachment by resolving its file path", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const { fetch } = scriptedFetch([
    {
      match: "/getFile",
      respond: () =>
        jsonResponse({ ok: true, result: { file_path: "voice/f.oga" } }),
    },
    { match: "/file/bot", respond: () => jsonResponse({}, { bytes }) },
  ]);
  const provider = createTelegramProvider({
    config: { botToken: "secret-token", allowedChatIds: allowed },
    cursorStore: memoryCursorStore(null),
    fetch,
  });
  const downloaded = await provider.downloadAttachment({ reference: "fid" });
  assert.deepEqual([...downloaded], [1, 2, 3, 4]);
});

test("answerQuestion synthesises from a matching local record", async () => {
  const root = temporaryRoot();
  const note = addNote(root, {
    content: "The spare key is under the blue flowerpot.",
  });
  const { provider, requests } = fakeSynthesis("It is under the blue flowerpot.");
  const result = await answerQuestion(root, "where is the spare key", provider);
  assert.equal(result.outcome, "answered");
  assert.equal(requests.length, 1);
  assert.ok(result.citations.some((c) => c.recordId === note.id));
  assert.match(formatAnswerReply(result), /flowerpot/);
  assert.match(formatAnswerReply(result), /Sources:/);
});

test("answerQuestion reports no-sources without calling the model", async () => {
  const root = temporaryRoot();
  addNote(root, { content: "totally unrelated content about gardening" });
  const { provider, requests } = fakeSynthesis("should not be used");
  const result = await answerQuestion(root, "quantum chromodynamics", provider);
  assert.equal(result.outcome, "no-sources");
  assert.equal(requests.length, 0);
  assert.match(formatAnswerReply(result), /couldn't find|could not find/i);
});

function wavBytes(): Uint8Array {
  const bytes = Buffer.alloc(44);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(0, 40);
  return bytes;
}

function canonicalWav(): Buffer {
  const bytes = Buffer.from(wavBytes());
  bytes.writeUInt16LE(1, 20);
  return bytes;
}

/** A messaging provider stub whose download returns fixed bytes. */
function downloadProvider(bytes: Uint8Array): MessagingProvider {
  return {
    poll: () => Promise.resolve([]),
    sendReply: () => Promise.resolve(),
    downloadAttachment: () => Promise.resolve(bytes),
    acknowledge: () => Promise.resolve(),
  };
}

/** Build AudioProcessingOptions backed by deterministic fake subprocesses. */
function fakeAudioOptions(root: string, transcript: string): AudioProcessingOptions {
  const temporaryRoot = join(root, "temporary");
  const modelPath = join(root, "model.bin");
  writeFileSync(modelPath, "model fixture");
  return {
    normalizer: {
      ffmpegCommand: "ffmpeg",
      temporaryRoot,
      runProcess: (_command, args) => {
        writeFileSync(args[16] ?? "", canonicalWav());
        return { status: 0, stderr: "" };
      },
    },
    transcriber: {
      whisperCommand: "whisper-cli",
      whisperVersion: "fake 1.0",
      modelPath,
      temporaryRoot,
      runProcess: (_command, args) => {
        writeFileSync(`${args[8]}.txt`, transcript);
        return { status: 0, stderr: "" };
      },
    },
  };
}

function inboundFor(
  kind: InboundMessage["kind"],
  extra: Partial<InboundMessage>,
): InboundMessage {
  return {
    provider: "telegram",
    messageId: "55",
    workspace: { channel: "telegram", chatId: "100" },
    senderId: "100",
    kind,
    timestamp: "2026-06-23T00:00:00.000Z",
    cursor: "55",
    ...extra,
  };
}

test("captureMessage stores a text note with Telegram provenance", async () => {
  const root = temporaryRoot();
  const result = await captureMessage(
    inboundFor("text", { text: "buy oat milk" }),
    { dataRoot: root, tempRoot: join(root, "tmp"), provider: downloadProvider(new Uint8Array()) },
  );
  assert.equal(result.status, "captured");
  const record = getRecord(root, result.recordId ?? "");
  assert.equal(record?.sourceType, "note");
  assert.equal(record?.provenance.adapter, "telegram-note");
  assert.deepEqual(record?.provenance.externalReference, {
    channel: "telegram",
    chatId: "100",
    messageId: "55",
  });
});

test("captureMessage imports a supported document and refuses an unsupported one", async () => {
  const root = temporaryRoot();
  const md = await captureMessage(
    inboundFor("document", {
      attachment: { reference: "f1", originalName: "plan.md" },
    }),
    {
      dataRoot: root,
      tempRoot: join(root, "tmp"),
      provider: downloadProvider(Buffer.from("# Plan\nship it\n")),
    },
  );
  assert.equal(md.status, "captured");
  assert.equal(getRecord(root, md.recordId ?? "")?.sourceType, "managed-file");

  const bin = await captureMessage(
    inboundFor("document", {
      attachment: { reference: "f2", originalName: "blob.bin" },
    }),
    {
      dataRoot: root,
      tempRoot: join(root, "tmp"),
      provider: downloadProvider(Buffer.from([0, 1, 2, 3])),
    },
  );
  assert.equal(bin.status, "refused");
  assert.equal(bin.recordId, undefined);
});

test("captureMessage reports a duplicate text capture", async () => {
  const root = temporaryRoot();
  const deps = {
    dataRoot: root,
    tempRoot: join(root, "tmp"),
    provider: downloadProvider(new Uint8Array()),
  };
  await captureMessage(inboundFor("text", { text: "same body" }), deps);
  const second = await captureMessage(
    inboundFor("text", { text: "same body", messageId: "56", cursor: "56" }),
    deps,
  );
  assert.equal(second.status, "duplicate");
});

test("captureMessage transcribes a voice note so its transcript is searchable", async () => {
  const root = temporaryRoot();
  const result = await captureMessage(
    inboundFor("voice", { attachment: { reference: "vf" } }),
    {
      dataRoot: root,
      tempRoot: join(root, "tmp"),
      provider: downloadProvider(wavBytes()),
      audio: fakeAudioOptions(root, "remember the umbrella"),
    },
  );
  assert.equal(result.status, "captured");
  const record = getRecord(root, result.recordId ?? "");
  assert.equal(record?.sourceType, "audio");
  assert.equal(record?.state, "ready");
  const hits = searchRecords(root, '"umbrella"');
  assert.ok(hits.some((hit) => hit.recordId === result.recordId));
});

/** Stateful fake provider: messages stay pending until acknowledged. */
class FakeAssistantProvider implements MessagingProvider {
  private pending: InboundMessage[];
  readonly sent: OutboundReply[] = [];
  readonly acked: string[] = [];
  ackShouldThrow = false;
  private readonly bytes: Uint8Array;
  downloadShouldThrow = false;

  constructor(messages: InboundMessage[], bytes: Uint8Array = new Uint8Array()) {
    this.pending = [...messages];
    this.bytes = bytes;
  }

  poll(): Promise<InboundMessage[]> {
    return Promise.resolve([...this.pending]);
  }

  sendReply(reply: OutboundReply): Promise<void> {
    this.sent.push(reply);
    return Promise.resolve();
  }

  downloadAttachment(): Promise<Uint8Array> {
    if (this.downloadShouldThrow) {
      return Promise.reject(new Error("network down"));
    }
    return Promise.resolve(this.bytes);
  }

  acknowledge(cursor: string): Promise<void> {
    if (this.ackShouldThrow) {
      return Promise.reject(new Error("crash before ack persisted"));
    }
    this.pending = this.pending.filter((message) => message.cursor !== cursor);
    this.acked.push(cursor);
    return Promise.resolve();
  }
}

function assistantDeps(
  root: string,
  provider: MessagingProvider,
  synthesis: AnswerSynthesisProvider,
): AssistantDeps {
  return {
    dataRoot: root,
    tempRoot: join(root, "tmp"),
    provider,
    synthesis,
  };
}

test("runAssistantOnce captures a text note, replies, and acknowledges", async () => {
  const root = temporaryRoot();
  const message = inboundFor("text", { text: "pick up parcel", cursor: "70" });
  const provider = new FakeAssistantProvider([message]);
  const { provider: synthesis } = fakeSynthesis("unused");
  const count = await runAssistantOnce(assistantDeps(root, provider, synthesis));
  assert.equal(count, 1);
  assert.match(provider.sent[0]?.text ?? "", /Captured note/);
  assert.deepEqual(provider.acked, ["70"]);
  assert.equal(searchRecords(root, '"parcel"').length, 1);
});

test("help reply documents the Phase 3 capabilities", async () => {
  const root = temporaryRoot();
  const { provider: synthesis } = fakeSynthesis("unused");
  const reply = await processMessage(
    inboundFor("text", { text: "/help" }),
    assistantDeps(root, new FakeAssistantProvider([]), synthesis),
  );
  for (const fragment of [
    "recent",
    "/show",
    "/summarize",
    "/assist",
    "/grounded",
    "View",
  ]) {
    assert.match(reply.text, new RegExp(fragment.replace("/", "\\/")), fragment);
  }
});

test("processMessage answers a question citing a seeded record", async () => {
  const root = temporaryRoot();
  const note = addNote(root, { content: "The router password is hunter2." });
  const { provider: synthesis } = fakeSynthesis("It is hunter2.");
  const reply = await processMessage(
    inboundFor("text", { text: "/ask what is the router password" }),
    assistantDeps(root, new FakeAssistantProvider([]), synthesis),
  );
  assert.match(reply.text, /hunter2/);
  assert.match(reply.text, new RegExp(note.id));
});

test("processMessage shows an inspected record and reports missing ones", async () => {
  const root = temporaryRoot();
  const note = addNote(root, { content: "inspect me" });
  const { provider: synthesis } = fakeSynthesis("unused");
  const deps = assistantDeps(root, new FakeAssistantProvider([]), synthesis);
  const found = await processMessage(
    inboundFor("text", { text: `/show ${note.id}` }),
    deps,
  );
  assert.match(found.text, new RegExp(note.id));
  assert.match(found.text, /State: ready/);
  assert.match(found.text, /inspect me/);
  const missing = await processMessage(
    inboundFor("text", { text: "/show does-not-exist" }),
    deps,
  );
  assert.match(missing.text, /not found/i);
});

test("processMessage set-mode persists per workspace and labels assist replies", async () => {
  const root = temporaryRoot();
  const store = createDialogueStore();
  const { provider: synthesis } = fakeSynthesis("unused");
  const deps: AssistantDeps = {
    ...assistantDeps(root, new FakeAssistantProvider([]), synthesis),
    dialogue: store,
  };
  const toggled = await processMessage(
    inboundFor("text", { text: "/assist" }),
    deps,
  );
  assert.match(toggled.text, /assist mode/i);
  assert.equal(store.getMode("telegram:100"), "assist");
  const chatted = await processMessage(
    inboundFor("text", { text: "brainstorm a name" }),
    deps,
  );
  assert.match(chatted.text, /^\[assist\]/);
});

test("processMessage capture confirmation carries view/summarize actions", async () => {
  const root = temporaryRoot();
  const { provider: synthesis } = fakeSynthesis("unused");
  const deps = assistantDeps(root, new FakeAssistantProvider([]), synthesis);
  const reply = await processMessage(
    inboundFor("text", { text: "buy oat milk" }),
    deps,
  );
  assert.match(reply.text, /Captured note/);
  assert.equal(reply.actions?.length, 2);
  assert.match(reply.actions?.[0]?.payload ?? "", /^view:/);
  assert.match(reply.actions?.[1]?.payload ?? "", /^sum:/);
});

test("processMessage handles a view callback and acknowledges the tap", async () => {
  const root = temporaryRoot();
  const note = addNote(root, { content: "callback target content" });
  const acked: string[] = [];
  const provider: MessagingProvider = {
    poll: () => Promise.resolve([]),
    sendReply: () => Promise.resolve(),
    downloadAttachment: () => Promise.resolve(new Uint8Array()),
    acknowledge: () => Promise.resolve(),
    answerCallback: (id) => {
      acked.push(id);
      return Promise.resolve();
    },
  };
  const { provider: synthesis } = fakeSynthesis("unused");
  const reply = await processMessage(
    inboundFor("callback", {
      callback: { payload: `view:${note.id}`, callbackId: "cb-1" },
    }),
    assistantDeps(root, provider, synthesis),
  );
  assert.match(reply.text, /callback target content/);
  assert.deepEqual(acked, ["cb-1"]);
});

test("processMessage recall lists records with an action on the latest", async () => {
  const root = temporaryRoot();
  addNote(
    root,
    { content: "first" },
    { adapter: "telegram-note", externalReference: { channel: "telegram", chatId: "100", messageId: "1" } },
  );
  const second = addNote(
    root,
    { content: "second" },
    { adapter: "telegram-note", externalReference: { channel: "telegram", chatId: "100", messageId: "2" } },
  );
  const { provider: synthesis } = fakeSynthesis("unused");
  const reply = await processMessage(
    inboundFor("text", { text: "recent" }),
    assistantDeps(root, new FakeAssistantProvider([]), synthesis),
  );
  assert.match(reply.text, new RegExp(second.id));
  assert.match(reply.actions?.[0]?.payload ?? "", new RegExp(`view:${second.id}`));
});

test("a failed capture is reported and still acknowledged (no silent drop)", async () => {
  const root = temporaryRoot();
  const message = inboundFor("voice", {
    attachment: { reference: "vf" },
    cursor: "71",
  });
  const provider = new FakeAssistantProvider([message]);
  provider.downloadShouldThrow = true;
  const { provider: synthesis } = fakeSynthesis("unused");
  await runAssistantOnce(assistantDeps(root, provider, synthesis));
  assert.match(provider.sent[0]?.text ?? "", /failed|went wrong/i);
  assert.deepEqual(provider.acked, ["71"]);
});

test("an unacknowledged message is redelivered without duplicating the record", async () => {
  const root = temporaryRoot();
  const message = inboundFor("text", { text: "redelivered note", cursor: "72" });
  const provider = new FakeAssistantProvider([message]);
  const { provider: synthesis } = fakeSynthesis("unused");
  const deps = assistantDeps(root, provider, synthesis);

  provider.ackShouldThrow = true;
  await assert.rejects(runAssistantOnce(deps));
  assert.equal(searchRecords(root, '"redelivered"').length, 1);

  provider.ackShouldThrow = false;
  await runAssistantOnce(deps);
  assert.deepEqual(provider.acked, ["72"]);
  // The record was committed once; redelivery reported it as a duplicate.
  assert.equal(searchRecords(root, '"redelivered"').length, 1);
  assert.match(provider.sent[1]?.text ?? "", /[Aa]lready captured/);
});

test("a command-looking message is captured as a note, not executed", async () => {
  const root = temporaryRoot();
  const message = inboundFor("text", {
    text: "/delete all my records",
    cursor: "73",
  });
  const provider = new FakeAssistantProvider([message]);
  const { provider: synthesis } = fakeSynthesis("unused");
  await runAssistantOnce(assistantDeps(root, provider, synthesis));
  assert.match(provider.sent[0]?.text ?? "", /Captured note/);
  const hits = searchRecords(root, '"delete"');
  assert.equal(hits.length, 1);
});

test("runAssistant stops when the control predicate is set", async () => {
  const root = temporaryRoot();
  const provider = new FakeAssistantProvider([]);
  const { provider: synthesis } = fakeSynthesis("unused");
  let ticks = 0;
  await runAssistant(assistantDeps(root, provider, synthesis), {
    stop: () => {
      ticks += 1;
      return ticks > 2;
    },
  });
  assert.ok(ticks >= 2);
});

test("collectTelegramDiagnostics reports ready when token, allowlist, and model are present", async () => {
  const { fetch } = scriptedFetch([
    {
      match: "/api/tags",
      respond: () =>
        jsonResponse({ models: [{ name: "llama3.1:8b" }, { name: "other" }] }),
    },
  ]);
  const result = await collectTelegramDiagnostics(
    {
      TELEGRAM_BOT_TOKEN: "123:abc",
      TELEGRAM_ALLOWED_CHAT_IDS: "100",
    },
    fetch,
  );
  assert.equal(result.tokenConfigured, true);
  assert.equal(result.allowlistCount, 1);
  assert.equal(result.ollamaReachable, true);
  assert.equal(result.modelPresent, true);
  assert.equal(result.ready, true);
});

test("collectTelegramDiagnostics is not ready without a token or a pulled model", async () => {
  const { fetch } = scriptedFetch([
    { match: "/api/tags", respond: () => jsonResponse({ models: [] }) },
  ]);
  const noToken = await collectTelegramDiagnostics({}, fetch);
  assert.equal(noToken.tokenConfigured, false);
  assert.equal(noToken.ready, false);

  const noModel = await collectTelegramDiagnostics(
    { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_ALLOWED_CHAT_IDS: "100" },
    fetch,
  );
  assert.equal(noModel.ollamaReachable, true);
  assert.equal(noModel.modelPresent, false);
  assert.equal(noModel.ready, false);

  // No secret value leaks into the human-readable summary.
  assert.ok(noModel.summary.every((line) => !line.includes("123:abc")));
});
