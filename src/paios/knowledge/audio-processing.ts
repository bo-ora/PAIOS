import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

import type {
  KnowledgeRecord,
  MediaDescriptor,
  ProcessingAttempt,
} from "../types.js";
import {
  type AudioNormalizerOptions,
  withNormalizedAudio,
} from "./audio-normalizer.js";
import {
  AudioTranscriptionError,
  type AudioTranscriberOptions,
  inspectWhisperModel,
  transcribeNormalizedAudio,
} from "./audio-transcriber.js";
import {
  completeAudioProcessing,
} from "./processing-attempts.js";
import { getRecord } from "./records.js";

export interface AudioProcessingOptions {
  normalizer: AudioNormalizerOptions;
  transcriber: AudioTranscriberOptions;
  now?: () => Date;
}

export type AudioProcessingResult =
  | {
      status: "already-ready";
      record: KnowledgeRecord;
      attempt: null;
    }
  | {
      status: "succeeded" | "failed";
      record: KnowledgeRecord;
      attempt: ProcessingAttempt;
    };

function requireAudioRecord(
  dataRoot: string,
  recordId: string,
): KnowledgeRecord {
  const record = getRecord(dataRoot, recordId);
  if (record?.sourceType !== "audio") {
    throw new Error("Audio processing requires an existing audio record.");
  }
  return record;
}

function mediaDescriptor(record: KnowledgeRecord): MediaDescriptor {
  const {
    originalName,
    claimedMimeType,
    detectedMediaType,
    detectedContainer,
    detectedCodec,
    byteLength,
    checksum,
  } = record.provenance;
  if (
    detectedMediaType === undefined ||
    detectedContainer === undefined ||
    detectedCodec === undefined
  ) {
    throw new Error("Audio record is missing detected media metadata.");
  }
  return {
    sourceKind: "local-file",
    ...(originalName === undefined ? {} : { originalName }),
    ...(claimedMimeType === undefined ? {} : { claimedMimeType }),
    detectedMediaType,
    detectedContainer,
    detectedCodec,
    byteLength,
    checksum,
  };
}

function completedRecord(dataRoot: string, recordId: string): KnowledgeRecord {
  const record = getRecord(dataRoot, recordId);
  if (record === null) {
    throw new Error("Processed audio record could not be read.");
  }
  return record;
}

function readManagedAudio(dataRoot: string, record: KnowledgeRecord): Buffer {
  const resolvedRoot = resolve(dataRoot);
  const sourcePath = resolve(resolvedRoot, record.sourceReference);
  if (!sourcePath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("Managed audio source reference is invalid.");
  }
  try {
    return readFileSync(sourcePath);
  } catch {
    throw new Error("Managed audio source could not be read.");
  }
}

export function processAudioRecord(
  dataRoot: string,
  recordId: string,
  options: AudioProcessingOptions,
): AudioProcessingResult {
  const record = requireAudioRecord(dataRoot, recordId);
  if (record.state === "ready") {
    return { status: "already-ready", record, attempt: null };
  }

  const model = inspectWhisperModel(options.transcriber.modelPath);
  const language = options.transcriber.language?.trim() ?? "auto";
  if (
    options.transcriber.whisperVersion.trim().length === 0 ||
    !/^(auto|[a-z]{2,3})$/.test(language)
  ) {
    throw new Error("Invalid audio transcription configuration.");
  }
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();

  try {
    const bytes = readManagedAudio(dataRoot, record);
    const transcription = withNormalizedAudio(
      { bytes, descriptor: mediaDescriptor(record) },
      options.normalizer,
      (normalizedPath) =>
        transcribeNormalizedAudio(normalizedPath, options.transcriber),
    );
    const completedAt = now().toISOString();
    const attempt = completeAudioProcessing(dataRoot, {
      recordId,
      implementationVersion: transcription.implementationVersion,
      modelFilename: transcription.modelFilename,
      modelChecksum: transcription.modelChecksum,
      language: transcription.language,
      startedAt,
      completedAt,
      status: "succeeded",
      exitStatus: transcription.exitStatus,
      diagnostic: null,
      transcript: transcription.transcript,
    });
    return {
      status: "succeeded",
      record: completedRecord(dataRoot, recordId),
      attempt,
    };
  } catch (error) {
    const completedAt = now().toISOString();
    const message =
      error instanceof Error
        ? error.message
        : "Local audio processing failed.";
    const attempt = completeAudioProcessing(dataRoot, {
      recordId,
      implementationVersion: options.transcriber.whisperVersion.trim(),
      modelFilename: model.modelFilename,
      modelChecksum: model.modelChecksum,
      language,
      startedAt,
      completedAt,
      status: "failed",
      exitStatus:
        error instanceof AudioTranscriptionError ? error.exitStatus : null,
      diagnostic: message,
      transcript: null,
      errorMessage: message,
    });
    return {
      status: "failed",
      record: completedRecord(dataRoot, recordId),
      attempt,
    };
  }
}
