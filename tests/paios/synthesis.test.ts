import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { RetrievedRecord } from "../../src/paios/synthesis/provider.js";
import {
  buildAssistPrompt,
  buildSummaryPrompt,
  buildSynthesisPrompt,
  extractCitations,
  toSearchQuery,
} from "../../src/paios/synthesis/provider.js";
import type { FetchLike } from "../../src/paios/http-fetch.js";
import { createOllamaProvider } from "../../src/paios/synthesis/ollama-provider.js";

function record(recordId: string, text: string): RetrievedRecord {
  return { recordId, title: null, sourceReference: `sources/${recordId}`, text };
}

function fakeChatFetch(
  content: string,
  init: { ok?: boolean; status?: number } = {},
): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = (url) => {
    calls.push(url);
    return Promise.resolve({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: () =>
        Promise.resolve({ message: { role: "assistant", content } }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
  };
  return { fetch, calls };
}

const synthesisConfig = { ollamaHost: "http://127.0.0.1:11434", model: "test-model" };

test("toSearchQuery keeps content words and drops common stopwords", () => {
  assert.equal(
    toSearchQuery("What is my passport number?"),
    '"passport" OR "number"',
  );
  assert.equal(
    toSearchQuery("what is the capital of france"),
    '"capital" OR "france"',
  );
});

test("toSearchQuery dedupes tokens and drops single characters", () => {
  assert.equal(toSearchQuery("a dog a DOG"), '"dog"');
});

test("toSearchQuery returns empty string when only stopwords remain", () => {
  assert.equal(toSearchQuery("?!  a"), "");
  assert.equal(toSearchQuery("what is the"), "");
});

test("buildSynthesisPrompt frames sources as the user's own knowledge", () => {
  const prompt = buildSynthesisPrompt({
    question: "q",
    records: [record("r1", "x")],
  });
  assert.match(prompt.system, /your|user|own/i);
});

test("buildSynthesisPrompt embeds every record id and a grounding rule", () => {
  const prompt = buildSynthesisPrompt({
    question: "where is the key",
    records: [record("r1", "key is under the mat"), record("r2", "other")],
  });
  assert.match(prompt.user, /r1/);
  assert.match(prompt.user, /r2/);
  assert.match(prompt.user, /where is the key/);
  assert.match(prompt.system, /only/i);
  assert.match(prompt.system, /cannot|don't know|do not know/i);
});

test("extractCitations returns supplied ids in record order, ignoring unknown", () => {
  const records = [record("r1", "a"), record("r2", "b"), record("r3", "c")];
  assert.deepEqual(
    extractCitations("see [r3] and [r1] and [r9]", records),
    ["r1", "r3"],
  );
});

test("ollama provider returns no-sources without calling the model", async () => {
  const { fetch, calls } = fakeChatFetch("unused");
  const provider = createOllamaProvider({ config: synthesisConfig, fetch });
  const result = await provider.synthesize({ question: "q", records: [] });
  assert.equal(result.outcome, "no-sources");
  assert.equal(calls.length, 0);
});

test("ollama provider posts to /api/chat and extracts citations", async () => {
  const { fetch, calls } = fakeChatFetch("The key is under the mat [r1].");
  const provider = createOllamaProvider({ config: synthesisConfig, fetch });
  const result = await provider.synthesize({
    question: "where is the key",
    records: [record("r1", "key under mat"), record("r2", "unrelated")],
  });
  assert.equal(result.outcome, "answered");
  assert.match(result.answer, /under the mat/);
  assert.deepEqual(result.citedRecordIds, ["r1"]);
  assert.ok(calls.some((url) => url.includes("/api/chat")));
});

test("ollama provider throws on a non-ok response", async () => {
  const { fetch } = fakeChatFetch("", { ok: false, status: 500 });
  const provider = createOllamaProvider({ config: synthesisConfig, fetch });
  await assert.rejects(
    provider.synthesize({ question: "q", records: [record("r1", "x")] }),
  );
});

test("buildSummaryPrompt instructs faithful transform over the given records", () => {
  const prompt = buildSummaryPrompt({
    records: [record("r1", "a long note about gardening"), record("r2", "more")],
  });
  assert.match(prompt.system, /summari/i);
  assert.match(prompt.system, /not (add|invent|fabricate)|only/i);
  assert.match(prompt.user, /r1/);
  assert.match(prompt.user, /gardening/);
});

test("buildSummaryPrompt forbids refusing or moralizing over the user's own data", () => {
  const prompt = buildSummaryPrompt({
    records: [record("r1", "personal details about my family and life")],
  });
  // The model must not apply a generic personal-data safety refusal to the
  // user's own records (regression: llama3.1:8b refused a voice-note summary).
  // The prompt forbids disclaimers/refusals and avoids foregrounding
  // personal/private/sensitive framing that primes the refusal.
  assert.match(prompt.system, /no refusals?|do not refuse|never refuse|no disclaimers/i);
});

test("buildAssistPrompt forbids asserting ungrounded personal facts", () => {
  const prompt = buildAssistPrompt({ message: "hi", context: [] });
  assert.match(prompt.system, /do not state facts about the user|personal/i);
  assert.match(prompt.system, /source/i);
  assert.equal(prompt.messages.at(-1)?.content, "hi");
});

test("buildAssistPrompt threads prior turns as conversation history", () => {
  const prompt = buildAssistPrompt({
    message: "and the second?",
    context: [
      { role: "user", text: "first question" },
      { role: "assistant", text: "first answer" },
    ],
  });
  assert.equal(prompt.messages.length, 3);
  assert.equal(prompt.messages[0]?.content, "first question");
  assert.equal(prompt.messages.at(-1)?.content, "and the second?");
});

test("ollama provider converses over the chat endpoint", async () => {
  const { fetch, calls } = fakeChatFetch("Here are some ideas.");
  const provider = createOllamaProvider({ config: synthesisConfig, fetch });
  const result = await provider.converse({ message: "brainstorm", context: [] });
  assert.match(result.reply, /ideas/);
  assert.ok(calls.some((url) => url.includes("/api/chat")));
});

test("ollama provider summarizes and echoes the input record ids", async () => {
  const { fetch, calls } = fakeChatFetch("A concise summary.");
  const provider = createOllamaProvider({ config: synthesisConfig, fetch });
  const result = await provider.summarize({
    records: [record("r1", "content one"), record("r2", "content two")],
  });
  assert.match(result.summary, /concise summary/);
  assert.deepEqual(result.recordIds, ["r1", "r2"]);
  assert.ok(calls.some((url) => url.includes("/api/chat")));
});
