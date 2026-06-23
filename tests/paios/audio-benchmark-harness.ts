import { isAbsolute, resolve } from "node:path";

export const audioBenchmarkOptInEnvironment = "PAIOS_RUN_AUDIO_BENCHMARK";
export const audioBenchmarkTimeoutEnvironment =
  "PAIOS_AUDIO_BENCHMARK_TIMEOUT_MS";
export const audioBenchmarkRootEnvironment = "PAIOS_AUDIO_BENCHMARK_ROOT";

export const benchmarkReferenceSentence =
  "The local knowledge system records this clear English speech sample. " +
  "Searchable audio should remain private, durable, and available offline.";

export const benchmarkLanguage = "en";
export const benchmarkWarmupRuns = 1;
export const benchmarkMeasuredRuns = 3;
export const benchmarkModelRevision =
  "5359861c739e955e79d9a303bcbc70fb988958b1";

export interface BenchmarkModelDefinition {
  filename: "ggml-tiny.bin" | "ggml-base.bin" | "ggml-small.bin";
  downloadUrl: string;
  byteLength: number;
  sha256: string;
}

export const benchmarkModels: readonly BenchmarkModelDefinition[] = [
  {
    filename: "ggml-tiny.bin",
    downloadUrl:
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/${benchmarkModelRevision}/ggml-tiny.bin`,
    byteLength: 77_691_713,
    sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
  },
  {
    filename: "ggml-base.bin",
    downloadUrl:
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/${benchmarkModelRevision}/ggml-base.bin`,
    byteLength: 147_951_465,
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
  },
  {
    filename: "ggml-small.bin",
    downloadUrl:
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/${benchmarkModelRevision}/ggml-small.bin`,
    byteLength: 487_601_967,
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
  },
];

export interface AudioBenchmarkConfiguration {
  benchmarkRoot: string;
  timeoutMs: number;
}

export type AudioBenchmarkResolution =
  | { status: "skipped"; reason: string }
  | { status: "invalid"; reason: string }
  | { status: "configured"; configuration: AudioBenchmarkConfiguration };

export interface BenchmarkRunResult {
  wallTimeSeconds: number;
  peakResidentBytes: number;
  normalizedTranscript: string;
  wordErrorRate: number;
}

export interface BenchmarkModelResult {
  modelFilename: string;
  byteLength: number;
  sha256: string;
  measuredRuns: BenchmarkRunResult[];
  medianWallTimeSeconds: number;
  realTimeFactor: number;
  peakResidentBytes: number;
  normalizedTranscript: string;
  wordErrorRate: number;
}

export interface AudioBenchmarkReport {
  generatedAt: string;
  platform: string;
  architecture: string;
  ffmpegVersion: string;
  whisperVersion: string;
  fixture: {
    voice: "Samantha";
    language: "en";
    durationSeconds: number;
    format: "16 kHz mono signed 16-bit PCM WAV";
    referenceSentence: string;
  };
  execution: {
    warmupRuns: 1;
    measuredRuns: 3;
    sequential: true;
    whisperArguments: string[];
    measurement: string;
  };
  models: BenchmarkModelResult[];
}

function resolveConfiguredPath(repositoryRoot: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(repositoryRoot, value);
}

export function resolveAudioBenchmarkConfiguration(
  repositoryRoot: string,
  environment: Readonly<Record<string, string | undefined>>,
): AudioBenchmarkResolution {
  if (environment[audioBenchmarkOptInEnvironment]?.trim() !== "1") {
    return {
      status: "skipped",
      reason: `Set ${audioBenchmarkOptInEnvironment}=1 to run the local audio benchmark.`,
    };
  }

  const configuredTimeout =
    environment[audioBenchmarkTimeoutEnvironment]?.trim();
  const timeoutText =
    configuredTimeout === undefined || configuredTimeout.length === 0
      ? "600000"
      : configuredTimeout;
  const timeoutMs = Number(timeoutText);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return {
      status: "invalid",
      reason: `${audioBenchmarkTimeoutEnvironment} must be a positive integer.`,
    };
  }

  const rootValue = environment[audioBenchmarkRootEnvironment]?.trim();
  const configuredRoot =
    rootValue === undefined || rootValue.length === 0
      ? ".local/paios-benchmark"
      : rootValue;
  return {
    status: "configured",
    configuration: {
      benchmarkRoot: resolveConfiguredPath(repositoryRoot, configuredRoot),
      timeoutMs,
    },
  };
}

export function normalizeBenchmarkTranscript(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  const normalized = normalizeBenchmarkTranscript(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

export function calculateWordErrorRate(
  reference: string,
  transcript: string,
): number {
  const expected = words(reference);
  const actual = words(transcript);
  if (expected.length === 0) {
    return actual.length === 0 ? 0 : 1;
  }

  let previous = Array.from(
    { length: actual.length + 1 },
    (_, index) => index,
  );
  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    const current = [expectedIndex];
    for (let actualIndex = 1; actualIndex <= actual.length; actualIndex += 1) {
      const substitutionCost =
        expected[expectedIndex - 1] === actual[actualIndex - 1] ? 0 : 1;
      current[actualIndex] = Math.min(
        (current[actualIndex - 1] ?? 0) + 1,
        (previous[actualIndex] ?? 0) + 1,
        (previous[actualIndex - 1] ?? 0) + substitutionCost,
      );
    }
    previous = current;
  }
  return (previous[actual.length] ?? expected.length) / expected.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Median requires at least one value.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function representativeTranscript(runs: readonly BenchmarkRunResult[]): string {
  const counts = new Map<string, number>();
  for (const run of runs) {
    counts.set(
      run.normalizedTranscript,
      (counts.get(run.normalizedTranscript) ?? 0) + 1,
    );
  }
  return [...counts.entries()]
    .sort(
      ([leftText, leftCount], [rightText, rightCount]) =>
        rightCount - leftCount || leftText.localeCompare(rightText),
    )[0]?.[0] ?? "";
}

export function aggregateBenchmarkRuns(
  metadata: Pick<
    BenchmarkModelResult,
    "modelFilename" | "byteLength" | "sha256"
  >,
  runs: readonly BenchmarkRunResult[],
  fixtureDurationSeconds: number,
): BenchmarkModelResult {
  if (runs.length !== benchmarkMeasuredRuns || fixtureDurationSeconds <= 0) {
    throw new Error("Benchmark aggregation requires three runs and a positive duration.");
  }
  const transcript = representativeTranscript(runs);
  const medianWallTimeSeconds = median(
    runs.map((run) => run.wallTimeSeconds),
  );
  return {
    ...metadata,
    measuredRuns: [...runs],
    medianWallTimeSeconds,
    realTimeFactor: medianWallTimeSeconds / fixtureDurationSeconds,
    peakResidentBytes: Math.max(...runs.map((run) => run.peakResidentBytes)),
    normalizedTranscript: transcript,
    wordErrorRate: calculateWordErrorRate(
      benchmarkReferenceSentence,
      transcript,
    ),
  };
}

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function formatAudioBenchmarkReport(
  report: AudioBenchmarkReport,
): string {
  const lines = [
    "# PAIOS fixed-sample local transcription benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    `Platform: ${report.platform} ${report.architecture}`,
    `FFmpeg: ${report.ffmpegVersion}`,
    `whisper.cpp: ${report.whisperVersion}`,
    `Fixture: Samantha voice, ${report.fixture.language}, ${fixed(report.fixture.durationSeconds, 3)} s, ${report.fixture.format}`,
    `Reference: ${report.fixture.referenceSentence}`,
    `Execution: ${report.execution.warmupRuns} warm-up + ${report.execution.measuredRuns} measured sequential runs per model`,
    `Measurement: ${report.execution.measurement}`,
    `Whisper arguments: ${report.execution.whisperArguments.join(" ")}`,
    "",
  ];

  for (const model of report.models) {
    lines.push(
      `## ${model.modelFilename}`,
      "",
      `Bytes: ${model.byteLength}`,
      `SHA-256: ${model.sha256}`,
      `Measured wall times: ${model.measuredRuns
        .map((run) => `${fixed(run.wallTimeSeconds, 3)} s`)
        .join(", ")}`,
      `Median wall time: ${fixed(model.medianWallTimeSeconds, 3)} s`,
      `Real-time factor: ${fixed(model.realTimeFactor, 3)}`,
      `Peak resident memory: ${model.peakResidentBytes} bytes`,
      `Normalized transcript: ${model.normalizedTranscript}`,
      `Word error rate: ${fixed(model.wordErrorRate, 6)}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
