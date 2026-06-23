import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { RetrievedRecord } from "../../src/paios/synthesis/provider.js";
import {
  buildSynthesisPrompt,
  extractCitations,
  toSearchQuery,
} from "../../src/paios/synthesis/provider.js";

function record(recordId: string, text: string): RetrievedRecord {
  return { recordId, title: null, sourceReference: `sources/${recordId}`, text };
}

test("toSearchQuery tokenises to a safe OR query", () => {
  assert.equal(
    toSearchQuery("What is my passport number?"),
    '"what" OR "is" OR "my" OR "passport" OR "number"',
  );
});

test("toSearchQuery dedupes tokens and drops single characters", () => {
  assert.equal(toSearchQuery("a dog a DOG"), '"dog"');
});

test("toSearchQuery returns empty string when nothing usable remains", () => {
  assert.equal(toSearchQuery("?!  a"), "");
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
