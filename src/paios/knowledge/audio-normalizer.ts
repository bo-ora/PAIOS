import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import type { MediaDescriptor } from "../types.js";

export type AudioNormalizationFailure =
  | "invalid-source"
  | "missing-executable"
  | "timeout"
  | "process-failed"
  | "invalid-output";

export class AudioNormalizationError extends Error {
  constructor(
    readonly failure: AudioNormalizationFailure,
    message: string,
  ) {
    super(message);
  }
}

export interface AudioProcessResult {
  status: number | null;
  error?: Error;
  stderr: string;
}

export type AudioProcessRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => AudioProcessResult;

export interface AudioNormalizerOptions {
  ffmpegCommand: string;
  temporaryRoot: string;
  timeoutMs?: number;
  runProcess?: AudioProcessRunner;
}

export interface AudioNormalizationInput {
  bytes: Uint8Array;
  descriptor: MediaDescriptor;
}

const defaultTimeoutMs = 120_000;
const maximumDiagnosticLength = 500;

const defaultProcessRunner: AudioProcessRunner = (
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

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateSource(input: AudioNormalizationInput): void {
  if (
    !/^[a-z0-9][a-z0-9-]*$/.test(input.descriptor.detectedContainer) ||
    input.bytes.byteLength !== input.descriptor.byteLength ||
    checksum(input.bytes) !== input.descriptor.checksum
  ) {
    throw new AudioNormalizationError(
      "invalid-source",
      "Audio bytes do not match the media descriptor.",
    );
  }
}

function boundedDiagnostic(
  value: string,
  temporaryDirectory: string,
  configuredCommand: string,
): string {
  const redacted = value
    .replaceAll(temporaryDirectory, "<temporary>")
    .replaceAll(configuredCommand, basename(configuredCommand))
    .replace(/\s+/g, " ")
    .trim();
  if (redacted.length === 0) {
    return "No FFmpeg diagnostic was provided.";
  }
  return redacted.length <= maximumDiagnosticLength
    ? redacted
    : `${redacted.slice(0, maximumDiagnosticLength - 3)}...`;
}

function readUInt16LittleEndian(
  bytes: Uint8Array,
  offset: number,
): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUInt32LittleEndian(
  bytes: Uint8Array,
  offset: number,
): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function bytesEqualAt(
  bytes: Uint8Array,
  offset: number,
  expected: string,
): boolean {
  if (offset + expected.length > bytes.byteLength) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

function validateCanonicalWav(bytes: Uint8Array): void {
  if (
    bytes.byteLength < 44 ||
    !bytesEqualAt(bytes, 0, "RIFF") ||
    !bytesEqualAt(bytes, 8, "WAVE")
  ) {
    throw new AudioNormalizationError(
      "invalid-output",
      "FFmpeg did not produce a valid WAV file.",
    );
  }

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = readUInt32LittleEndian(bytes, offset + 4);
    if (
      bytesEqualAt(bytes, offset, "fmt ") &&
      chunkLength >= 16 &&
      offset + 8 + chunkLength <= bytes.byteLength
    ) {
      const format = readUInt16LittleEndian(bytes, offset + 8);
      const channels = readUInt16LittleEndian(bytes, offset + 10);
      const sampleRate = readUInt32LittleEndian(bytes, offset + 12);
      const bitsPerSample = readUInt16LittleEndian(bytes, offset + 22);
      if (
        format === 1 &&
        channels === 1 &&
        sampleRate === 16_000 &&
        bitsPerSample === 16
      ) {
        return;
      }
      break;
    }
    offset += 8 + chunkLength + (chunkLength % 2);
  }

  throw new AudioNormalizationError(
    "invalid-output",
    "FFmpeg output must be 16 kHz mono signed 16-bit PCM WAV.",
  );
}

export function withNormalizedAudio<T>(
  input: AudioNormalizationInput,
  options: AudioNormalizerOptions,
  use: (normalizedPath: string) => T,
): T {
  validateSource(input);
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new AudioNormalizationError(
      "invalid-source",
      "Audio normalization timeout must be a positive integer.",
    );
  }

  mkdirSync(options.temporaryRoot, { recursive: true, mode: 0o700 });
  const temporaryDirectory = mkdtempSync(
    join(options.temporaryRoot, "paios-audio-"),
  );
  const inputPath = join(
    temporaryDirectory,
    `original.${input.descriptor.detectedContainer}`,
  );
  const outputPath = join(temporaryDirectory, "normalized.wav");

  try {
    writeFileSync(inputPath, input.bytes, { mode: 0o600 });
    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      outputPath,
    ];
    const result = (options.runProcess ?? defaultProcessRunner)(
      options.ffmpegCommand,
      args,
      timeoutMs,
    );
    const code = errorCode(result.error);
    if (code === "ENOENT") {
      throw new AudioNormalizationError(
        "missing-executable",
        "FFmpeg was not found; configure PAIOS_FFMPEG_PATH or install it on PATH.",
      );
    }
    if (code === "ETIMEDOUT") {
      throw new AudioNormalizationError(
        "timeout",
        `FFmpeg normalization exceeded ${timeoutMs} ms.`,
      );
    }
    if (result.error !== undefined) {
      throw new AudioNormalizationError(
        "process-failed",
        "FFmpeg normalization could not start.",
      );
    }
    if (result.status !== 0) {
      throw new AudioNormalizationError(
        "process-failed",
        `FFmpeg normalization failed with status ${
          result.status ?? "unknown"
        }: ${boundedDiagnostic(
          result.stderr,
          temporaryDirectory,
          options.ffmpegCommand,
        )}`,
      );
    }

    let normalizedBytes: Buffer;
    try {
      normalizedBytes = readFileSync(outputPath);
    } catch {
      throw new AudioNormalizationError(
        "invalid-output",
        "FFmpeg completed without producing normalized audio.",
      );
    }
    validateCanonicalWav(normalizedBytes);
    return use(outputPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
