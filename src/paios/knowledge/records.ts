import { createHash, randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import type { KnowledgeRecord } from "../types.js";
import { openKnowledgeDatabase } from "./database.js";
import { writeManagedSource } from "./source-files.js";

interface RecordRow {
  id: string;
  source_type: KnowledgeRecord["sourceType"];
  title: string | null;
  source_reference: string;
  captured_at: string;
  state: KnowledgeRecord["state"];
  normalized_text: string;
  source_adapter: string;
  external_reference_json: string | null;
  original_name: string | null;
  claimed_mime_type: string | null;
  detected_media_type: string | null;
  byte_length: number;
  checksum: string;
  error_message: string | null;
}

export class DuplicateKnowledgeError extends Error {
  constructor(readonly existingRecordId: string) {
    super(`Duplicate knowledge record: ${existingRecordId}`);
  }
}

function checksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeText(content: string): string {
  return content.replace(/\r\n?/g, "\n").normalize("NFC");
}

function parseExternalReference(
  value: string | null,
): Record<string, string> | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid stored external reference.");
  }
  return parsed as Record<string, string>;
}

function rowToRecord(row: RecordRow): KnowledgeRecord {
  const externalReference = parseExternalReference(row.external_reference_json);
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    sourceReference: row.source_reference,
    capturedAt: row.captured_at,
    state: row.state,
    normalizedText: row.normalized_text,
    provenance: {
      adapter: row.source_adapter,
      ...(externalReference === undefined ? {} : { externalReference }),
      ...(row.original_name === null ? {} : { originalName: row.original_name }),
      ...(row.claimed_mime_type === null
        ? {}
        : { claimedMimeType: row.claimed_mime_type }),
      ...(row.detected_media_type === null
        ? {}
        : { detectedMediaType: row.detected_media_type }),
      byteLength: row.byte_length,
      checksum: row.checksum,
    },
    error: row.error_message,
  };
}

function selectById(database: DatabaseSync, id: string): RecordRow | undefined {
  return database
    .prepare(`
      SELECT id, source_type, title, source_reference, captured_at, state,
             normalized_text, source_adapter, external_reference_json,
             original_name, claimed_mime_type, detected_media_type, byte_length,
             checksum, error_message
      FROM records
      WHERE id = ?
    `)
    .get(id) as RecordRow | undefined;
}

function selectByChecksum(
  database: DatabaseSync,
  value: string,
): RecordRow | undefined {
  return database
    .prepare(`
      SELECT id, source_type, title, source_reference, captured_at, state,
             normalized_text, source_adapter, external_reference_json,
             original_name, claimed_mime_type, detected_media_type, byte_length,
             checksum, error_message
      FROM records
      WHERE checksum = ?
    `)
    .get(value) as RecordRow | undefined;
}

export interface AddNoteInput {
  content: string;
  title?: string;
}

export function addNote(dataRoot: string, input: AddNoteInput): KnowledgeRecord {
  const normalizedText = normalizeText(input.content);
  if (normalizedText.trim().length === 0) {
    throw new Error("Note content must not be empty.");
  }
  const title = input.title?.trim();
  if (input.title !== undefined && title?.length === 0) {
    throw new Error("Note title must not be empty.");
  }

  const contentChecksum = checksum(input.content);
  const bytes = Buffer.byteLength(input.content, "utf8");
  const connection = openKnowledgeDatabase(dataRoot);

  try {
    const existing = selectByChecksum(connection.database, contentChecksum);
    if (existing?.state === "ready") {
      throw new DuplicateKnowledgeError(existing.id);
    }

    const id = existing?.id ?? randomUUID();
    const sourceReference =
      existing?.source_reference ?? `sources/notes/${id}.txt`;
    if (existing === undefined) {
      connection.database.exec("BEGIN IMMEDIATE");
      try {
        connection.database
          .prepare(`
            INSERT INTO records (
              id, source_type, title, source_reference, captured_at, state,
              normalized_text, source_adapter, byte_length, checksum
            ) VALUES (?, 'note', ?, ?, ?, 'pending', ?, 'cli-note', ?, ?)
          `)
          .run(
            id,
            title ?? null,
            sourceReference,
            new Date().toISOString(),
            normalizedText,
            bytes,
            contentChecksum,
          );
        connection.database.exec("COMMIT");
      } catch (error) {
        connection.database.exec("ROLLBACK");
        throw error;
      }
    } else {
      connection.database
        .prepare(
          "UPDATE records SET state = 'pending', error_message = NULL WHERE id = ?",
        )
        .run(id);
    }

    try {
      writeManagedSource(dataRoot, sourceReference, input.content);
    } catch (error) {
      connection.database
        .prepare(
          "UPDATE records SET state = 'failed', error_message = ? WHERE id = ?",
        )
        .run("Managed source write failed.", id);
      throw error;
    }

    connection.database
      .prepare(
        "UPDATE records SET state = 'ready', error_message = NULL WHERE id = ?",
      )
      .run(id);
    const record = selectById(connection.database, id);
    if (record === undefined) {
      throw new Error("Captured record could not be read.");
    }
    return rowToRecord(record);
  } finally {
    connection.close();
  }
}

export function getRecord(
  dataRoot: string,
  id: string,
): KnowledgeRecord | null {
  const connection = openKnowledgeDatabase(dataRoot);
  try {
    const row = selectById(connection.database, id);
    return row === undefined ? null : rowToRecord(row);
  } finally {
    connection.close();
  }
}
