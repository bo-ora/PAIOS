import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";

export type AudioTranscriptionFailure =
  | "invalid-input"
  | "invalid-model"
  | "missing-executable"
  | "timeout"
  | "process-failed"
  | "invalid-output";

export class AudioTranscriptionError extends Error {
  constructor(
    readonly failure: AudioTranscriptionFailure,
    message: string,
    readonly exitStatus: number | null = null,
  ) {
    super(message);
  }
}

export interface TranscriptionProcessResult {
  status: number | null;
  error?: Error;
  stderr: string;
}

export type TranscriptionProcessRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => TranscriptionProcessResult;

export interface AudioTranscriberOptions {
  whisperCommand: string;
  whisperVersion: string;
  modelPath: string;
  temporaryRoot: string;
  language?: string;
  timeoutMs?: number;
  runProcess?: TranscriptionProcessRunner;
}

export interface AudioTranscriptionResult {
  transcript: string;
  implementation: "whisper-cli";
  implementationVersion: string;
  modelFilename: string;
  modelChecksum: string;
  language: string;
  exitStatus: 0;
}

export interface WhisperModelMetadata {
  modelFilename: string;
  modelChecksum: string;
}

const defaultTimeoutMs = 600_000;
const maximumDiagnosticLength = 500;
const checksumBufferSize = 1024 * 1024;

const defaultProcessRunner: TranscriptionProcessRunner = (
  command,
  args,
  timeoutMs,
) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    ...(result.error === undefined ? {} : { error: result.error }),
    stderr: result.stderr,
  };
};

function errorCode(error: Error | undefined): string | undefined {
  if (
    error !== undefined &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function checksumFile(path: string): string {
  let descriptor: number;
  try {
    descriptor = openSync(path, "r");
  } catch {
    throw new AudioTranscriptionError(
      "invalid-model",
      "The configured Whisper model is not a readable, non-empty regular file.",
    );
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error("invalid model");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(checksumBufferSize);
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
    return hash.digest("hex");
  } catch {
    throw new AudioTranscriptionError(
      "invalid-model",
      "The configured Whisper model is not a readable, non-empty regular file.",
    );
  } finally {
    closeSync(descriptor);
  }
}

export function inspectWhisperModel(path: string): WhisperModelMetadata {
  return {
    modelFilename: basename(path),
    modelChecksum: checksumFile(path),
  };
}

function boundedDiagnostic(
  value: string,
  temporaryDirectory: string,
  configuredCommand: string,
  modelPath: string,
  normalizedPath: string,
): string {
  const redacted = value
    .replaceAll(temporaryDirectory, "<temporary>")
    .replaceAll(modelPath, basename(modelPath))
    .replaceAll(normalizedPath, basename(normalizedPath))
    .replaceAll(configuredCommand, basename(configuredCommand))
    .replace(/\s+/g, " ")
    .trim();
  if (redacted.length === 0) {
    return "No whisper-cli diagnostic was provided.";
  }
  return redacted.length <= maximumDiagnosticLength
    ? redacted
    : `${redacted.slice(0, maximumDiagnosticLength - 3)}...`;
}

function validateOptions(
  normalizedPath: string,
  options: AudioTranscriberOptions,
): { timeoutMs: number; language: string } {
  let stats;
  try {
    stats = statSync(normalizedPath);
  } catch {
    throw new AudioTranscriptionError(
      "invalid-input",
      "Normalized audio is not a readable regular file.",
    );
  }
  if (!stats.isFile() || stats.size === 0) {
    throw new AudioTranscriptionError(
      "invalid-input",
      "Normalized audio is not a readable regular file.",
    );
  }
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new AudioTranscriptionError(
      "invalid-input",
      "Audio transcription timeout must be a positive integer.",
    );
  }
  const language = options.language?.trim() ?? "auto";
  if (!/^(auto|[a-z]{2,3})$/.test(language)) {
    throw new AudioTranscriptionError(
      "invalid-input",
      "Whisper language must be 'auto' or a two- or three-letter lowercase code.",
    );
  }
  if (options.whisperVersion.trim().length === 0) {
    throw new AudioTranscriptionError(
      "invalid-input",
      "whisper-cli version metadata must not be empty.",
    );
  }
  return { timeoutMs, language };
}

export function transcribeNormalizedAudio(
  normalizedPath: string,
  options: AudioTranscriberOptions,
): AudioTranscriptionResult {
  const { timeoutMs, language } = validateOptions(normalizedPath, options);
  const { modelFilename, modelChecksum } = inspectWhisperModel(
    options.modelPath,
  );
  mkdirSync(options.temporaryRoot, { recursive: true, mode: 0o700 });
  const temporaryDirectory = mkdtempSync(
    join(options.temporaryRoot, "paios-transcript-"),
  );
  const outputPrefix = join(temporaryDirectory, "transcript");
  const outputPath = `${outputPrefix}.txt`;

  try {
    const args = [
      "-m",
      options.modelPath,
      "-f",
      normalizedPath,
      "-l",
      language,
      "-otxt",
      "-of",
      outputPrefix,
      "-np",
      "-nt",
    ];
    const result = (options.runProcess ?? defaultProcessRunner)(
      options.whisperCommand,
      args,
      timeoutMs,
    );
    const code = errorCode(result.error);
    if (code === "ENOENT") {
      throw new AudioTranscriptionError(
        "missing-executable",
        "whisper-cli was not found; configure PAIOS_WHISPER_CLI_PATH or install it on PATH.",
      );
    }
    if (code === "ETIMEDOUT") {
      throw new AudioTranscriptionError(
        "timeout",
        `whisper-cli transcription exceeded ${timeoutMs} ms.`,
      );
    }
    if (result.error !== undefined) {
      throw new AudioTranscriptionError(
        "process-failed",
        "whisper-cli transcription could not start.",
      );
    }
    if (result.status !== 0) {
      throw new AudioTranscriptionError(
        "process-failed",
        `whisper-cli transcription failed with status ${
          result.status ?? "unknown"
        }: ${boundedDiagnostic(
          result.stderr,
          temporaryDirectory,
          options.whisperCommand,
          options.modelPath,
          normalizedPath,
        )}`,
        result.status,
      );
    }

    let transcript: string;
    try {
      transcript = new TextDecoder("utf-8", { fatal: true })
        .decode(readFileSync(outputPath))
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .normalize("NFC")
        .trim();
    } catch {
      throw new AudioTranscriptionError(
        "invalid-output",
        "whisper-cli completed without producing a UTF-8 transcript.",
        0,
      );
    }
    if (transcript.length === 0) {
      throw new AudioTranscriptionError(
        "invalid-output",
        "whisper-cli produced an empty transcript.",
        0,
      );
    }

    return {
      transcript,
      implementation: "whisper-cli",
      implementationVersion: options.whisperVersion.trim(),
      modelFilename,
      modelChecksum,
      language,
      exitStatus: 0,
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
