import * as assert from "node:assert/strict";
import { test } from "node:test";

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
