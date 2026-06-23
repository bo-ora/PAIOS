import * as assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateBenchmarkRuns,
  audioBenchmarkOptInEnvironment,
  audioBenchmarkRootEnvironment,
  audioBenchmarkTimeoutEnvironment,
  benchmarkModelRevision,
  benchmarkModels,
  benchmarkReferenceSentence,
  calculateWordErrorRate,
  formatAudioBenchmarkReport,
  median,
  normalizeBenchmarkTranscript,
  resolveAudioBenchmarkConfiguration,
  type AudioBenchmarkReport,
} from "./audio-benchmark-harness.js";

test("audio benchmark is separately opt-in and validates configuration", () => {
  assert.deepEqual(resolveAudioBenchmarkConfiguration("/repo", {}), {
    status: "skipped",
    reason:
      "Set PAIOS_RUN_AUDIO_BENCHMARK=1 to run the local audio benchmark.",
  });
  assert.deepEqual(
    resolveAudioBenchmarkConfiguration("/repo", {
      [audioBenchmarkOptInEnvironment]: "1",
      [audioBenchmarkTimeoutEnvironment]: "0",
    }),
    {
      status: "invalid",
      reason: "PAIOS_AUDIO_BENCHMARK_TIMEOUT_MS must be a positive integer.",
    },
  );
  assert.deepEqual(
    resolveAudioBenchmarkConfiguration("/repo", {
      [audioBenchmarkOptInEnvironment]: "1",
      [audioBenchmarkTimeoutEnvironment]: "900000",
      [audioBenchmarkRootEnvironment]: ".local/custom-benchmark",
    }),
    {
      status: "configured",
      configuration: {
        benchmarkRoot: "/repo/.local/custom-benchmark",
        timeoutMs: 900_000,
      },
    },
  );
  assert.deepEqual(
    benchmarkModels.map((model) => model.filename),
    ["ggml-tiny.bin", "ggml-base.bin", "ggml-small.bin"],
  );
  assert.equal(
    benchmarkModels.every((model) =>
      model.downloadUrl.startsWith(
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/${benchmarkModelRevision}/`,
      ),
    ),
    true,
  );
  assert.deepEqual(
    benchmarkModels.map((model) => [model.byteLength, model.sha256]),
    [
      [
        77_691_713,
        "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
      ],
      [
        147_951_465,
        "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
      ],
      [
        487_601_967,
        "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
      ],
    ],
  );
});

test("transcript normalization is deterministic and punctuation-insensitive", () => {
  assert.equal(
    normalizeBenchmarkTranscript("  SEARCHABLE—Audio\r\nshould remain PRIVATE! "),
    "searchable audio should remain private",
  );
  assert.equal(
    normalizeBenchmarkTranscript("It\u2019s durable."),
    "it s durable",
  );
});

test("word error rate handles exact, substitution, insertion, and deletion", () => {
  assert.equal(calculateWordErrorRate("one two three", "one two three"), 0);
  assert.equal(calculateWordErrorRate("one two three", "one four three"), 1 / 3);
  assert.equal(calculateWordErrorRate("one two three", "one two extra three"), 1 / 3);
  assert.equal(calculateWordErrorRate("one two three", "one three"), 1 / 3);
  assert.equal(calculateWordErrorRate("", ""), 0);
  assert.equal(calculateWordErrorRate("", "unexpected"), 1);
});

test("benchmark aggregation uses median time, maximum peak RSS, and majority transcript", () => {
  const result = aggregateBenchmarkRuns(
    {
      modelFilename: "ggml-base.bin",
      byteLength: 123,
      sha256: "a".repeat(64),
    },
    [
      {
        wallTimeSeconds: 3,
        peakResidentBytes: 100,
        normalizedTranscript: "majority transcript",
        wordErrorRate: 0.5,
      },
      {
        wallTimeSeconds: 1,
        peakResidentBytes: 300,
        normalizedTranscript: "minority transcript",
        wordErrorRate: 0.75,
      },
      {
        wallTimeSeconds: 2,
        peakResidentBytes: 200,
        normalizedTranscript: "majority transcript",
        wordErrorRate: 0.5,
      },
    ],
    4,
  );
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(result.medianWallTimeSeconds, 2);
  assert.equal(result.realTimeFactor, 0.5);
  assert.equal(result.peakResidentBytes, 300);
  assert.equal(result.normalizedTranscript, "majority transcript");
  assert.equal(
    result.wordErrorRate,
    calculateWordErrorRate(
      benchmarkReferenceSentence,
      "majority transcript",
    ),
  );
});

test("benchmark reporting includes exact configuration and aggregate evidence", () => {
  const report: AudioBenchmarkReport = {
    generatedAt: "2026-06-23T12:00:00.000Z",
    platform: "darwin",
    architecture: "x64",
    ffmpegVersion: "ffmpeg version 8.1.2",
    whisperVersion: "whisper.cpp version: 1.9.1",
    fixture: {
      voice: "Samantha",
      language: "en",
      durationSeconds: 8.104,
      format: "16 kHz mono signed 16-bit PCM WAV",
      referenceSentence: benchmarkReferenceSentence,
    },
    execution: {
      warmupRuns: 1,
      measuredRuns: 3,
      sequential: true,
      whisperArguments: [
        "-m",
        "<model>",
        "-f",
        "<fixture>",
        "-l",
        "en",
        "-otxt",
        "-of",
        "<output>",
        "-np",
        "-nt",
      ],
      measurement:
        "Node monotonic wall clock and /usr/bin/time -l maximum resident set size",
    },
    models: [
      {
        modelFilename: "ggml-tiny.bin",
        byteLength: 75,
        sha256: "b".repeat(64),
        measuredRuns: [
          {
            wallTimeSeconds: 1,
            peakResidentBytes: 2,
            normalizedTranscript: "sample",
            wordErrorRate: 0.5,
          },
          {
            wallTimeSeconds: 2,
            peakResidentBytes: 3,
            normalizedTranscript: "sample",
            wordErrorRate: 0.5,
          },
          {
            wallTimeSeconds: 3,
            peakResidentBytes: 4,
            normalizedTranscript: "sample",
            wordErrorRate: 0.5,
          },
        ],
        medianWallTimeSeconds: 2,
        realTimeFactor: 0.247,
        peakResidentBytes: 4,
        normalizedTranscript: "sample",
        wordErrorRate: 0.5,
      },
    ],
  };
  const output = formatAudioBenchmarkReport(report);
  assert.match(output, /FFmpeg: ffmpeg version 8\.1\.2/);
  assert.match(output, /Measured wall times: 1\.000 s, 2\.000 s, 3\.000 s/);
  assert.match(output, /Peak resident memory: 4 bytes/);
  assert.match(output, /Word error rate: 0\.500000/);
});
