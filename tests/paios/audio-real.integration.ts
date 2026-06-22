import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import {
  collectAudioDiagnostics,
} from "../../src/paios/knowledge/audio-diagnostics.js";
import { processAudioRecord } from "../../src/paios/knowledge/audio-processing.js";
import {
  addAudio,
  describeAudioMedia,
  searchRecords,
} from "../../src/paios/knowledge/records.js";
import { listProcessingAttempts } from "../../src/paios/knowledge/processing-attempts.js";
import {
  audioIntegrationCases,
  resolveAudioIntegrationConfiguration,
} from "./audio-real-harness.js";

const repositoryRoot = process.cwd();
const resolution = resolveAudioIntegrationConfiguration(
  repositoryRoot,
  process.env,
);

function boundedDiagnostic(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 500
    ? normalized
    : `${normalized.slice(0, 497)}...`;
}

function searchableToken(transcript: string): string {
  return /[\p{L}\p{N}]{3,}/u.exec(transcript)?.[0] ?? "";
}

test(
  "real FFmpeg and whisper-cli process WAV, MP3, M4A, and OGG/Opus",
  {
    skip: resolution.status === "skipped" ? resolution.reason : false,
    timeout:
      resolution.status === "configured"
        ? resolution.configuration.timeoutMs * 4
        : undefined,
  },
  (context) => {
    if (resolution.status === "invalid") {
      assert.fail(resolution.reason);
    }
    if (resolution.status !== "configured") {
      return;
    }

    const { configuration } = resolution;
    const diagnostics = collectAudioDiagnostics(configuration.tools);
    if (
      !diagnostics.ready ||
      diagnostics.whisperCli.version === null ||
      configuration.tools.whisperModelPath === null
    ) {
      context.skip(
        [
          "Real audio dependencies are not ready.",
          `FFmpeg: ${diagnostics.ffmpeg.summary}`,
          `whisper-cli: ${diagnostics.whisperCli.summary}`,
          `model: ${diagnostics.whisperModel.summary}`,
        ].join(" "),
      );
      return;
    }

    let fixtureStats;
    try {
      fixtureStats = statSync(configuration.fixturePath);
      readFileSync(configuration.fixturePath);
    } catch {
      assert.fail(
        `${basename(configuration.fixturePath)} is not a readable local fixture.`,
      );
    }
    assert.equal(
      fixtureStats.isFile() && fixtureStats.size > 0,
      true,
      `${basename(configuration.fixturePath)} must be a non-empty file.`,
    );

    const root = mkdtempSync(join(tmpdir(), "paios-audio-integration-"));
    const fixtureRoot = join(root, "fixtures");
    const dataRoot = join(root, "knowledge");
    const temporaryRoot = join(root, "temporary");
    try {
      mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
      for (const item of audioIntegrationCases(
        fixtureRoot,
        configuration.fixturePath,
      )) {
        const startedAt = performance.now();
        const generated = spawnSync(
          configuration.tools.ffmpeg.command,
          item.ffmpegArgs,
          {
            encoding: "utf8",
            shell: false,
            timeout: configuration.timeoutMs,
          },
        );
        assert.equal(
          generated.status,
          0,
          `${item.name} fixture generation failed: ${boundedDiagnostic(
            generated.stderr,
          )}`,
        );

        const descriptor = describeAudioMedia(readFileSync(item.outputPath), {
          sourceKind: "local-file",
          originalName: basename(item.outputPath),
        });
        assert.equal(descriptor.detectedContainer, item.expectedContainer);
        assert.equal(descriptor.detectedCodec, item.expectedCodec);

        const record = addAudio(dataRoot, item.outputPath);
        const result = processAudioRecord(dataRoot, record.id, {
          normalizer: {
            ffmpegCommand: configuration.tools.ffmpeg.command,
            temporaryRoot,
            timeoutMs: configuration.timeoutMs,
          },
          transcriber: {
            whisperCommand: configuration.tools.whisperCli.command,
            whisperVersion: diagnostics.whisperCli.version,
            modelPath: configuration.tools.whisperModelPath,
            temporaryRoot,
            language: configuration.language,
            timeoutMs: configuration.timeoutMs,
          },
        });
        assert.equal(
          result.status,
          "succeeded",
          `${item.name} processing failed: ${result.record.error ?? "unknown error"}`,
        );
        assert.equal(result.record.state, "ready");
        assert.notEqual(result.record.normalizedText.trim(), "");
        assert.equal(result.record.sourceReference.startsWith("sources/audio/"), true);

        const attempts = listProcessingAttempts(dataRoot, record.id);
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0]?.status, "succeeded");
        assert.equal(
          attempts[0]?.implementationVersion,
          diagnostics.whisperCli.version,
        );

        const token = searchableToken(result.record.normalizedText);
        assert.notEqual(
          token,
          "",
          `${item.name} transcript must contain a searchable token.`,
        );
        assert.equal(
          searchRecords(dataRoot, token).some(
            (match) => match.recordId === record.id,
          ),
          true,
          `${item.name} transcript was not linked into search.`,
        );
        context.diagnostic(
          `${item.name}: passed (${Math.round(performance.now() - startedAt)} ms)`,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
