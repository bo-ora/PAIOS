import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
} from "node:fs";
import { basename } from "node:path";

import type { AudioToolConfiguration } from "./config.js";

export type DiagnosticState = "ready" | "missing" | "error";

export interface DiagnosticResult {
  state: DiagnosticState;
  summary: string;
}

export interface AudioDiagnostics {
  ready: boolean;
  ffmpeg: DiagnosticResult;
  whisperCli: DiagnosticResult;
  whisperModel: DiagnosticResult;
}

const maximumVersionLength = 200;
const checksumBufferSize = 1024 * 1024;

function boundedVersion(output: string, configuredCommand: string): string {
  const firstLine =
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "version unavailable";
  const redacted = firstLine.replaceAll(
    configuredCommand,
    basename(configuredCommand),
  );
  return redacted.length <= maximumVersionLength
    ? redacted
    : `${redacted.slice(0, maximumVersionLength - 3)}...`;
}

function diagnoseExecutable(
  label: string,
  configured: AudioToolConfiguration["ffmpeg"],
  args: string[],
  environmentName: string,
): DiagnosticResult {
  const result = spawnSync(configured.command, args, {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
  });
  const source = configured.source === "path" ? "PATH" : "configured path";

  if (result.error !== undefined) {
    const errorCode =
      "code" in result.error && typeof result.error.code === "string"
        ? result.error.code
        : undefined;
    if (errorCode === "ENOENT") {
      return {
        state: "missing",
        summary: `${label} was not found via ${source}; install it or set ${environmentName}.`,
      };
    }
    return {
      state: "error",
      summary: `${label} could not run via ${source}.`,
    };
  }
  if (result.status !== 0) {
    return {
      state: "error",
      summary: `${label} exited with status ${result.status ?? "unknown"} via ${source}.`,
    };
  }

  return {
    state: "ready",
    summary: `${boundedVersion(
      `${result.stdout}\n${result.stderr}`,
      configured.command,
    )} (${source})`,
  };
}

function checksumFile(path: string): { checksum: string; byteLength: number } {
  const descriptor = openSync(path, "r");
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new Error("not a regular file");
    }
    if (stat.size === 0) {
      throw new Error("empty file");
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
    return { checksum: hash.digest("hex"), byteLength: stat.size };
  } finally {
    closeSync(descriptor);
  }
}

function diagnoseModel(path: string | null): DiagnosticResult {
  if (path === null) {
    return {
      state: "missing",
      summary:
        "No model is configured; set PAIOS_WHISPER_MODEL_PATH to a local GGML model.",
    };
  }

  try {
    const { checksum, byteLength } = checksumFile(path);
    return {
      state: "ready",
      summary: `${basename(path)} (${byteLength} bytes, sha256 ${checksum})`,
    };
  } catch {
    return {
      state: "error",
      summary:
        "The configured model is not a readable, non-empty regular file.",
    };
  }
}

export function collectAudioDiagnostics(
  configuration: AudioToolConfiguration,
): AudioDiagnostics {
  const ffmpeg = diagnoseExecutable(
    "FFmpeg",
    configuration.ffmpeg,
    ["-version"],
    "PAIOS_FFMPEG_PATH",
  );
  const whisperCli = diagnoseExecutable(
    "whisper-cli",
    configuration.whisperCli,
    ["--version"],
    "PAIOS_WHISPER_CLI_PATH",
  );
  const whisperModel = diagnoseModel(configuration.whisperModelPath);

  return {
    ready:
      ffmpeg.state === "ready" &&
      whisperCli.state === "ready" &&
      whisperModel.state === "ready",
    ffmpeg,
    whisperCli,
    whisperModel,
  };
}
