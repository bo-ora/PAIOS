import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  aggregateBenchmarkRuns,
  benchmarkLanguage,
  benchmarkMeasuredRuns,
  benchmarkModels,
  benchmarkReferenceSentence,
  benchmarkWarmupRuns,
  calculateWordErrorRate,
  formatAudioBenchmarkReport,
  normalizeBenchmarkTranscript,
  resolveAudioBenchmarkConfiguration,
  type AudioBenchmarkReport,
  type BenchmarkRunResult,
} from "./audio-benchmark-harness.js";
import { assertPrivateRepositoryPath } from "../../src/paios/knowledge/config.js";

const repositoryRoot = process.cwd();
const maximumDiagnosticLength = 500;
const checksumBufferSize = 1024 * 1024;

function boundedDiagnostic(value: string, paths: readonly string[] = []): string {
  let redacted = value;
  for (const path of paths) {
    redacted = redacted.replaceAll(path, basename(path));
  }
  redacted = redacted.replace(/\s+/g, " ").trim();
  if (redacted.length === 0) {
    return "No diagnostic was provided.";
  }
  return redacted.length <= maximumDiagnosticLength
    ? redacted
    : `${redacted.slice(0, maximumDiagnosticLength - 3)}...`;
}

function run(
  command: string,
  args: string[],
  timeoutMs: number,
  redactedPaths: readonly string[] = [],
): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${basename(command)} failed: ${boundedDiagnostic(
        `${result.error?.message ?? ""} ${result.stderr}`,
        redactedPaths,
      )}`,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function firstOutputLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "version unavailable"
  );
}

function checksumFile(path: string): { byteLength: number; sha256: string } {
  const descriptor = openSync(path, "r");
  try {
    const stats = fstatSync(descriptor);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(checksumBufferSize);
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
    return { byteLength: stats.size, sha256: hash.digest("hex") };
  } finally {
    closeSync(descriptor);
  }
}

function downloadModel(
  model: (typeof benchmarkModels)[number],
  destination: string,
  timeoutMs: number,
): { byteLength: number; sha256: string } {
  const partial = `${destination}.partial`;
  try {
    run(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--output",
        partial,
        model.downloadUrl,
      ],
      timeoutMs,
      [partial, destination],
    );
    const metadata = checksumFile(partial);
    if (
      metadata.byteLength !== model.byteLength ||
      metadata.sha256 !== model.sha256
    ) {
      throw new Error(
        `Downloaded ${model.filename} did not match its pinned size and SHA-256.`,
      );
    }
    renameSync(partial, destination);
    return metadata;
  } finally {
    rmSync(partial, { force: true });
  }
}

function wavDurationSeconds(path: string): number {
  const bytes = readFileSync(path);
  if (
    bytes.length < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Benchmark fixture is not a valid WAV file.");
  }
  let byteRate = 0;
  let dataLength = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (name === "fmt " && length >= 16) {
      const format = bytes.readUInt16LE(offset + 8);
      const channels = bytes.readUInt16LE(offset + 10);
      const sampleRate = bytes.readUInt32LE(offset + 12);
      byteRate = bytes.readUInt32LE(offset + 16);
      const bitsPerSample = bytes.readUInt16LE(offset + 22);
      if (
        format !== 1 ||
        channels !== 1 ||
        sampleRate !== 16_000 ||
        bitsPerSample !== 16
      ) {
        throw new Error("Benchmark fixture is not canonical PCM WAV.");
      }
    }
    if (name === "data") {
      dataLength = length;
    }
    offset += 8 + length + (length % 2);
  }
  if (byteRate <= 0 || dataLength <= 0) {
    throw new Error("Benchmark fixture WAV metadata is incomplete.");
  }
  return dataLength / byteRate;
}

function whisperArguments(
  modelPath: string,
  fixturePath: string,
  outputPrefix: string,
): string[] {
  return [
    "-m",
    modelPath,
    "-f",
    fixturePath,
    "-l",
    benchmarkLanguage,
    "-otxt",
    "-of",
    outputPrefix,
    "-np",
    "-nt",
  ];
}

function readTranscript(outputPrefix: string): string {
  const transcript = new TextDecoder("utf-8", { fatal: true })
    .decode(readFileSync(`${outputPrefix}.txt`))
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .trim();
  if (transcript.length === 0) {
    throw new Error("whisper-cli produced an empty transcript.");
  }
  return transcript;
}

function runWarmup(
  whisperCommand: string,
  modelPath: string,
  fixturePath: string,
  runRoot: string,
  timeoutMs: number,
): void {
  const outputPrefix = join(runRoot, "warmup");
  try {
    run(
      whisperCommand,
      whisperArguments(modelPath, fixturePath, outputPrefix),
      timeoutMs,
      [modelPath, fixturePath, outputPrefix, runRoot],
    );
    readTranscript(outputPrefix);
  } finally {
    rmSync(`${outputPrefix}.txt`, { force: true });
  }
}

function measuredRun(
  whisperCommand: string,
  modelPath: string,
  fixturePath: string,
  runRoot: string,
  runNumber: number,
  timeoutMs: number,
): BenchmarkRunResult {
  const outputPrefix = join(runRoot, `measured-${runNumber}`);
  const args = whisperArguments(modelPath, fixturePath, outputPrefix);
  const startedAt = performance.now();
  try {
    const result = run(
      "/usr/bin/time",
      ["-l", whisperCommand, ...args],
      timeoutMs,
      [modelPath, fixturePath, outputPrefix, runRoot],
    );
    const wallTimeSeconds = (performance.now() - startedAt) / 1000;
    const peakMatch = /(\d+)\s+maximum resident set size/.exec(result.stderr);
    if (peakMatch?.[1] === undefined) {
      throw new Error("Peak resident memory was not reported by /usr/bin/time.");
    }
    const normalizedTranscript = normalizeBenchmarkTranscript(
      readTranscript(outputPrefix),
    );
    return {
      wallTimeSeconds,
      peakResidentBytes: Number(peakMatch[1]),
      normalizedTranscript,
      wordErrorRate: calculateWordErrorRate(
        benchmarkReferenceSentence,
        normalizedTranscript,
      ),
    };
  } finally {
    rmSync(`${outputPrefix}.txt`, { force: true });
  }
}

function main(): number {
  const resolution = resolveAudioBenchmarkConfiguration(
    repositoryRoot,
    process.env,
  );
  if (resolution.status === "skipped") {
    process.stdout.write(`${resolution.reason}\n`);
    return 0;
  }
  if (resolution.status === "invalid") {
    process.stderr.write(`${resolution.reason}\n`);
    return 2;
  }

  const { benchmarkRoot, timeoutMs } = resolution.configuration;
  assertPrivateRepositoryPath(
    repositoryRoot,
    benchmarkRoot,
    "Audio benchmark root",
  );
  if (existsSync(benchmarkRoot)) {
    process.stderr.write(
      `${basename(benchmarkRoot)} already exists; remove it before running the benchmark.\n`,
    );
    return 2;
  }

  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "paios-audio-benchmark-"),
  );
  const modelRoot = join(benchmarkRoot, "models");
  const fixtureAiff = join(temporaryRoot, "fixture.aiff");
  const fixtureWav = join(temporaryRoot, "fixture.wav");
  try {
    mkdirSync(dirname(benchmarkRoot), { recursive: true, mode: 0o700 });
    mkdirSync(benchmarkRoot, { mode: 0o700 });
    mkdirSync(modelRoot, { mode: 0o700 });
    run(
      "/usr/bin/say",
      ["-v", "Samantha", "-o", fixtureAiff, benchmarkReferenceSentence],
      timeoutMs,
      [temporaryRoot, fixtureAiff],
    );
    run(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        fixtureAiff,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        fixtureWav,
      ],
      timeoutMs,
      [temporaryRoot, fixtureAiff, fixtureWav],
    );
    rmSync(fixtureAiff, { force: true });
    const durationSeconds = wavDurationSeconds(fixtureWav);
    const ffmpegVersion = firstOutputLine(
      `${run("ffmpeg", ["-version"], timeoutMs).stdout}`,
    );
    const whisperVersionResult = run(
      "whisper-cli",
      ["--version"],
      timeoutMs,
    );
    const whisperVersion = firstOutputLine(
      `${whisperVersionResult.stdout}\n${whisperVersionResult.stderr}`,
    );

    const report: AudioBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      architecture: process.arch,
      ffmpegVersion,
      whisperVersion,
      fixture: {
        voice: "Samantha",
        language: benchmarkLanguage,
        durationSeconds,
        format: "16 kHz mono signed 16-bit PCM WAV",
        referenceSentence: benchmarkReferenceSentence,
      },
      execution: {
        warmupRuns: benchmarkWarmupRuns,
        measuredRuns: benchmarkMeasuredRuns,
        sequential: true,
        whisperArguments: whisperArguments(
          "<model>",
          "<fixture>",
          "<output>",
        ),
        measurement:
          "Node monotonic wall clock and /usr/bin/time -l maximum resident set size",
      },
      models: [],
    };

    for (const model of benchmarkModels) {
      const modelPath = join(modelRoot, model.filename);
      const runRoot = join(temporaryRoot, model.filename.replace(".bin", ""));
      mkdirSync(runRoot, { recursive: true, mode: 0o700 });
      process.stderr.write(`Downloading ${model.filename}...\n`);
      const metadata = downloadModel(model, modelPath, timeoutMs);
      process.stderr.write(`Warming ${model.filename}...\n`);
      runWarmup(
        "whisper-cli",
        modelPath,
        fixtureWav,
        runRoot,
        timeoutMs,
      );
      const measuredRuns: BenchmarkRunResult[] = [];
      for (
        let runNumber = 1;
        runNumber <= benchmarkMeasuredRuns;
        runNumber += 1
      ) {
        process.stderr.write(
          `Measuring ${model.filename} run ${runNumber}/${benchmarkMeasuredRuns}...\n`,
        );
        measuredRuns.push(
          measuredRun(
            "whisper-cli",
            modelPath,
            fixtureWav,
            runRoot,
            runNumber,
            timeoutMs,
          ),
        );
      }
      report.models.push(
        aggregateBenchmarkRuns(
          {
            modelFilename: model.filename,
            byteLength: metadata.byteLength,
            sha256: metadata.sha256,
          },
          measuredRuns,
          durationSeconds,
        ),
      );
      rmSync(modelPath, { force: true });
      rmSync(runRoot, { recursive: true, force: true });
    }

    process.stdout.write(formatAudioBenchmarkReport(report));
    return 0;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
    for (const model of benchmarkModels) {
      rmSync(join(modelRoot, model.filename), { force: true });
      rmSync(join(modelRoot, `${model.filename}.partial`), { force: true });
    }
    try {
      rmdirSync(modelRoot);
      rmdirSync(benchmarkRoot);
    } catch {
      // Preserve any unexpected files rather than deleting unrelated content.
    }
  }
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${boundedDiagnostic(error instanceof Error ? error.message : String(error))}\n`,
  );
  process.exitCode = 1;
}
