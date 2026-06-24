import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import type {
  KnowledgeRecord,
  KnowledgeSearchResult,
  KnowledgeSourceType,
  MediaDescriptor,
} from "../types.js";
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
  detected_container: string | null;
  detected_codec: string | null;
  byte_length: number;
  checksum: string;
  error_message: string | null;
}

export class DuplicateKnowledgeError extends Error {
  constructor(readonly existingRecordId: string) {
    super(`Duplicate knowledge record: ${existingRecordId}`);
  }
}

function checksum(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeText(content: string): string {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");
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
      ...(row.detected_container === null
        ? {}
        : { detectedContainer: row.detected_container }),
      ...(row.detected_codec === null
        ? {}
        : { detectedCodec: row.detected_codec }),
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
             detected_container, detected_codec, checksum, error_message
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
             detected_container, detected_codec, checksum, error_message
      FROM records
      WHERE checksum = ?
    `)
    .get(value) as RecordRow | undefined;
}

export interface AddNoteInput {
  content: string;
  title?: string;
}

export interface CaptureProvenance {
  adapter: string;
  externalReference?: Record<string, string>;
}

interface CaptureManagedInput {
  sourceType: Extract<KnowledgeSourceType, "note" | "managed-file" | "audio">;
  title: string | null;
  normalizedText: string;
  sourceAdapter: string;
  sourceDirectory: string;
  sourceExtension: string;
  sourceBytes: Uint8Array;
  originalName: string | null;
  claimedMimeType: string | null;
  detectedMediaType: string | null;
  detectedContainer?: string;
  detectedCodec?: string;
  sourceExternalReference?: Record<string, string>;
  finalState?: Extract<KnowledgeRecord["state"], "pending" | "ready">;
}

function applyProvenance(
  input: CaptureManagedInput,
  provenance: CaptureProvenance | undefined,
): CaptureManagedInput {
  if (provenance === undefined) {
    return input;
  }
  return {
    ...input,
    sourceAdapter: provenance.adapter,
    ...(provenance.externalReference === undefined
      ? {}
      : { sourceExternalReference: provenance.externalReference }),
  };
}

function captureManagedSource(
  dataRoot: string,
  input: CaptureManagedInput,
): KnowledgeRecord {
  const contentChecksum = checksum(input.sourceBytes);
  const connection = openKnowledgeDatabase(dataRoot);

  try {
    const existing = selectByChecksum(connection.database, contentChecksum);
    if (existing?.state === "ready") {
      throw new DuplicateKnowledgeError(existing.id);
    }
    if (
      existing !== undefined &&
      (existing.source_adapter !== input.sourceAdapter ||
        existing.source_type !== input.sourceType)
    ) {
      throw new DuplicateKnowledgeError(existing.id);
    }

    const id = existing?.id ?? randomUUID();
    const sourceReference =
      existing?.source_reference ??
      `sources/${input.sourceDirectory}/${id}${input.sourceExtension}`;
    if (existing === undefined) {
      connection.database.exec("BEGIN IMMEDIATE");
      try {
        connection.database
          .prepare(`
            INSERT INTO records (
              id, source_type, title, source_reference, captured_at, state,
              normalized_text, source_adapter, external_reference_json,
              original_name, claimed_mime_type, detected_media_type,
              detected_container, detected_codec, byte_length, checksum
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            id,
            input.sourceType,
            input.title,
            sourceReference,
            new Date().toISOString(),
            input.normalizedText,
            input.sourceAdapter,
            input.sourceExternalReference === undefined
              ? null
              : JSON.stringify(input.sourceExternalReference),
            input.originalName,
            input.claimedMimeType,
            input.detectedMediaType,
            input.detectedContainer ?? null,
            input.detectedCodec ?? null,
            input.sourceBytes.byteLength,
            contentChecksum,
          );
        connection.database.exec("COMMIT");
      } catch (error) {
        connection.database.exec("ROLLBACK");
        throw error;
      }
    } else {
      connection.database
        .prepare(`
          UPDATE records
          SET title = ?,
              normalized_text = ?,
              external_reference_json = ?,
              original_name = ?,
              claimed_mime_type = ?,
              detected_media_type = ?,
              detected_container = ?,
              detected_codec = ?,
              byte_length = ?,
              state = 'pending',
              error_message = NULL
          WHERE id = ?
        `)
        .run(
          input.title,
          input.normalizedText,
          input.sourceExternalReference === undefined
            ? null
            : JSON.stringify(input.sourceExternalReference),
          input.originalName,
          input.claimedMimeType,
          input.detectedMediaType,
          input.detectedContainer ?? null,
          input.detectedCodec ?? null,
          input.sourceBytes.byteLength,
          id,
        );
    }

    try {
      writeManagedSource(dataRoot, sourceReference, input.sourceBytes);
    } catch (error) {
      connection.database
        .prepare(
          "UPDATE records SET state = 'failed', error_message = ? WHERE id = ?",
        )
        .run("Managed source write failed.", id);
      throw error;
    }

    connection.database
      .prepare("UPDATE records SET state = ?, error_message = NULL WHERE id = ?")
      .run(input.finalState ?? "ready", id);
    const record = selectById(connection.database, id);
    if (record === undefined) {
      throw new Error("Captured record could not be read.");
    }
    return rowToRecord(record);
  } finally {
    connection.close();
  }
}

export function addNote(
  dataRoot: string,
  input: AddNoteInput,
  provenance?: CaptureProvenance,
): KnowledgeRecord {
  const normalizedText = normalizeText(input.content);
  if (normalizedText.trim().length === 0) {
    throw new Error("Note content must not be empty.");
  }
  const title = input.title?.trim();
  if (input.title !== undefined && title?.length === 0) {
    throw new Error("Note title must not be empty.");
  }

  return captureManagedSource(
    dataRoot,
    applyProvenance(
      {
        sourceType: "note",
        title: title ?? null,
        normalizedText,
        sourceAdapter: "cli-note",
        sourceDirectory: "notes",
        sourceExtension: ".txt",
        sourceBytes: Buffer.from(input.content, "utf8"),
        originalName: null,
        claimedMimeType: "text/plain; charset=utf-8",
        detectedMediaType: "text/plain; charset=utf-8",
      },
      provenance,
    ),
  );
}

const supportedDocumentTypes = new Map([
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

export class KnowledgeInputError extends Error {}

const audioMimeHints = new Map([
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
]);

function bytesEqualAt(
  bytes: Uint8Array,
  offset: number,
  expected: string,
): boolean {
  if (offset + expected.length > bytes.byteLength) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

function detectWavCodec(bytes: Uint8Array): string {
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength =
      (bytes[offset + 4] ?? 0) |
      ((bytes[offset + 5] ?? 0) << 8) |
      ((bytes[offset + 6] ?? 0) << 16) |
      ((bytes[offset + 7] ?? 0) << 24);
    if (bytesEqualAt(bytes, offset, "fmt ") && chunkLength >= 2) {
      const format = (bytes[offset + 8] ?? 0) | ((bytes[offset + 9] ?? 0) << 8);
      return format === 1 ? "pcm" : format === 3 ? "pcm-float" : `wav-${format}`;
    }
    offset += 8 + chunkLength + (chunkLength % 2);
  }
  return "unknown";
}

export function describeAudioMedia(
  bytes: Uint8Array,
  input: {
    sourceKind: MediaDescriptor["sourceKind"];
    originalName?: string;
    claimedMimeType?: string;
  },
): MediaDescriptor {
  let detectedMediaType: string;
  let detectedContainer: string;
  let detectedCodec: string;

  if (
    bytesEqualAt(bytes, 0, "RIFF") &&
    bytesEqualAt(bytes, 8, "WAVE")
  ) {
    detectedMediaType = "audio/wav";
    detectedContainer = "wav";
    detectedCodec = detectWavCodec(bytes);
  } else if (
    bytesEqualAt(bytes, 0, "ID3") ||
    (bytes.byteLength >= 2 &&
      bytes[0] === 0xff &&
      ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    detectedMediaType = "audio/mpeg";
    detectedContainer = "mp3";
    detectedCodec = "mp3";
  } else if (bytesEqualAt(bytes, 4, "ftyp")) {
    detectedMediaType = "audio/mp4";
    detectedContainer = "mp4";
    detectedCodec = "unknown";
  } else if (
    bytesEqualAt(bytes, 0, "OggS") &&
    bytesEqualAt(bytes, 28, "OpusHead")
  ) {
    detectedMediaType = "audio/ogg";
    detectedContainer = "ogg";
    detectedCodec = "opus";
  } else {
    throw new KnowledgeInputError(
      "Unsupported or unrecognized audio content; use WAV, MP3, or M4A.",
    );
  }

  return {
    sourceKind: input.sourceKind,
    ...(input.originalName === undefined
      ? {}
      : { originalName: input.originalName }),
    ...(input.claimedMimeType === undefined
      ? {}
      : { claimedMimeType: input.claimedMimeType }),
    detectedMediaType,
    detectedContainer,
    detectedCodec,
    byteLength: bytes.byteLength,
    checksum: checksum(bytes),
  };
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new KnowledgeInputError("Document must contain valid UTF-8 text.");
  }
}

export function addFile(
  dataRoot: string,
  path: string,
  provenance?: CaptureProvenance,
): KnowledgeRecord {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new KnowledgeInputError("Document could not be read.");
  }
  if (!stats.isFile()) {
    throw new KnowledgeInputError("Document path must reference a file.");
  }

  const extension = extname(path).toLowerCase();
  const mediaType = supportedDocumentTypes.get(extension);
  if (mediaType === undefined) {
    throw new KnowledgeInputError(
      "Unsupported document format; use .md or .txt.",
    );
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new KnowledgeInputError("Document could not be read.");
  }
  const normalizedText = normalizeText(decodeUtf8(bytes));
  if (normalizedText.trim().length === 0) {
    throw new KnowledgeInputError("Document content must not be empty.");
  }
  const originalName = basename(path);

  return captureManagedSource(
    dataRoot,
    applyProvenance(
      {
        sourceType: "managed-file",
        title: originalName,
        normalizedText,
        sourceAdapter: "cli-file",
        sourceDirectory: "files",
        sourceExtension: extension,
        sourceBytes: bytes,
        originalName,
        claimedMimeType: mediaType,
        detectedMediaType: mediaType,
      },
      provenance,
    ),
  );
}

export function addAudio(
  dataRoot: string,
  path: string,
  provenance?: CaptureProvenance,
): KnowledgeRecord {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new KnowledgeInputError("Audio could not be read.");
  }
  if (!stats.isFile()) {
    throw new KnowledgeInputError("Audio path must reference a file.");
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new KnowledgeInputError("Audio could not be read.");
  }
  const originalName = basename(path);
  const claimedMimeType = audioMimeHints.get(extname(path).toLowerCase());
  const descriptor = describeAudioMedia(bytes, {
    sourceKind: "local-file",
    originalName,
    ...(claimedMimeType === undefined ? {} : { claimedMimeType }),
  });

  return captureManagedSource(
    dataRoot,
    applyProvenance(
      {
        sourceType: "audio",
        title: originalName,
        normalizedText: "",
        sourceAdapter: "cli-audio",
        sourceDirectory: "audio",
        sourceExtension: `.${descriptor.detectedContainer}`,
        sourceBytes: bytes,
        originalName,
        claimedMimeType: claimedMimeType ?? null,
        detectedMediaType: descriptor.detectedMediaType,
        detectedContainer: descriptor.detectedContainer,
        detectedCodec: descriptor.detectedCodec,
        finalState: "pending",
      },
      provenance,
    ),
  );
}

interface SearchRow {
  id: string;
  title: string | null;
  source_type: KnowledgeSourceType;
  excerpt: string;
  source_reference: string;
  captured_at: string;
  rank: number;
}

export function searchRecords(
  dataRoot: string,
  query: string,
): KnowledgeSearchResult[] {
  if (query.trim().length === 0) {
    throw new KnowledgeInputError("Search query must not be empty.");
  }
  const connection = openKnowledgeDatabase(dataRoot);
  try {
    let rows: SearchRow[];
    try {
      rows = connection.database
        .prepare(`
          SELECT records.id,
                 records.title,
                 records.source_type,
                 snippet(record_search, 1, '[', ']', '…', 24) AS excerpt,
                 records.source_reference,
                 records.captured_at,
                 bm25(record_search, 5.0, 1.0) AS rank
          FROM record_search
          JOIN records ON records.internal_id = record_search.rowid
          WHERE record_search MATCH ? AND records.state = 'ready'
          ORDER BY rank ASC, records.id ASC
        `)
        .all(query) as unknown as SearchRow[];
    } catch {
      throw new KnowledgeInputError("Invalid search query.");
    }
    return rows.map((row, index) => ({
      position: index + 1,
      recordId: row.id,
      title: row.title,
      sourceType: row.source_type,
      excerpt: row.excerpt,
      sourceReference: row.source_reference,
      capturedAt: row.captured_at,
      rank: row.rank,
    }));
  } finally {
    connection.close();
  }
}

export function rebuildSearchIndex(dataRoot: string): number {
  const connection = openKnowledgeDatabase(dataRoot);
  try {
    connection.database.exec("BEGIN IMMEDIATE");
    try {
      connection.database.exec(
        "INSERT INTO record_search(record_search) VALUES ('rebuild');",
      );
      connection.database.exec("COMMIT");
    } catch (error) {
      connection.database.exec("ROLLBACK");
      throw error;
    }
    const row = connection.database
      .prepare("SELECT COUNT(*) AS count FROM records WHERE state = 'ready'")
      .get() as { count: number };
    return row.count;
  } finally {
    connection.close();
  }
}

export interface RecordListItem {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string | null;
  capturedAt: string;
  sourceReference: string;
  state: KnowledgeRecord["state"];
}

export interface RecordListFilter {
  sourceTypes?: KnowledgeSourceType[];
  workspace?: { chatId: string; threadId?: string };
  limit?: number;
}

interface RecordListRow {
  id: string;
  source_type: KnowledgeSourceType;
  title: string | null;
  captured_at: string;
  source_reference: string;
  state: KnowledgeRecord["state"];
}

/**
 * Model-free recency/metadata recall (ADR-0008, Phase 3 A). Returns ready
 * records newest first, optionally filtered by source type and Telegram
 * workspace provenance, bounded by a small limit. Reads existing columns only;
 * no new schema and no model call.
 */
export function listRecords(
  dataRoot: string,
  filter: RecordListFilter = {},
): RecordListItem[] {
  const limit =
    filter.limit !== undefined &&
    Number.isInteger(filter.limit) &&
    filter.limit > 0
      ? Math.min(filter.limit, 100)
      : 20;
  const clauses = ["state = 'ready'"];
  const params: (string | number)[] = [];
  if (filter.sourceTypes !== undefined && filter.sourceTypes.length > 0) {
    clauses.push(
      `source_type IN (${filter.sourceTypes.map(() => "?").join(", ")})`,
    );
    params.push(...filter.sourceTypes);
  }
  if (filter.workspace !== undefined) {
    clauses.push("json_extract(external_reference_json, '$.chatId') = ?");
    params.push(filter.workspace.chatId);
    if (filter.workspace.threadId !== undefined) {
      clauses.push("json_extract(external_reference_json, '$.threadId') = ?");
      params.push(filter.workspace.threadId);
    }
  }
  const connection = openKnowledgeDatabase(dataRoot);
  try {
    const rows = connection.database
      .prepare(`
        SELECT id, source_type, title, captured_at, source_reference, state
        FROM records
        WHERE ${clauses.join(" AND ")}
        ORDER BY captured_at DESC, id ASC
        LIMIT ?
      `)
      .all(...params, limit) as unknown as RecordListRow[];
    return rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      title: row.title,
      capturedAt: row.captured_at,
      sourceReference: row.source_reference,
      state: row.state,
    }));
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
