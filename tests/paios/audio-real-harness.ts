import { isAbsolute, join, resolve } from "node:path";

import {
  resolveAudioToolConfiguration,
  type AudioToolConfiguration,
} from "../../src/paios/knowledge/config.js";

export const audioIntegrationOptInEnvironment =
  "PAIOS_RUN_AUDIO_INTEGRATION";
export const audioIntegrationFixtureEnvironment =
  "PAIOS_AUDIO_INTEGRATION_FIXTURE_PATH";
export const audioIntegrationLanguageEnvironment =
  "PAIOS_AUDIO_INTEGRATION_LANGUAGE";
export const audioIntegrationTimeoutEnvironment =
  "PAIOS_AUDIO_INTEGRATION_TIMEOUT_MS";

export interface AudioIntegrationCase {
  name: "wav" | "mp3" | "m4a" | "ogg-opus";
  outputPath: string;
  expectedContainer: "wav" | "mp3" | "mp4" | "ogg";
  expectedCodec: "pcm" | "mp3" | "unknown" | "opus";
  ffmpegArgs: string[];
}

export interface AudioIntegrationConfiguration {
  fixturePath: string;
  language: string;
  timeoutMs: number;
  tools: AudioToolConfiguration;
}

export type AudioIntegrationResolution =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "invalid";
      reason: string;
    }
  | {
      status: "configured";
      configuration: AudioIntegrationConfiguration;
    };

function resolveConfiguredPath(repositoryRoot: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(repositoryRoot, value);
}

export function resolveAudioIntegrationConfiguration(
  repositoryRoot: string,
  environment: Readonly<Record<string, string | undefined>>,
): AudioIntegrationResolution {
  if (environment[audioIntegrationOptInEnvironment]?.trim() !== "1") {
    return {
      status: "skipped",
      reason: `Set ${audioIntegrationOptInEnvironment}=1 to run real audio integration tests.`,
    };
  }

  const fixture = environment[audioIntegrationFixtureEnvironment]?.trim();
  if (fixture === undefined || fixture.length === 0) {
    return {
      status: "skipped",
      reason: `Set ${audioIntegrationFixtureEnvironment} to a local speech-audio fixture.`,
    };
  }
  const tools = resolveAudioToolConfiguration(repositoryRoot, environment);
  if (tools.whisperModelPath === null) {
    return {
      status: "skipped",
      reason:
        "Set PAIOS_WHISPER_MODEL_PATH to a configured local GGML model.",
    };
  }

  const configuredLanguage =
    environment[audioIntegrationLanguageEnvironment]?.trim();
  const language =
    configuredLanguage === undefined || configuredLanguage.length === 0
      ? "auto"
      : configuredLanguage;
  if (!/^(auto|[a-z]{2,3})$/.test(language)) {
    return {
      status: "invalid",
      reason: `${audioIntegrationLanguageEnvironment} must be 'auto' or a two- or three-letter lowercase code.`,
    };
  }

  const configuredTimeout =
    environment[audioIntegrationTimeoutEnvironment]?.trim();
  const timeoutText =
    configuredTimeout === undefined || configuredTimeout.length === 0
      ? "600000"
      : configuredTimeout;
  const timeoutMs = Number(timeoutText);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return {
      status: "invalid",
      reason: `${audioIntegrationTimeoutEnvironment} must be a positive integer.`,
    };
  }

  return {
    status: "configured",
    configuration: {
      fixturePath: resolveConfiguredPath(repositoryRoot, fixture),
      language,
      timeoutMs,
      tools,
    },
  };
}

export function audioIntegrationCases(
  workingRoot: string,
  fixturePath: string,
): AudioIntegrationCase[] {
  const common = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    fixturePath,
    "-vn",
    "-ac",
    "1",
  ];
  const definitions = [
    {
      name: "wav" as const,
      filename: "fixture.wav",
      expectedContainer: "wav" as const,
      expectedCodec: "pcm" as const,
      encoding: ["-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav"],
    },
    {
      name: "mp3" as const,
      filename: "fixture.mp3",
      expectedContainer: "mp3" as const,
      expectedCodec: "mp3" as const,
      encoding: ["-ar", "16000", "-c:a", "libmp3lame", "-f", "mp3"],
    },
    {
      name: "m4a" as const,
      filename: "fixture.m4a",
      expectedContainer: "mp4" as const,
      expectedCodec: "unknown" as const,
      encoding: ["-ar", "16000", "-c:a", "aac", "-f", "ipod"],
    },
    {
      name: "ogg-opus" as const,
      filename: "fixture.ogg",
      expectedContainer: "ogg" as const,
      expectedCodec: "opus" as const,
      encoding: [
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-application",
        "voip",
        "-f",
        "ogg",
      ],
    },
  ];

  return definitions.map((definition) => {
    const outputPath = join(workingRoot, definition.filename);
    return {
      name: definition.name,
      outputPath,
      expectedContainer: definition.expectedContainer,
      expectedCodec: definition.expectedCodec,
      ffmpegArgs: [...common, ...definition.encoding, outputPath],
    };
  });
}
