import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { InboundMessage } from "../../src/paios/telegram/messaging.js";
import { workspaceKey } from "../../src/paios/telegram/messaging.js";
import { parseIntent } from "../../src/paios/telegram/intent.js";

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
