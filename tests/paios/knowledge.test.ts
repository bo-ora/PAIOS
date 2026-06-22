import * as assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";

import { runCli, type CliContext, type CliIo } from "../../src/paios/cli.js";
import {
  parseKnowledgeCommand,
  type KnowledgeCommand,
} from "../../src/paios/knowledge/commands.js";
import {
  knowledgeDataRootEnvironment,
  resolveKnowledgeDataRoot,
} from "../../src/paios/knowledge/config.js";
import {
  addNote,
  DuplicateKnowledgeError,
  getRecord,
} from "../../src/paios/knowledge/records.js";
import { assertKnowledgeRuntime } from "../../src/paios/knowledge/runtime.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "paios-knowledge-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots.length = 0;
});

function capture(): {
  stdout: string[];
  stderr: string[];
  io: CliIo;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  };
}

test("knowledge command parser covers the approved command namespace", () => {
  const cases: [string[], KnowledgeCommand][] = [
    [
      ["add-note", "--title", "Title", "--text", "Body"],
      { name: "add-note", title: "Title", text: "Body" },
    ],
    [["show", "record-1"], { name: "show", recordId: "record-1" }],
    [["add-file", "note.md"], { name: "add-file", path: "note.md" }],
    [["add-audio", "voice.m4a"], { name: "add-audio", path: "voice.m4a" }],
    [["index", "docs"], { name: "index", path: "docs" }],
    [["ingest-inbox"], { name: "ingest-inbox" }],
    [["search", "\"exact phrase\""], { name: "search", query: "\"exact phrase\"" }],
    [["rebuild"], { name: "rebuild" }],
  ];

  for (const [args, expected] of cases) {
    assert.deepEqual(parseKnowledgeCommand(args), expected);
  }
  assert.deepEqual(
    parseKnowledgeCommand(["show", "record-1", "--data-root", "custom"]),
    { name: "show", recordId: "record-1", dataRoot: "custom" },
  );
  assert.equal(parseKnowledgeCommand(["add-note", "--title"]), null);
  assert.equal(parseKnowledgeCommand(["search"]), null);
  assert.equal(parseKnowledgeCommand(["unknown"]), null);
});

test("data root precedence is command, environment, then local default", () => {
  const root = temporaryRoot();

  assert.equal(
    resolveKnowledgeDataRoot({
      repositoryRoot: root,
      commandDataRoot: "command",
      environmentDataRoot: "environment",
    }),
    join(root, "command"),
  );
  assert.equal(
    resolveKnowledgeDataRoot({
      repositoryRoot: root,
      environmentDataRoot: "environment",
    }),
    join(root, "environment"),
  );
  assert.equal(
    resolveKnowledgeDataRoot({ repositoryRoot: root }),
    join(root, ".local", "paios", "knowledge"),
  );
});

test("runtime check rejects unsupported Node versions", () => {
  assert.throws(() => assertKnowledgeRuntime("23.9.0"), /Node\.js 24/);
  assert.doesNotThrow(() => assertKnowledgeRuntime());
});

test("note capture persists durable source and survives reopen", () => {
  const dataRoot = temporaryRoot();
  const record = addNote(dataRoot, {
    title: "First note",
    content: "Line one\r\nLine two",
  });

  assert.equal(record.sourceType, "note");
  assert.equal(record.state, "ready");
  assert.equal(record.normalizedText, "Line one\nLine two");
  assert.equal(record.provenance.adapter, "cli-note");
  assert.equal(record.provenance.byteLength, 18);
  assert.equal(
    readFileSync(join(dataRoot, record.sourceReference), "utf8"),
    "Line one\r\nLine two",
  );
  assert.ok(existsSync(join(dataRoot, "knowledge.sqlite")));
  assert.deepEqual(getRecord(dataRoot, record.id), record);
});

test("duplicate note content is rejected without creating another source", () => {
  const dataRoot = temporaryRoot();
  const first = addNote(dataRoot, { content: "same bytes" });

  assert.throws(
    () => addNote(dataRoot, { title: "Different title", content: "same bytes" }),
    (error: unknown) =>
      error instanceof DuplicateKnowledgeError &&
      error.existingRecordId === first.id,
  );
});

test("failed source write is recoverable under the same record identifier", () => {
  const dataRoot = temporaryRoot();
  writeFileSync(join(dataRoot, "sources"), "blocks the source directory");

  assert.throws(() => addNote(dataRoot, { content: "recoverable note" }));
  rmSync(join(dataRoot, "sources"));

  const failedDatabase = getRecordByChecksumForTest(
    dataRoot,
    "recoverable note",
  );
  assert.notEqual(failedDatabase, null);
  assert.equal(failedDatabase?.state, "failed");
  assert.equal(failedDatabase?.error, "Managed source write failed.");

  mkdirSync(join(dataRoot, "sources"), { recursive: true });
  const recovered = addNote(dataRoot, { content: "recoverable note" });
  assert.equal(recovered.id, failedDatabase?.id);
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.error, null);
});

test("CLI captures stdin note and shows it using configured data root", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "custom-data");
  const context: CliContext = {
    environment: { [knowledgeDataRootEnvironment]: dataRoot },
    stdin: () => "captured from stdin\n",
  };
  const addCapture = capture();

  assert.equal(
    runCli(
      ["knowledge", "add-note", "--title", "Inbox"],
      root,
      addCapture.io,
      context,
    ),
    0,
  );
  assert.deepEqual(addCapture.stderr, []);
  const match = /Captured note ([0-9a-f-]+)/.exec(addCapture.stdout.join(""));
  assert.notEqual(match, null);
  const recordId = match?.[1];
  assert.notEqual(recordId, undefined);

  const showCapture = capture();
  assert.equal(
    runCli(
      ["knowledge", "show", recordId ?? ""],
      root,
      showCapture.io,
      context,
    ),
    0,
  );
  assert.match(showCapture.stdout.join(""), /Title: Inbox/);
  assert.match(showCapture.stdout.join(""), /captured from stdin/);
  assert.doesNotMatch(showCapture.stdout.join(""), new RegExp(root));
  assert.deepEqual(showCapture.stderr, []);
});

test("CLI reports duplicate and missing records without exposing data root", () => {
  const root = temporaryRoot();
  const context: CliContext = {
    environment: {},
    stdin: () => "",
  };
  const first = capture();
  assert.equal(
    runCli(
      ["knowledge", "add-note", "--text", "duplicate"],
      root,
      first.io,
      context,
    ),
    0,
  );

  const duplicate = capture();
  assert.equal(
    runCli(
      ["knowledge", "add-note", "--text", "duplicate"],
      root,
      duplicate.io,
      context,
    ),
    1,
  );
  assert.match(duplicate.stderr.join(""), /Duplicate knowledge record/);
  assert.doesNotMatch(duplicate.stderr.join(""), new RegExp(root));

  const missing = capture();
  assert.equal(
    runCli(
      ["knowledge", "show", "missing"],
      root,
      missing.io,
      context,
    ),
    1,
  );
  assert.equal(
    missing.stderr.join(""),
    "Knowledge record not found: missing\n",
  );
});

function getRecordByChecksumForTest(
  dataRoot: string,
  content: string,
): ReturnType<typeof getRecord> {
  const database = new DatabaseSync(join(dataRoot, "knowledge.sqlite"), {
    readOnly: true,
  });
  try {
    const row = database
      .prepare("SELECT id FROM records WHERE normalized_text = ?")
      .get(content) as { id: string } | undefined;
    return row === undefined ? null : getRecord(dataRoot, row.id);
  } finally {
    database.close();
  }
}
