import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { formatHuman } from "./format.js";
import {
  knowledgeUsage,
  parseKnowledgeCommand,
  type KnowledgeCommand,
} from "./knowledge/commands.js";
import { collectAudioDiagnostics } from "./knowledge/audio-diagnostics.js";
import {
  knowledgeDataRootEnvironment,
  resolveAudioToolConfiguration,
  resolveKnowledgeDataRoot,
} from "./knowledge/config.js";
import { ingestInbox } from "./knowledge/inbox.js";
import {
  addAudio,
  addFile,
  addNote,
  DuplicateKnowledgeError,
  getRecord,
  KnowledgeInputError,
  rebuildSearchIndex,
  searchRecords,
} from "./knowledge/records.js";
import { indexRepository } from "./knowledge/repository-index.js";
import { assertKnowledgeRuntime } from "./knowledge/runtime.js";
import { collectStatus } from "./status.js";
import type {
  KnowledgeRecord,
  KnowledgeSearchResult,
} from "./types.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface CliContext {
  environment: Readonly<Record<string, string | undefined>>;
  stdin: () => string;
}

const statusUsage = "Usage: ./paios status [--json]\n";
const generalUsage = `${statusUsage}${knowledgeUsage}`;

function runStatus(args: string[], root: string, io: CliIo): number {
  if (
    !(
      args.length === 0 ||
      (args.length === 1 && args[0] === "--json")
    )
  ) {
    io.stderr(statusUsage);
    return 2;
  }

  try {
    const status = collectStatus(root);
    if (args[0] === "--json") {
      io.stdout(`${JSON.stringify(status, null, 2)}\n`);
    } else {
      io.stdout(formatHuman(status));
    }
    return status.validation.passed ? 0 : 1;
  } catch {
    io.stderr("Unable to collect PAIOS status from the current repository.\n");
    return 2;
  }
}

function formatKnowledgeRecord(record: KnowledgeRecord): string {
  const lines = [
    `Record: ${record.id}`,
    `Type: ${record.sourceType}`,
    `Title: ${record.title ?? "(none)"}`,
    `State: ${record.state}`,
    `Captured: ${record.capturedAt}`,
    `Source: ${record.sourceReference}`,
    `Checksum: ${record.provenance.checksum}`,
    `Bytes: ${record.provenance.byteLength}`,
    `Adapter: ${record.provenance.adapter}`,
  ];
  if (record.error !== null) {
    lines.push(`Error: ${record.error}`);
  }
  lines.push("", record.normalizedText);
  return `${lines.join("\n")}\n`;
}

function formatSearchResults(results: KnowledgeSearchResult[]): string {
  if (results.length === 0) {
    return "No matching knowledge records.\n";
  }
  return `${results
    .map((result) =>
      [
        `${result.position}. ${result.title ?? result.recordId}`,
        `   Record: ${result.recordId}`,
        `   Type: ${result.sourceType}`,
        `   Source: ${result.sourceReference}`,
        `   Captured: ${result.capturedAt}`,
        `   Rank: ${result.rank}`,
        `   Match: ${result.excerpt}`,
      ].join("\n"),
    )
    .join("\n\n")}\n`;
}

function dataRootFor(
  command: Exclude<KnowledgeCommand, { name: "doctor" }>,
  root: string,
  context: CliContext,
): string {
  return resolveKnowledgeDataRoot({
    repositoryRoot: root,
    ...(command.dataRoot === undefined
      ? {}
      : { commandDataRoot: command.dataRoot }),
    ...(context.environment[knowledgeDataRootEnvironment] === undefined
      ? {}
      : {
          environmentDataRoot:
            context.environment[knowledgeDataRootEnvironment],
        }),
  });
}

function runKnowledge(
  args: string[],
  root: string,
  io: CliIo,
  context: CliContext,
): number {
  const command = parseKnowledgeCommand(args);
  if (command === null) {
    io.stderr(knowledgeUsage);
    return 2;
  }

  try {
    assertKnowledgeRuntime();
    if (command.name === "doctor") {
      const diagnostics = collectAudioDiagnostics(
        resolveAudioToolConfiguration(root, context.environment),
      );
      io.stdout(
        [
          "PAIOS audio diagnostics",
          `FFmpeg: ${diagnostics.ffmpeg.state} — ${diagnostics.ffmpeg.summary}`,
          `whisper-cli: ${diagnostics.whisperCli.state} — ${diagnostics.whisperCli.summary}`,
          `Whisper model: ${diagnostics.whisperModel.state} — ${diagnostics.whisperModel.summary}`,
          `Audio processing: ${diagnostics.ready ? "ready" : "not ready"}`,
          "",
        ].join("\n"),
      );
      return diagnostics.ready ? 0 : 1;
    }
    const dataRoot = dataRootFor(command, root, context);
    if (command.name === "add-note") {
      const content = command.text ?? context.stdin();
      const record = addNote(dataRoot, {
        content,
        ...(command.title === undefined ? {} : { title: command.title }),
      });
      io.stdout(`Captured note ${record.id}\nSource: ${record.sourceReference}\n`);
      return 0;
    }
    if (command.name === "show") {
      const record = getRecord(dataRoot, command.recordId);
      if (record === null) {
        io.stderr(`Knowledge record not found: ${command.recordId}\n`);
        return 1;
      }
      io.stdout(formatKnowledgeRecord(record));
      return 0;
    }
    if (command.name === "add-file") {
      const record = addFile(dataRoot, command.path);
      io.stdout(
        `Imported file ${record.id}\nSource: ${record.sourceReference}\n`,
      );
      return 0;
    }
    if (command.name === "add-audio") {
      const record = addAudio(dataRoot, command.path);
      io.stdout(
        [
          `Imported audio ${record.id}`,
          `Source: ${record.sourceReference}`,
          "Transcription: pending",
          "",
        ].join("\n"),
      );
      return 0;
    }
    if (command.name === "search") {
      io.stdout(formatSearchResults(searchRecords(dataRoot, command.query)));
      return 0;
    }
    if (command.name === "rebuild") {
      const count = rebuildSearchIndex(dataRoot);
      io.stdout(`Rebuilt search index for ${count} ready record(s).\n`);
      return 0;
    }
    if (command.name === "index") {
      const result = indexRepository(dataRoot, command.path);
      io.stdout(
        [
          "Repository indexing complete.",
          `Indexed: ${result.indexed}`,
          `Unchanged: ${result.unchanged}`,
          `Updated: ${result.updated}`,
          `Skipped: ${result.skipped}`,
          `Missing: ${result.missing}`,
          `Failed: ${result.failed}`,
          "",
        ].join("\n"),
      );
      return result.failed === 0 ? 0 : 1;
    }
    if (command.name === "ingest-inbox") {
      const result = ingestInbox(dataRoot);
      const itemLines = result.items.map((item) => {
        const details = [
          item.recordId === undefined ? undefined : `record ${item.recordId}`,
          item.message,
        ].filter((value): value is string => value !== undefined);
        return `${item.status.toUpperCase()}: ${item.path}${
          details.length === 0 ? "" : ` — ${details.join("; ")}`
        }`;
      });
      io.stdout(
        [
          "Inbox processing complete.",
          ...itemLines,
          `Processed: ${result.processed}`,
          `Duplicates: ${result.duplicates}`,
          `Skipped: ${result.skipped}`,
          `Failed: ${result.failed}`,
          "",
        ].join("\n"),
      );
      return result.failed === 0 ? 0 : 1;
    }

    io.stderr("Knowledge command not implemented yet.\n");
    return 2;
  } catch (error) {
    if (error instanceof DuplicateKnowledgeError) {
      io.stderr(`Duplicate knowledge record: ${error.existingRecordId}\n`);
      return 1;
    }
    if (error instanceof Error && error.message.startsWith("Note ")) {
      io.stderr(`${error.message}\n`);
      return 2;
    }
    if (error instanceof KnowledgeInputError) {
      io.stderr(`${error.message}\n`);
      return 2;
    }
    io.stderr("Unable to complete the knowledge operation.\n");
    return 1;
  }
}

const defaultContext: CliContext = {
  environment: {},
  stdin: () => "",
};

export function runCli(
  args: string[],
  root: string,
  io: CliIo,
  context: CliContext = defaultContext,
): number {
  if (args[0] === "status") {
    return runStatus(args.slice(1), root, io);
  }
  if (args[0] === "knowledge") {
    return runKnowledge(args.slice(1), root, io, context);
  }
  io.stderr(generalUsage);
  return 2;
}

function repositoryRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "not inside a Git repository");
  }
  return result.stdout.trim();
}

export function main(args: string[]): number {
  const io: CliIo = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
  try {
    return runCli(args, repositoryRoot(), io, {
      environment: process.env,
      stdin: () => readFileSync(0, "utf8"),
    });
  } catch {
    io.stderr("Unable to locate the current Git repository.\n");
    return 2;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
