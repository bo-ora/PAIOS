import * as assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";

import { runCli, type CliContext, type CliIo } from "../../src/paios/cli.js";
import {
  AudioNormalizationError,
  type AudioProcessRunner,
  withNormalizedAudio,
} from "../../src/paios/knowledge/audio-normalizer.js";
import {
  AudioTranscriptionError,
  type TranscriptionProcessRunner,
  transcribeNormalizedAudio,
} from "../../src/paios/knowledge/audio-transcriber.js";
import {
  parseKnowledgeCommand,
  type KnowledgeCommand,
} from "../../src/paios/knowledge/commands.js";
import {
  ffmpegPathEnvironment,
  knowledgeDataRootEnvironment,
  resolveAudioToolConfiguration,
  resolveKnowledgeDataRoot,
  whisperCliPathEnvironment,
  whisperModelPathEnvironment,
} from "../../src/paios/knowledge/config.js";
import { ingestInbox } from "../../src/paios/knowledge/inbox.js";
import {
  addAudio,
  addFile,
  addNote,
  DuplicateKnowledgeError,
  getRecord,
  KnowledgeInputError,
  describeAudioMedia,
  rebuildSearchIndex,
  searchRecords,
} from "../../src/paios/knowledge/records.js";
import { indexRepository } from "../../src/paios/knowledge/repository-index.js";
import {
  listProcessingAttempts,
  recordProcessingAttempt,
} from "../../src/paios/knowledge/processing-attempts.js";
import { assertKnowledgeRuntime } from "../../src/paios/knowledge/runtime.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "paios-knowledge-test-"));
  temporaryRoots.push(root);
  return root;
}

function readdirNames(path: string): string[] {
  return readdirSync(path).sort();
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
    [["doctor"], { name: "doctor" }],
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
  assert.equal(parseKnowledgeCommand(["doctor", "--data-root", "custom"]), null);
  assert.equal(parseKnowledgeCommand(["search"]), null);
  assert.equal(parseKnowledgeCommand(["unknown"]), null);
});

test("audio tool configuration resolves explicit paths and PATH fallbacks", () => {
  const root = temporaryRoot();
  assert.deepEqual(resolveAudioToolConfiguration(root, {}), {
    ffmpeg: { command: "ffmpeg", source: "path" },
    whisperCli: { command: "whisper-cli", source: "path" },
    whisperModelPath: null,
  });
  assert.deepEqual(
    resolveAudioToolConfiguration(root, {
      [ffmpegPathEnvironment]: "tools/ffmpeg",
      [whisperCliPathEnvironment]: "/opt/whisper-cli",
      [whisperModelPathEnvironment]: "models/ggml-base.bin",
    }),
    {
      ffmpeg: { command: join(root, "tools", "ffmpeg"), source: "configured" },
      whisperCli: {
        command: "/opt/whisper-cli",
        source: "configured",
      },
      whisperModelPath: join(root, "models", "ggml-base.bin"),
    },
  );
});

test("audio diagnostics validate configured executables and model without exposing paths", () => {
  const root = temporaryRoot();
  const tools = join(root, "private-tools");
  const models = join(root, "private-models");
  mkdirSync(tools);
  mkdirSync(models);
  const ffmpeg = join(tools, "ffmpeg");
  const whisperCli = join(tools, "whisper-cli");
  const model = join(models, "ggml-base.bin");
  writeFileSync(
    ffmpeg,
    "#!/bin/sh\nprintf '%s version test-build\\n' \"$0\"\n",
  );
  writeFileSync(
    whisperCli,
    "#!/bin/sh\nprintf '%s whisper.cpp test-build\\n' \"$0\"\n",
  );
  chmodSync(ffmpeg, 0o755);
  chmodSync(whisperCli, 0o755);
  writeFileSync(model, "local model fixture");
  const captured = capture();

  assert.equal(
    runCli(["knowledge", "doctor"], root, captured.io, {
      environment: {
        [ffmpegPathEnvironment]: ffmpeg,
        [whisperCliPathEnvironment]: whisperCli,
        [whisperModelPathEnvironment]: model,
      },
      stdin: () => "",
    }),
    0,
  );
  const output = captured.stdout.join("");
  assert.match(output, /FFmpeg: ready — ffmpeg version test-build/);
  assert.match(
    output,
    /whisper-cli: ready — whisper-cli whisper\.cpp test-build/,
  );
  assert.match(
    output,
    /Whisper model: ready — ggml-base\.bin \(19 bytes, sha256 [0-9a-f]{64}\)/,
  );
  assert.match(output, /Audio processing: ready/);
  assert.doesNotMatch(output, new RegExp(root));
  assert.deepEqual(captured.stderr, []);
});

test("audio diagnostics report every missing dependency with actionable configuration", () => {
  const root = temporaryRoot();
  const captured = capture();

  assert.equal(
    runCli(["knowledge", "doctor"], root, captured.io, {
      environment: {
        PATH: "",
        [ffmpegPathEnvironment]: join(root, "missing-ffmpeg"),
        [whisperCliPathEnvironment]: join(root, "missing-whisper-cli"),
      },
      stdin: () => "",
    }),
    1,
  );
  const output = captured.stdout.join("");
  assert.match(output, /FFmpeg: missing .*PAIOS_FFMPEG_PATH/);
  assert.match(output, /whisper-cli: missing .*PAIOS_WHISPER_CLI_PATH/);
  assert.match(output, /Whisper model: missing .*PAIOS_WHISPER_MODEL_PATH/);
  assert.match(output, /Audio processing: not ready/);
  assert.doesNotMatch(output, new RegExp(root));
  assert.deepEqual(captured.stderr, []);
});

test("audio diagnostics reject broken executables and invalid model files", () => {
  const root = temporaryRoot();
  const brokenExecutable = join(root, "broken-tool");
  const modelDirectory = join(root, "model-directory");
  writeFileSync(brokenExecutable, "#!/bin/sh\nexit 7\n");
  chmodSync(brokenExecutable, 0o755);
  mkdirSync(modelDirectory);
  const captured = capture();

  assert.equal(
    runCli(["knowledge", "doctor"], root, captured.io, {
      environment: {
        [ffmpegPathEnvironment]: brokenExecutable,
        [whisperCliPathEnvironment]: brokenExecutable,
        [whisperModelPathEnvironment]: modelDirectory,
      },
      stdin: () => "",
    }),
    1,
  );
  const output = captured.stdout.join("");
  assert.match(output, /FFmpeg: error — FFmpeg exited with status 7/);
  assert.match(
    output,
    /whisper-cli: error — whisper-cli exited with status 7/,
  );
  assert.match(
    output,
    /Whisper model: error — The configured model is not a readable, non-empty regular file/,
  );
  assert.doesNotMatch(output, new RegExp(root));
  assert.deepEqual(captured.stderr, []);
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

test("managed Markdown and text imports preserve bytes and searchable text", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const markdownPath = join(root, "Project Notes.MD");
  const original = Buffer.from(
    "\uFEFF# Project Notes\r\n\r\nTelegram voice capture roadmap\r\n",
    "utf8",
  );
  writeFileSync(markdownPath, original);

  const record = addFile(dataRoot, markdownPath);

  assert.equal(record.sourceType, "managed-file");
  assert.equal(record.title, "Project Notes.MD");
  assert.equal(record.provenance.originalName, "Project Notes.MD");
  assert.equal(
    record.provenance.detectedMediaType,
    "text/markdown; charset=utf-8",
  );
  assert.equal(
    record.normalizedText,
    "# Project Notes\n\nTelegram voice capture roadmap\n",
  );
  assert.deepEqual(
    readFileSync(join(dataRoot, record.sourceReference)),
    original,
  );
  assert.throws(
    () => addFile(dataRoot, markdownPath),
    (error: unknown) =>
      error instanceof DuplicateKnowledgeError &&
      error.existingRecordId === record.id,
  );
});

test("document import rejects unsupported, invalid UTF-8, empty, and directories", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const unsupported = join(root, "document.pdf");
  const invalid = join(root, "invalid.txt");
  const empty = join(root, "empty.md");
  writeFileSync(unsupported, "not a pdf");
  writeFileSync(invalid, Buffer.from([0xc3, 0x28]));
  writeFileSync(empty, " \r\n\t");

  assert.throws(
    () => addFile(dataRoot, unsupported),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("Unsupported document format"),
  );
  assert.throws(
    () => addFile(dataRoot, invalid),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("valid UTF-8"),
  );
  assert.throws(
    () => addFile(dataRoot, empty),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("must not be empty"),
  );
  assert.throws(
    () => addFile(dataRoot, root),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("must reference a file"),
  );
});

function wavFixture(): Buffer {
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

function canonicalWavFixture(): Buffer {
  const bytes = wavFixture();
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt16LE(16, 34);
  return bytes;
}

function normalizationInput(): {
  bytes: Buffer;
  descriptor: ReturnType<typeof describeAudioMedia>;
} {
  const bytes = wavFixture();
  return {
    bytes,
    descriptor: describeAudioMedia(bytes, {
      sourceKind: "local-file",
      originalName: "voice.wav",
      claimedMimeType: "audio/wav",
    }),
  };
}

test("FFmpeg normalizer uses canonical arguments and cleans temporary files", () => {
  const root = temporaryRoot();
  const temporary = join(root, "temporary");
  const input = normalizationInput();
  let observedInputPath = "";
  let observedOutputPath = "";
  const runner: AudioProcessRunner = (command, args, timeoutMs) => {
    assert.equal(command, "/configured/ffmpeg");
    assert.equal(timeoutMs, 1_234);
    assert.deepEqual(args.slice(0, 5), [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
    ]);
    assert.deepEqual(args.slice(7, 17), [
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      args[16],
    ]);
    observedInputPath = args[6] ?? "";
    observedOutputPath = args[16] ?? "";
    assert.deepEqual(readFileSync(observedInputPath), input.bytes);
    writeFileSync(observedOutputPath, canonicalWavFixture());
    return { status: 0, stderr: "" };
  };

  const byteLength = withNormalizedAudio(
    input,
    {
      ffmpegCommand: "/configured/ffmpeg",
      temporaryRoot: temporary,
      timeoutMs: 1_234,
      runProcess: runner,
    },
    (normalizedPath) => {
      assert.equal(normalizedPath, observedOutputPath);
      assert.ok(existsSync(normalizedPath));
      return readFileSync(normalizedPath).byteLength;
    },
  );

  assert.equal(byteLength, canonicalWavFixture().byteLength);
  assert.ok(!existsSync(observedInputPath));
  assert.ok(!existsSync(observedOutputPath));
  assert.deepEqual(readdirNames(temporary), []);
});

test("FFmpeg normalizer classifies process failures and redacts temporary paths", () => {
  const cases: {
    name: string;
    result: ReturnType<AudioProcessRunner>;
    failure: AudioNormalizationError["failure"];
    message: RegExp;
  }[] = [
    {
      name: "missing executable",
      result: {
        status: null,
        error: Object.assign(new Error("missing"), { code: "ENOENT" }),
        stderr: "",
      },
      failure: "missing-executable",
      message: /PAIOS_FFMPEG_PATH/,
    },
    {
      name: "timeout",
      result: {
        status: null,
        error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
        stderr: "",
      },
      failure: "timeout",
      message: /1234 ms/,
    },
    {
      name: "nonzero exit",
      result: {
        status: 7,
        stderr: "failure at PLACEHOLDER/private.wav",
      },
      failure: "process-failed",
      message: /status 7/,
    },
  ];

  for (const item of cases) {
    const root = temporaryRoot();
    const temporary = join(root, "temporary");
    const runner: AudioProcessRunner = (_command, args) => ({
      ...item.result,
      stderr: item.result.stderr.replace(
        "PLACEHOLDER",
        join(args[6] ?? "", ".."),
      ),
    });
    assert.throws(
      () =>
        withNormalizedAudio(
          normalizationInput(),
          {
            ffmpegCommand: join(root, "private", "ffmpeg"),
            temporaryRoot: temporary,
            timeoutMs: 1_234,
            runProcess: runner,
          },
          () => undefined,
        ),
      (error: unknown) =>
        error instanceof AudioNormalizationError &&
        error.failure === item.failure &&
        item.message.test(error.message) &&
        !error.message.includes(root),
      item.name,
    );
    assert.deepEqual(readdirNames(temporary), []);
  }
});

test("FFmpeg normalizer rejects descriptor mismatch and malformed output", () => {
  const root = temporaryRoot();
  const temporary = join(root, "temporary");
  const input = normalizationInput();
  const mismatched = {
    ...input,
    descriptor: { ...input.descriptor, checksum: "0".repeat(64) },
  };
  assert.throws(
    () =>
      withNormalizedAudio(
        mismatched,
        {
          ffmpegCommand: "ffmpeg",
          temporaryRoot: temporary,
          runProcess: () => {
            throw new Error("process must not run");
          },
        },
        () => undefined,
      ),
    (error: unknown) =>
      error instanceof AudioNormalizationError &&
      error.failure === "invalid-source",
  );

  assert.throws(
    () =>
      withNormalizedAudio(
        input,
        {
          ffmpegCommand: "ffmpeg",
          temporaryRoot: temporary,
          runProcess: (_command, args) => {
            writeFileSync(args[16] ?? "", "not canonical audio");
            return { status: 0, stderr: "" };
          },
        },
        () => undefined,
      ),
    (error: unknown) =>
      error instanceof AudioNormalizationError &&
      error.failure === "invalid-output",
  );
  assert.deepEqual(readdirNames(temporary), []);
});

test("FFmpeg normalizer cleans temporary files when the consumer fails", () => {
  const root = temporaryRoot();
  const temporary = join(root, "temporary");
  assert.throws(
    () =>
      withNormalizedAudio(
        normalizationInput(),
        {
          ffmpegCommand: "ffmpeg",
          temporaryRoot: temporary,
          runProcess: (_command, args) => {
            writeFileSync(args[16] ?? "", canonicalWavFixture());
            return { status: 0, stderr: "" };
          },
        },
        () => {
          throw new Error("consumer failed");
        },
      ),
    /consumer failed/,
  );
  assert.deepEqual(readdirNames(temporary), []);
});

test("FFmpeg normalizer accepts the Telegram-compatible OGG Opus contract", () => {
  const root = temporaryRoot();
  const temporary = join(root, "temporary");
  const bytes = Buffer.alloc(64);
  bytes.write("OggS", 0);
  bytes.write("OpusHead", 28);
  const descriptor = describeAudioMedia(bytes, {
    sourceKind: "remote",
    originalName: "voice.ogg",
    claimedMimeType: "audio/ogg",
  });
  let observedInput = "";

  withNormalizedAudio(
    { bytes, descriptor },
    {
      ffmpegCommand: "ffmpeg",
      temporaryRoot: temporary,
      runProcess: (_command, args) => {
        observedInput = args[6] ?? "";
        writeFileSync(args[16] ?? "", canonicalWavFixture());
        return { status: 0, stderr: "" };
      },
    },
    (normalizedPath) => {
      assert.match(observedInput, /original\.ogg$/);
      assert.ok(existsSync(normalizedPath));
    },
  );

  assert.ok(!existsSync(observedInput));
  assert.deepEqual(readdirNames(temporary), []);
});

test("whisper-cli transcriber uses deterministic arguments and cleans output", () => {
  const root = temporaryRoot();
  const temporary = join(root, "temporary");
  const normalizedPath = join(root, "normalized.wav");
  const modelPath = join(root, "ggml-base.bin");
  writeFileSync(normalizedPath, canonicalWavFixture());
  writeFileSync(modelPath, "model fixture");
  let observedOutputPath = "";
  const runner: TranscriptionProcessRunner = (command, args, timeoutMs) => {
    assert.equal(command, "/configured/whisper-cli");
    assert.equal(timeoutMs, 9_876);
    assert.deepEqual(args.slice(0, 8), [
      "-m",
      modelPath,
      "-f",
      normalizedPath,
      "-l",
      "uk",
      "-otxt",
      "-of",
    ]);
    assert.deepEqual(args.slice(9), ["-np", "-nt"]);
    observedOutputPath = `${args[8]}.txt`;
    writeFileSync(observedOutputPath, "\uFEFFПерший рядок\r\nДругий рядок\n");
    return { status: 0, stderr: "" };
  };

  const result = transcribeNormalizedAudio(normalizedPath, {
    whisperCommand: "/configured/whisper-cli",
    whisperVersion: "whisper.cpp 1.7.6",
    modelPath,
    temporaryRoot: temporary,
    language: "uk",
    timeoutMs: 9_876,
    runProcess: runner,
  });

  assert.equal(result.transcript, "Перший рядок\nДругий рядок");
  assert.equal(result.implementation, "whisper-cli");
  assert.equal(result.implementationVersion, "whisper.cpp 1.7.6");
  assert.equal(result.modelFilename, "ggml-base.bin");
  assert.match(result.modelChecksum, /^[0-9a-f]{64}$/);
  assert.equal(result.language, "uk");
  assert.equal(result.exitStatus, 0);
  assert.ok(!existsSync(observedOutputPath));
  assert.deepEqual(readdirNames(temporary), []);
});

test("whisper-cli transcriber classifies process failures and redacts paths", () => {
  const cases: {
    name: string;
    result: ReturnType<TranscriptionProcessRunner>;
    failure: AudioTranscriptionError["failure"];
    message: RegExp;
  }[] = [
    {
      name: "missing executable",
      result: {
        status: null,
        error: Object.assign(new Error("missing"), { code: "ENOENT" }),
        stderr: "",
      },
      failure: "missing-executable",
      message: /PAIOS_WHISPER_CLI_PATH/,
    },
    {
      name: "timeout",
      result: {
        status: null,
        error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
        stderr: "",
      },
      failure: "timeout",
      message: /9876 ms/,
    },
    {
      name: "nonzero exit",
      result: {
        status: 7,
        stderr: "failed using MODEL INPUT OUTPUT",
      },
      failure: "process-failed",
      message: /status 7/,
    },
  ];

  for (const item of cases) {
    const root = temporaryRoot();
    const temporary = join(root, "temporary");
    const normalizedPath = join(root, "private", "normalized.wav");
    const modelPath = join(root, "private", "ggml-base.bin");
    mkdirSync(join(root, "private"));
    writeFileSync(normalizedPath, canonicalWavFixture());
    writeFileSync(modelPath, "model fixture");
    const command = join(root, "private", "whisper-cli");
    const runner: TranscriptionProcessRunner = (_command, args) => ({
      ...item.result,
      stderr: item.result.stderr
        .replace("MODEL", modelPath)
        .replace("INPUT", normalizedPath)
        .replace("OUTPUT", args[8] ?? ""),
    });

    assert.throws(
      () =>
        transcribeNormalizedAudio(normalizedPath, {
          whisperCommand: command,
          whisperVersion: "test",
          modelPath,
          temporaryRoot: temporary,
          timeoutMs: 9_876,
          runProcess: runner,
        }),
      (error: unknown) =>
        error instanceof AudioTranscriptionError &&
        error.failure === item.failure &&
        item.message.test(error.message) &&
        !error.message.includes(root),
      item.name,
    );
    assert.deepEqual(readdirNames(temporary), []);
  }
});

test("whisper-cli transcriber rejects invalid model and malformed output", () => {
  const root = temporaryRoot();
  const temporary = join(root, "temporary");
  const normalizedPath = join(root, "normalized.wav");
  const modelPath = join(root, "ggml-base.bin");
  writeFileSync(normalizedPath, canonicalWavFixture());

  assert.throws(
    () =>
      transcribeNormalizedAudio(normalizedPath, {
        whisperCommand: "whisper-cli",
        whisperVersion: "test",
        modelPath,
        temporaryRoot: temporary,
        runProcess: () => {
          throw new Error("process must not run");
        },
      }),
    (error: unknown) =>
      error instanceof AudioTranscriptionError &&
      error.failure === "invalid-model",
  );

  writeFileSync(modelPath, "model fixture");
  for (const output of [null, Buffer.from([0xc3, 0x28]), Buffer.from(" \n")]) {
    assert.throws(
      () =>
        transcribeNormalizedAudio(normalizedPath, {
          whisperCommand: "whisper-cli",
          whisperVersion: "test",
          modelPath,
          temporaryRoot: temporary,
          runProcess: (_command, args) => {
            if (output !== null) {
              writeFileSync(`${args[8]}.txt`, output);
            }
            return { status: 0, stderr: "" };
          },
        }),
      (error: unknown) =>
        error instanceof AudioTranscriptionError &&
        error.failure === "invalid-output",
    );
    assert.deepEqual(readdirNames(temporary), []);
  }
});

test("audio import preserves original bytes and provider-neutral media metadata", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const audioPath = join(root, "misleading.mp3");
  const original = wavFixture();
  writeFileSync(audioPath, original);

  const record = addAudio(dataRoot, audioPath);

  assert.equal(record.sourceType, "audio");
  assert.equal(record.state, "pending");
  assert.equal(record.normalizedText, "");
  assert.equal(record.provenance.adapter, "cli-audio");
  assert.equal(record.provenance.originalName, "misleading.mp3");
  assert.equal(record.provenance.claimedMimeType, "audio/mpeg");
  assert.equal(record.provenance.detectedMediaType, "audio/wav");
  assert.equal(record.provenance.detectedContainer, "wav");
  assert.equal(record.provenance.detectedCodec, "pcm");
  assert.match(record.sourceReference, /^sources\/audio\/.+\.wav$/);
  assert.deepEqual(
    readFileSync(join(dataRoot, record.sourceReference)),
    original,
  );
  assert.deepEqual(getRecord(dataRoot, record.id), record);
});

test("processing attempts persist immutable versioned transcription metadata", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const audioPath = join(root, "voice.wav");
  writeFileSync(audioPath, wavFixture());
  const record = addAudio(dataRoot, audioPath);
  const startedAt = "2026-06-22T20:00:00.000Z";
  const completedAt = "2026-06-22T20:00:03.000Z";

  const attempt = recordProcessingAttempt(dataRoot, {
    recordId: record.id,
    implementationVersion: "whisper.cpp 1.7.6",
    modelFilename: "ggml-base.bin",
    modelChecksum: "a".repeat(64),
    language: "auto",
    startedAt,
    completedAt,
    status: "failed",
    exitStatus: 7,
    diagnostic: "x".repeat(700),
  });

  assert.equal(attempt.recordId, record.id);
  assert.equal(attempt.schemaVersion, 1);
  assert.equal(attempt.implementation, "whisper-cli");
  assert.equal(attempt.status, "failed");
  assert.equal(attempt.exitStatus, 7);
  assert.equal(attempt.diagnostic?.length, 500);
  assert.deepEqual(listProcessingAttempts(dataRoot, record.id), [attempt]);
  assert.deepEqual(getRecord(dataRoot, record.id), record);
});

test("processing attempts reject invalid metadata and non-audio records", () => {
  const dataRoot = temporaryRoot();
  const note = addNote(dataRoot, { content: "not audio" });
  const base = {
    recordId: note.id,
    implementationVersion: "test",
    modelFilename: "ggml-base.bin",
    modelChecksum: "a".repeat(64),
    language: "auto",
    startedAt: "2026-06-22T20:00:00.000Z",
    completedAt: "2026-06-22T20:00:01.000Z",
    status: "succeeded" as const,
    exitStatus: 0,
    diagnostic: null,
  };

  assert.throws(
    () => recordProcessingAttempt(dataRoot, base),
    /existing audio record/,
  );
  assert.throws(
    () =>
      recordProcessingAttempt(dataRoot, {
        ...base,
        recordId: "missing",
        modelChecksum: "invalid",
      }),
    /Invalid processing-attempt metadata/,
  );
});

test("audio detection supports MP3, M4A, and Telegram-compatible OGG Opus", () => {
  const mp3 = Buffer.from("49443304000000000000", "hex");
  const m4a = Buffer.alloc(24);
  m4a.writeUInt32BE(24, 0);
  m4a.write("ftyp", 4);
  m4a.write("M4A ", 8);
  const ogg = Buffer.alloc(64);
  ogg.write("OggS", 0);
  ogg.write("OpusHead", 28);

  assert.equal(
    describeAudioMedia(mp3, { sourceKind: "local-file" }).detectedCodec,
    "mp3",
  );
  assert.equal(
    describeAudioMedia(m4a, { sourceKind: "local-file" }).detectedContainer,
    "mp4",
  );
  const remote = describeAudioMedia(ogg, {
    sourceKind: "remote",
    originalName: "voice.ogg",
    claimedMimeType: "audio/ogg",
  });
  assert.equal(remote.detectedContainer, "ogg");
  assert.equal(remote.detectedCodec, "opus");
  assert.equal(remote.sourceKind, "remote");
});

test("audio import rejects unreadable paths and unrecognized content", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const invalid = join(root, "voice.wav");
  writeFileSync(invalid, "not audio");

  assert.throws(
    () => addAudio(dataRoot, invalid),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("unrecognized audio content"),
  );
  assert.throws(
    () => addAudio(dataRoot, root),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("must reference a file"),
  );
});

test("lexical search supports phrases, case folding, ranking, and source references", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  addNote(dataRoot, {
    title: "Telegram capture",
    content: "A short note about retries.",
  });
  const documentPath = join(root, "architecture.md");
  writeFileSync(
    documentPath,
    "# Architecture\nTelegram voice capture uses provider-neutral media.",
  );
  const document = addFile(dataRoot, documentPath);
  addNote(dataRoot, {
    title: "Unrelated",
    content: "Voice and capture occur separately, not as an exact phrase.",
  });

  const broad = searchRecords(dataRoot, "TELEGRAM capture");
  assert.equal(broad.length, 2);
  assert.equal(broad[0]?.title, "Telegram capture");
  assert.deepEqual(
    broad.map((result) => result.position),
    [1, 2],
  );
  assert.ok(broad.every((result) => result.sourceReference.startsWith("sources/")));
  assert.ok(broad.every((result) => Number.isFinite(result.rank)));

  const phrase = searchRecords(dataRoot, '"voice capture"');
  assert.equal(phrase.length, 1);
  assert.equal(phrase[0]?.recordId, document.id);
  assert.match(phrase[0]?.excerpt ?? "", /\[voice capture\]/i);
  assert.deepEqual(searchRecords(dataRoot, "absentterm"), []);
  assert.throws(
    () => searchRecords(dataRoot, '"unterminated'),
    (error: unknown) =>
      error instanceof KnowledgeInputError &&
      error.message.includes("Invalid search query"),
  );
});

test("equal-rank results use stable record identifier order", () => {
  const dataRoot = temporaryRoot();
  const first = addNote(dataRoot, { content: "tie apple" });
  const second = addNote(dataRoot, { content: "tie berry" });
  const expected = [first.id, second.id].sort();

  const results = searchRecords(dataRoot, "tie");

  assert.equal(results[0]?.rank, results[1]?.rank);
  assert.deepEqual(
    results.map((result) => result.recordId),
    expected,
  );
});

test("search rebuild restores deleted derived state without changing records", () => {
  const dataRoot = temporaryRoot();
  const first = addNote(dataRoot, {
    title: "Recovery",
    content: "rebuildable lexical evidence",
  });
  const before = searchRecords(dataRoot, "rebuildable");
  assert.equal(before[0]?.recordId, first.id);

  const database = new DatabaseSync(join(dataRoot, "knowledge.sqlite"));
  try {
    database.exec("DELETE FROM record_search;");
  } finally {
    database.close();
  }
  assert.deepEqual(searchRecords(dataRoot, "rebuildable"), []);

  assert.equal(rebuildSearchIndex(dataRoot), 1);
  assert.deepEqual(searchRecords(dataRoot, "rebuildable"), before);
  assert.deepEqual(getRecord(dataRoot, first.id), first);
});

test("schema version one data migrates without changing durable records", () => {
  const dataRoot = temporaryRoot();
  const record = addNote(dataRoot, {
    title: "Migration",
    content: "preserved migration evidence",
  });
  const database = new DatabaseSync(join(dataRoot, "knowledge.sqlite"));
  try {
    database.exec("UPDATE schema_metadata SET version = 1 WHERE id = 1;");
  } finally {
    database.close();
  }

  assert.deepEqual(getRecord(dataRoot, record.id), record);
  assert.equal(searchRecords(dataRoot, "migration")[0]?.recordId, record.id);

  const migrated = new DatabaseSync(join(dataRoot, "knowledge.sqlite"), {
    readOnly: true,
  });
  try {
    const version = migrated
      .prepare("SELECT version FROM schema_metadata WHERE id = 1")
      .get() as { version: number };
    assert.equal(version.version, 4);
  } finally {
    migrated.close();
  }
});

test("FTS triggers replace searchable text when a record is updated", () => {
  const dataRoot = temporaryRoot();
  const record = addNote(dataRoot, { content: "original searchable term" });
  const database = new DatabaseSync(join(dataRoot, "knowledge.sqlite"));
  try {
    database
      .prepare("UPDATE records SET normalized_text = ? WHERE id = ?")
      .run("replacement searchable term", record.id);
  } finally {
    database.close();
  }

  assert.deepEqual(searchRecords(dataRoot, "original"), []);
  assert.equal(searchRecords(dataRoot, "replacement")[0]?.recordId, record.id);
});

test("CLI imports, searches, rebuilds, and returns useful validation errors", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const documentPath = join(root, "cli-document.txt");
  writeFileSync(documentPath, "CLI searchable source material");
  const context: CliContext = { environment: {}, stdin: () => "" };

  const imported = capture();
  assert.equal(
    runCli(
      ["knowledge", "add-file", documentPath, "--data-root", dataRoot],
      root,
      imported.io,
      context,
    ),
    0,
  );
  assert.match(imported.stdout.join(""), /Imported file [0-9a-f-]+/);

  const searched = capture();
  assert.equal(
    runCli(
      ["knowledge", "search", '"searchable source"', "--data-root", dataRoot],
      root,
      searched.io,
      context,
    ),
    0,
  );
  assert.match(searched.stdout.join(""), /cli-document\.txt/);
  assert.match(searched.stdout.join(""), /Match: CLI \[searchable source\]/);

  const rebuilt = capture();
  assert.equal(
    runCli(
      ["knowledge", "rebuild", "--data-root", dataRoot],
      root,
      rebuilt.io,
      context,
    ),
    0,
  );
  assert.equal(
    rebuilt.stdout.join(""),
    "Rebuilt search index for 1 ready record(s).\n",
  );

  const unsupported = join(root, "unsupported.json");
  writeFileSync(unsupported, "{}");
  const invalid = capture();
  assert.equal(
    runCli(
      ["knowledge", "add-file", unsupported, "--data-root", dataRoot],
      root,
      invalid.io,
      context,
    ),
    2,
  );
  assert.equal(
    invalid.stderr.join(""),
    "Unsupported document format; use .md or .txt.\n",
  );
});

test("CLI imports durable audio and reports pending transcription", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const audioPath = join(root, "voice.wav");
  writeFileSync(audioPath, wavFixture());
  const captured = capture();

  assert.equal(
    runCli(
      ["knowledge", "add-audio", audioPath, "--data-root", dataRoot],
      root,
      captured.io,
      { environment: {}, stdin: () => "" },
    ),
    0,
  );
  assert.match(captured.stdout.join(""), /Imported audio [0-9a-f-]+/);
  assert.match(captured.stdout.join(""), /Source: sources\/audio\/.+\.wav/);
  assert.match(captured.stdout.join(""), /Transcription: pending/);
  assert.deepEqual(captured.stderr, []);
});

test("repository indexing is stable, idempotent, and updates changed sources", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const repository = join(root, "repository");
  const nested = join(repository, "nested");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(repository, "z-ignore.json"), "{}");
  writeFileSync(join(repository, "a.md"), "# Alpha\nstable repository text");
  writeFileSync(join(nested, "b.txt"), "nested searchable text");
  symlinkSync(join(repository, "a.md"), join(repository, "linked.md"));

  assert.deepEqual(indexRepository(dataRoot, repository), {
    indexed: 2,
    unchanged: 0,
    updated: 0,
    skipped: 2,
    missing: 0,
    failed: 0,
  });

  const database = new DatabaseSync(join(dataRoot, "knowledge.sqlite"), {
    readOnly: true,
  });
  try {
    const rows = database
      .prepare(`
        SELECT title
        FROM records
        WHERE source_type = 'indexed-file'
        ORDER BY internal_id
      `)
      .all() as unknown as { title: string }[];
    assert.deepEqual(
      rows.map((row) => row.title),
      ["a.md", "b.txt"],
    );
  } finally {
    database.close();
  }

  assert.deepEqual(indexRepository(dataRoot, repository), {
    indexed: 0,
    unchanged: 2,
    updated: 0,
    skipped: 2,
    missing: 0,
    failed: 0,
  });

  const nestedBefore = searchRecords(dataRoot, "nested")[0];
  assert.notEqual(nestedBefore, undefined);
  writeFileSync(join(nested, "b.txt"), "replacement searchable text");
  writeFileSync(join(nested, "copy.md"), "replacement searchable text");

  assert.deepEqual(indexRepository(dataRoot, repository), {
    indexed: 1,
    unchanged: 1,
    updated: 1,
    skipped: 2,
    missing: 0,
    failed: 0,
  });
  assert.deepEqual(searchRecords(dataRoot, "nested"), []);
  const replacements = searchRecords(dataRoot, "replacement");
  assert.equal(replacements.length, 2);
  assert.equal(
    replacements.find((result) => result.title === "b.txt")?.recordId,
    nestedBefore?.recordId,
  );
});

test("repository reindex marks deleted and invalid sources stale", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const repository = join(root, "repository");
  mkdirSync(repository);
  const deletedPath = join(repository, "deleted.md");
  const invalidPath = join(repository, "invalid.txt");
  const unreadablePath = join(repository, "unreadable.md");
  writeFileSync(deletedPath, "deleted searchable evidence");
  writeFileSync(invalidPath, "valid before corruption");
  writeFileSync(unreadablePath, "readable before permissions change");

  assert.equal(indexRepository(dataRoot, repository).indexed, 3);
  const deletedRecord = searchRecords(dataRoot, "deleted")[0];
  assert.notEqual(deletedRecord, undefined);

  rmSync(deletedPath);
  writeFileSync(invalidPath, Buffer.from([0xc3, 0x28]));
  chmodSync(unreadablePath, 0o000);
  try {
    assert.deepEqual(indexRepository(dataRoot, repository), {
      indexed: 0,
      unchanged: 0,
      updated: 0,
      skipped: 0,
      missing: 1,
      failed: 2,
    });
  } finally {
    chmodSync(unreadablePath, 0o600);
  }

  assert.deepEqual(searchRecords(dataRoot, "deleted"), []);
  assert.deepEqual(searchRecords(dataRoot, "corruption"), []);
  assert.equal(getRecord(dataRoot, deletedRecord?.recordId ?? "")?.state, "failed");
  assert.equal(
    getRecord(dataRoot, deletedRecord?.recordId ?? "")?.error,
    "Indexed source is missing.",
  );

  writeFileSync(deletedPath, "restored searchable evidence");
  writeFileSync(invalidPath, "valid after repair");
  assert.deepEqual(indexRepository(dataRoot, repository), {
    indexed: 0,
    unchanged: 0,
    updated: 3,
    skipped: 0,
    missing: 0,
    failed: 0,
  });
  assert.equal(
    searchRecords(dataRoot, "restored")[0]?.recordId,
    deletedRecord?.recordId,
  );
});

test("repository index CLI reports all counts and fails after partial errors", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "knowledge");
  const repository = join(root, "repository");
  mkdirSync(repository);
  writeFileSync(join(repository, "good.md"), "good indexed content");
  writeFileSync(join(repository, "bad.txt"), Buffer.from([0xc3, 0x28]));
  writeFileSync(join(repository, "ignored.json"), "{}");
  const captured = capture();

  assert.equal(
    runCli(
      ["knowledge", "index", repository, "--data-root", dataRoot],
      root,
      captured.io,
      { environment: {}, stdin: () => "" },
    ),
    1,
  );
  assert.equal(
    captured.stdout.join(""),
    [
      "Repository indexing complete.",
      "Indexed: 1",
      "Unchanged: 0",
      "Updated: 0",
      "Skipped: 1",
      "Missing: 0",
      "Failed: 1",
      "",
    ].join("\n"),
  );
  assert.deepEqual(captured.stderr, []);
  assert.equal(searchRecords(dataRoot, "good").length, 1);
});

test("inbox processing is stable across documents, duplicates, skips, and failures", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "runtime", "knowledge");
  const inbox = join(root, "runtime", "inbox");
  const nested = join(inbox, "nested");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(inbox, "z.txt"), "last stable inbox document");
  writeFileSync(join(inbox, "a.md"), "# First\nstable inbox document");
  writeFileSync(join(inbox, "ignored.json"), "{}");
  writeFileSync(join(nested, "bad.txt"), Buffer.from([0xc3, 0x28]));
  writeFileSync(join(nested, "voice.mp3"), "audio placeholder");
  symlinkSync(join(inbox, "a.md"), join(inbox, "linked.md"));
  const duplicateSource = join(root, "duplicate.txt");
  writeFileSync(duplicateSource, "already durable");
  const duplicate = addFile(dataRoot, duplicateSource);
  writeFileSync(join(nested, "duplicate.txt"), "already durable");

  const result = ingestInbox(dataRoot);

  assert.deepEqual(
    result.items.map((item) => [item.path, item.status]),
    [
      ["a.md", "processed"],
      ["ignored.json", "skipped"],
      ["linked.md", "skipped"],
      ["nested/bad.txt", "failed"],
      ["nested/duplicate.txt", "duplicate"],
      ["nested/voice.mp3", "failed"],
      ["z.txt", "processed"],
    ],
  );
  assert.deepEqual(
    {
      processed: result.processed,
      duplicates: result.duplicates,
      skipped: result.skipped,
      failed: result.failed,
    },
    { processed: 2, duplicates: 1, skipped: 2, failed: 2 },
  );
  assert.equal(
    result.items.find((item) => item.status === "duplicate")?.recordId,
    duplicate.id,
  );
  assert.ok(existsSync(join(root, "runtime", "inbox-processed", "a.md")));
  assert.ok(
    existsSync(
      join(root, "runtime", "inbox-processed", "nested", "duplicate.txt"),
    ),
  );
  assert.ok(existsSync(join(inbox, "nested", "bad.txt")));
  assert.ok(existsSync(join(inbox, "nested", "voice.mp3")));
  assert.ok(existsSync(join(inbox, "ignored.json")));
  assert.equal(searchRecords(dataRoot, "stable inbox").length, 2);
});

test("inbox rerun recovers an interrupted move without another record", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "runtime", "knowledge");
  const inbox = join(root, "runtime", "inbox");
  const processed = join(root, "runtime", "inbox-processed");
  mkdirSync(inbox, { recursive: true });
  mkdirSync(processed, { recursive: true });
  const source = join(inbox, "blocked.md");
  const destination = join(processed, "blocked.md");
  writeFileSync(source, "recover interrupted inbox move");
  writeFileSync(destination, "preexisting processed collision");

  const first = ingestInbox(dataRoot);
  assert.equal(first.failed, 1);
  assert.equal(first.items[0]?.recordId, searchRecords(dataRoot, "interrupted")[0]?.recordId);
  assert.ok(existsSync(source));

  rmSync(destination);
  const second = ingestInbox(dataRoot);
  assert.deepEqual(
    {
      processed: second.processed,
      duplicates: second.duplicates,
      skipped: second.skipped,
      failed: second.failed,
    },
    { processed: 0, duplicates: 1, skipped: 0, failed: 0 },
  );
  assert.equal(second.items[0]?.recordId, first.items[0]?.recordId);
  assert.ok(!existsSync(source));
  assert.equal(searchRecords(dataRoot, "interrupted").length, 1);
});

test("inbox CLI prints every result and returns nonzero after partial failure", () => {
  const root = temporaryRoot();
  const dataRoot = join(root, "runtime", "knowledge");
  const inbox = join(root, "runtime", "inbox");
  mkdirSync(inbox, { recursive: true });
  writeFileSync(join(inbox, "good.md"), "CLI inbox success");
  writeFileSync(join(inbox, "later.wav"), "audio placeholder");
  const captured = capture();

  assert.equal(
    runCli(
      ["knowledge", "ingest-inbox", "--data-root", dataRoot],
      root,
      captured.io,
      { environment: {}, stdin: () => "" },
    ),
    1,
  );
  assert.match(captured.stdout.join(""), /PROCESSED: good\.md — record /);
  assert.match(
    captured.stdout.join(""),
    /FAILED: later\.wav — Local audio processing is not implemented yet\./,
  );
  assert.match(captured.stdout.join(""), /Processed: 1/);
  assert.match(captured.stdout.join(""), /Failed: 1/);
  assert.deepEqual(captured.stderr, []);
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
