import * as assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import {
  audioIntegrationCases,
  audioIntegrationFixtureEnvironment,
  audioIntegrationLanguageEnvironment,
  audioIntegrationOptInEnvironment,
  audioIntegrationTimeoutEnvironment,
  resolveAudioIntegrationConfiguration,
} from "./audio-real-harness.js";

test("real audio harness is disabled unless explicitly opted in", () => {
  assert.deepEqual(resolveAudioIntegrationConfiguration("/repo", {}), {
    status: "skipped",
    reason:
      "Set PAIOS_RUN_AUDIO_INTEGRATION=1 to run real audio integration tests.",
  });
});

test("real audio harness skips clearly when required local configuration is absent", () => {
  assert.deepEqual(
    resolveAudioIntegrationConfiguration("/repo", {
      [audioIntegrationOptInEnvironment]: "1",
    }),
    {
      status: "skipped",
      reason:
        "Set PAIOS_AUDIO_INTEGRATION_FIXTURE_PATH to a local speech-audio fixture.",
    },
  );
  assert.deepEqual(
    resolveAudioIntegrationConfiguration("/repo", {
      [audioIntegrationOptInEnvironment]: "1",
      [audioIntegrationFixtureEnvironment]: "fixtures/speech.wav",
    }),
    {
      status: "skipped",
      reason:
        "Set PAIOS_WHISPER_MODEL_PATH to a configured local GGML model.",
    },
  );
});

test("real audio harness rejects invalid language and timeout configuration", () => {
  const configured = {
    [audioIntegrationOptInEnvironment]: "1",
    [audioIntegrationFixtureEnvironment]: "fixtures/speech.wav",
    PAIOS_WHISPER_MODEL_PATH: "models/ggml-base.bin",
  };
  assert.deepEqual(
    resolveAudioIntegrationConfiguration("/repo", {
      ...configured,
      [audioIntegrationLanguageEnvironment]: "EN-us",
    }),
    {
      status: "invalid",
      reason:
        "PAIOS_AUDIO_INTEGRATION_LANGUAGE must be 'auto' or a two- or three-letter lowercase code.",
    },
  );
  assert.deepEqual(
    resolveAudioIntegrationConfiguration("/repo", {
      ...configured,
      [audioIntegrationTimeoutEnvironment]: "0",
    }),
    {
      status: "invalid",
      reason:
        "PAIOS_AUDIO_INTEGRATION_TIMEOUT_MS must be a positive integer.",
    },
  );
});

test("real audio harness resolves existing tool configuration and all format cases", () => {
  const resolution = resolveAudioIntegrationConfiguration("/repo", {
    [audioIntegrationOptInEnvironment]: "1",
    [audioIntegrationFixtureEnvironment]: "fixtures/speech.wav",
    [audioIntegrationLanguageEnvironment]: "uk",
    [audioIntegrationTimeoutEnvironment]: "900000",
    PAIOS_FFMPEG_PATH: "tools/ffmpeg",
    PAIOS_WHISPER_CLI_PATH: "tools/whisper-cli",
    PAIOS_WHISPER_MODEL_PATH: "models/ggml-base.bin",
  });
  assert.equal(resolution.status, "configured");
  if (resolution.status !== "configured") {
    return;
  }
  assert.deepEqual(resolution.configuration, {
    fixturePath: "/repo/fixtures/speech.wav",
    language: "uk",
    timeoutMs: 900_000,
    tools: {
      ffmpeg: { command: "/repo/tools/ffmpeg", source: "configured" },
      whisperCli: {
        command: "/repo/tools/whisper-cli",
        source: "configured",
      },
      whisperModelPath: "/repo/models/ggml-base.bin",
    },
  });

  const cases = audioIntegrationCases(
    "/temporary/audio",
    resolution.configuration.fixturePath,
  );
  assert.deepEqual(
    cases.map((item) => [
      item.name,
      item.expectedContainer,
      item.expectedCodec,
      item.outputPath,
    ]),
    [
      ["wav", "wav", "pcm", "/temporary/audio/fixture.wav"],
      ["mp3", "mp3", "mp3", "/temporary/audio/fixture.mp3"],
      ["m4a", "mp4", "unknown", "/temporary/audio/fixture.m4a"],
      ["ogg-opus", "ogg", "opus", "/temporary/audio/fixture.ogg"],
    ],
  );
  assert.deepEqual(cases[0]?.ffmpegArgs.slice(-7), [
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    join("/temporary/audio", "fixture.wav"),
  ]);
  assert.deepEqual(cases[3]?.ffmpegArgs.slice(-9), [
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-application",
    "voip",
    "-f",
    "ogg",
    join("/temporary/audio", "fixture.ogg"),
  ]);
});
