import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { formatHuman } from "./format.js";
import {
  knowledgeUsage,
  parseKnowledgeCommand,
  type KnowledgeCommand,
} from "./knowledge/commands.js";
import {
  createKnowledgeBackup,
  KnowledgeBackupError,
  restoreKnowledgeBackup,
} from "./knowledge/backup.js";
import { collectAudioDiagnostics } from "./knowledge/audio-diagnostics.js";
import { processAudioRecord } from "./knowledge/audio-processing.js";
import {
  assertPrivateRepositoryPath,
  KnowledgeConfigurationError,
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
import type { FetchLike } from "./http-fetch.js";
import {
  resolveSynthesisConfig,
  resolveTelegramConfig,
  TelegramConfigError,
} from "./telegram/config.js";
import { collectTelegramDiagnostics } from "./telegram/doctor.js";
import { createFileCursorStore } from "./telegram/cursor-store.js";
import { createTelegramProvider } from "./telegram/telegram-provider.js";
import { createOllamaProvider } from "./synthesis/ollama-provider.js";
import { runAssistant, type AssistantDeps } from "./telegram/assistant.js";
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
  fetch?: FetchLike;
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
  const dataRoot = resolveKnowledgeDataRoot({
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
  assertPrivateRepositoryPath(root, dataRoot, "Knowledge data root");
  return dataRoot;
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
      const configuration = resolveAudioToolConfiguration(
        root,
        context.environment,
      );
      const diagnostics = collectAudioDiagnostics(configuration);
      if (
        !diagnostics.ready ||
        diagnostics.whisperCli.version === null ||
        configuration.whisperModelPath === null
      ) {
        io.stdout(
          [
            `Imported audio ${record.id}`,
            `Source: ${record.sourceReference}`,
            "Transcription: pending",
            "",
          ].join("\n"),
        );
        io.stderr(
          "Audio processing is not ready; run './paios knowledge doctor' for diagnostics.\n",
        );
        return 1;
      }
      const temporaryRoot = join(dataRoot, "temporary");
      const result = processAudioRecord(dataRoot, record.id, {
        normalizer: {
          ffmpegCommand: configuration.ffmpeg.command,
          temporaryRoot,
        },
        transcriber: {
          whisperCommand: configuration.whisperCli.command,
          whisperVersion: diagnostics.whisperCli.version,
          modelPath: configuration.whisperModelPath,
          temporaryRoot,
        },
      });
      io.stdout(
        [
          `Imported audio ${record.id}`,
          `Source: ${record.sourceReference}`,
          `Transcription: ${result.record.state}`,
          ...(result.record.error === null
            ? []
            : [`Error: ${result.record.error}`]),
          "",
        ].join("\n"),
      );
      return result.status === "succeeded" || result.status === "already-ready"
        ? 0
        : 1;
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
      const configuration = resolveAudioToolConfiguration(
        root,
        context.environment,
      );
      const diagnostics = collectAudioDiagnostics(configuration);
      const temporaryRoot = join(dataRoot, "temporary");
      const result = ingestInbox(
        dataRoot,
        diagnostics.ready &&
          diagnostics.whisperCli.version !== null &&
          configuration.whisperModelPath !== null
          ? {
              normalizer: {
                ffmpegCommand: configuration.ffmpeg.command,
                temporaryRoot,
              },
              transcriber: {
                whisperCommand: configuration.whisperCli.command,
                whisperVersion: diagnostics.whisperCli.version,
                modelPath: configuration.whisperModelPath,
                temporaryRoot,
              },
            }
          : undefined,
      );
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
    if (error instanceof KnowledgeConfigurationError) {
      io.stderr(`${error.message}\n`);
      return 2;
    }
    io.stderr("Unable to complete the knowledge operation.\n");
    return 1;
  }
}

const telegramUsage = `Usage:
  ./paios telegram doctor
  ./paios telegram serve
`;

function resolvedFetch(context: CliContext): FetchLike {
  return context.fetch ?? globalThis.fetch;
}

function audioOptionsIfReady(
  root: string,
  context: CliContext,
  dataRoot: string,
): AssistantDeps["audio"] {
  const configuration = resolveAudioToolConfiguration(
    root,
    context.environment,
  );
  const diagnostics = collectAudioDiagnostics(configuration);
  if (
    !diagnostics.ready ||
    diagnostics.whisperCli.version === null ||
    configuration.whisperModelPath === null
  ) {
    return undefined;
  }
  const temporaryRoot = join(dataRoot, "temporary");
  return {
    normalizer: {
      ffmpegCommand: configuration.ffmpeg.command,
      temporaryRoot,
    },
    transcriber: {
      whisperCommand: configuration.whisperCli.command,
      whisperVersion: diagnostics.whisperCli.version,
      modelPath: configuration.whisperModelPath,
      temporaryRoot,
    },
  };
}

async function runTelegram(
  args: string[],
  root: string,
  io: CliIo,
  context: CliContext,
): Promise<number> {
  const subcommand = args[0];

  if (subcommand === "doctor") {
    const diagnostics = await collectTelegramDiagnostics(
      context.environment,
      resolvedFetch(context),
    );
    io.stdout(
      ["PAIOS Telegram diagnostics", ...diagnostics.summary, ""].join("\n"),
    );
    return diagnostics.ready ? 0 : 1;
  }

  if (subcommand === "serve") {
    let telegramConfig;
    try {
      telegramConfig = resolveTelegramConfig(context.environment);
    } catch (error) {
      if (error instanceof TelegramConfigError) {
        io.stderr(`${error.message}\n`);
        return 2;
      }
      throw error;
    }
    const synthesisConfig = resolveSynthesisConfig(context.environment);
    const dataRoot = resolveKnowledgeDataRoot({
      repositoryRoot: root,
      ...(context.environment[knowledgeDataRootEnvironment] === undefined
        ? {}
        : {
            environmentDataRoot:
              context.environment[knowledgeDataRootEnvironment],
          }),
    });
    assertPrivateRepositoryPath(root, dataRoot, "Knowledge data root");
    const fetchImpl = resolvedFetch(context);
    const audio = audioOptionsIfReady(root, context, dataRoot);
    const deps: AssistantDeps = {
      dataRoot,
      tempRoot: join(dataRoot, "temporary"),
      provider: createTelegramProvider({
        config: telegramConfig,
        cursorStore: createFileCursorStore(dataRoot),
        fetch: fetchImpl,
      }),
      synthesis: createOllamaProvider({
        config: synthesisConfig,
        fetch: fetchImpl,
      }),
      ...(audio === undefined ? {} : { audio }),
      log: (event) => {
        io.stdout(
          `telegram ${event.event} ${event.workspace} ${event.outcome}\n`,
        );
      },
    };
    io.stdout(
      `PAIOS Telegram assistant serving ${telegramConfig.allowedChatIds.size} workspace(s) with model ${synthesisConfig.model}.\n`,
    );
    await runAssistant(deps);
    return 0;
  }

  io.stderr(telegramUsage);
  return 2;
}

const defaultContext: CliContext = {
  environment: {},
  stdin: () => "",
};

export function runCliSync(
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

export async function runCli(
  args: string[],
  root: string,
  io: CliIo,
  context: CliContext = defaultContext,
): Promise<number> {
  if (args[0] === "telegram") {
    return runTelegram(args.slice(1), root, io, context);
  }
  if (
    args[0] !== "knowledge" ||
    (args[1] !== "backup" && args[1] !== "restore")
  ) {
    return runCliSync(args, root, io, context);
  }
  const command = parseKnowledgeCommand(args.slice(1));
  if (
    command === null ||
    (command.name !== "backup" && command.name !== "restore")
  ) {
    io.stderr(knowledgeUsage);
    return 2;
  }

  try {
    assertKnowledgeRuntime();
    if (command.name === "backup") {
      const dataRoot = dataRootFor(command, root, context);
      assertPrivateRepositoryPath(
        root,
        command.destination,
        "Backup destination",
      );
      const result = await createKnowledgeBackup(dataRoot, command.destination);
      io.stdout(
        `Created knowledge backup with ${result.fileCount} file(s).\nDestination: ${command.destination}\n`,
      );
      return 0;
    }
    assertPrivateRepositoryPath(
      root,
      command.dataRoot,
      "Restore destination",
    );
    const result = restoreKnowledgeBackup(command.backup, command.dataRoot);
    io.stdout(
      `Restored ${result.recordCount} knowledge record(s) from ${result.fileCount} file(s).\nIndexed: ${result.indexedRecordCount} ready record(s).\nStale indexed sources: ${result.staleIndexedRecordCount}.\nDestination: ${command.dataRoot}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof KnowledgeBackupError) {
      io.stderr(`${error.message}\n`);
      return 1;
    }
    if (error instanceof KnowledgeConfigurationError) {
      io.stderr(`${error.message}\n`);
      return 2;
    }
    io.stderr("Unable to complete the knowledge operation.\n");
    return 1;
  }
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

export async function main(args: string[]): Promise<number> {
  const io: CliIo = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
  try {
    return await runCli(args, repositoryRoot(), io, {
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
  process.exitCode = await main(process.argv.slice(2));
}
