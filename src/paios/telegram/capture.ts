import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  addAudio,
  addFile,
  addNote,
  DuplicateKnowledgeError,
  KnowledgeInputError,
  type CaptureProvenance,
} from "../knowledge/records.js";
import {
  processAudioRecord,
  type AudioProcessingOptions,
} from "../knowledge/audio-processing.js";
import type { InboundMessage, MessagingProvider } from "./messaging.js";

/**
 * Telegram capture orchestration (ADR-0005). Routes an inbound message to the
 * matching Phase 1 capture function with Telegram provenance attached. Success
 * is reported only after the durable record is committed; failures and refusals
 * are reported with a reason and never reported as success.
 */

export type CaptureStatus = "captured" | "duplicate" | "refused" | "failed";

export interface CaptureResult {
  status: CaptureStatus;
  recordId?: string;
  message: string;
}

export interface CaptureDeps {
  dataRoot: string;
  tempRoot: string;
  provider: Pick<MessagingProvider, "downloadAttachment">;
  audio?: AudioProcessingOptions;
}

export function captureProvenanceFor(
  message: InboundMessage,
  adapter: string,
): CaptureProvenance {
  return {
    adapter,
    externalReference: {
      channel: "telegram",
      chatId: message.workspace.chatId,
      ...(message.workspace.threadId === undefined
        ? {}
        : { threadId: message.workspace.threadId }),
      messageId: message.messageId,
    },
  };
}

function safeName(name: string | undefined, fallback: string): string {
  if (name === undefined) {
    return fallback;
  }
  const cleaned = basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length === 0 ? fallback : cleaned;
}

export async function captureMessage(
  message: InboundMessage,
  deps: CaptureDeps,
): Promise<CaptureResult> {
  try {
    if (message.kind === "text") {
      const content = message.text ?? "";
      if (content.trim().length === 0) {
        return { status: "refused", message: "Empty message; nothing to capture." };
      }
      const record = addNote(
        deps.dataRoot,
        { content },
        captureProvenanceFor(message, "telegram-note"),
      );
      return {
        status: "captured",
        recordId: record.id,
        message: `Captured note ${record.id}.`,
      };
    }

    if (message.kind === "document") {
      return await captureDownloaded(message, deps, "telegram-document");
    }

    if (message.kind === "voice" || message.kind === "audio") {
      return await captureDownloaded(message, deps, "telegram-audio");
    }

    return {
      status: "refused",
      message: "Unsupported message type; send text, a voice note, or a .md/.txt document.",
    };
  } catch (error) {
    if (error instanceof DuplicateKnowledgeError) {
      return {
        status: "duplicate",
        recordId: error.existingRecordId,
        message: `Already captured as ${error.existingRecordId}.`,
      };
    }
    if (error instanceof KnowledgeInputError) {
      return { status: "refused", message: error.message };
    }
    return {
      status: "failed",
      message: "Capture failed; the message was not stored. Please try again.",
    };
  }
}

async function captureDownloaded(
  message: InboundMessage,
  deps: CaptureDeps,
  adapter: "telegram-document" | "telegram-audio",
): Promise<CaptureResult> {
  const attachment = message.attachment;
  if (attachment === undefined) {
    return { status: "refused", message: "No attachment to capture." };
  }
  const bytes = await deps.provider.downloadAttachment(attachment);
  mkdirSync(deps.tempRoot, { recursive: true });
  const fallback = adapter === "telegram-audio" ? "voice.ogg" : "document.bin";
  const tempPath = join(
    deps.tempRoot,
    `${message.messageId}-${safeName(attachment.originalName, fallback)}`,
  );
  writeFileSync(tempPath, bytes);
  try {
    const provenance = captureProvenanceFor(message, adapter);
    if (adapter === "telegram-document") {
      const record = addFile(deps.dataRoot, tempPath, provenance);
      return {
        status: "captured",
        recordId: record.id,
        message: `Captured document ${record.id}.`,
      };
    }
    const record = addAudio(deps.dataRoot, tempPath, provenance);
    if (deps.audio === undefined) {
      return {
        status: "captured",
        recordId: record.id,
        message: `Captured audio ${record.id}; transcription pending.`,
      };
    }
    const processed = processAudioRecord(deps.dataRoot, record.id, deps.audio);
    return {
      status: processed.record.state === "failed" ? "failed" : "captured",
      recordId: record.id,
      message:
        processed.record.state === "ready"
          ? `Captured and transcribed audio ${record.id}.`
          : `Captured audio ${record.id}; transcription ${processed.record.state}.`,
    };
  } finally {
    rmSync(tempPath, { force: true });
  }
}
