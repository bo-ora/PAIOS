import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import type {
  AnswerSynthesisProvider,
  SynthesisRequest,
  SynthesisResult,
} from "../../src/paios/synthesis/provider.js";
import type {
  CursorStore,
  InboundMessage,
} from "../../src/paios/telegram/messaging.js";
import { workspaceKey } from "../../src/paios/telegram/messaging.js";
import { parseIntent } from "../../src/paios/telegram/intent.js";
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
} {
  const requests: SynthesisRequest[] = [];
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
  };
  return { provider, requests };
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

test("processMessage answers a question citing a seeded record", async () => {
  const root = temporaryRoot();
  const note = addNote(root, { content: "The router password is hunter2." });
  const { provider: synthesis } = fakeSynthesis("It is hunter2.");
  const reply = await processMessage(
    inboundFor("text", { text: "/ask what is the router password" }),
    assistantDeps(root, new FakeAssistantProvider([]), synthesis),
  );
  assert.match(reply, /hunter2/);
  assert.match(reply, new RegExp(note.id));
});

test("processMessage summarises an inspected record and reports missing ones", async () => {
  const root = temporaryRoot();
  const note = addNote(root, { content: "inspect me" });
  const { provider: synthesis } = fakeSynthesis("unused");
  const deps = assistantDeps(root, new FakeAssistantProvider([]), synthesis);
  const found = await processMessage(
    inboundFor("text", { text: `/show ${note.id}` }),
    deps,
  );
  assert.match(found, new RegExp(note.id));
  assert.match(found, /State: ready/);
  const missing = await processMessage(
    inboundFor("text", { text: "/show does-not-exist" }),
    deps,
  );
  assert.match(missing, /not found/i);
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
