import { createHash, randomUUID } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import type { RepositoryIndexResult } from "../types.js";
import { openKnowledgeDatabase } from "./database.js";
import { KnowledgeInputError } from "./records.js";

const supportedDocumentTypes = new Map([
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

const missingSourceError = "Indexed source is missing.";
const invalidSourceError = "Indexed source could not be processed.";

interface IndexedRecordRow {
  id: string;
  checksum: string;
  state: "pending" | "ready" | "failed";
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeText(content: string): string {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new KnowledgeInputError("Document must contain valid UTF-8 text.");
  }
}

function canonicalDirectory(path: string): string {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    throw new KnowledgeInputError("Index path could not be read.");
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new KnowledgeInputError("Index path must reference a directory.");
  }
  try {
    return realpathSync(resolve(path));
  } catch {
    throw new KnowledgeInputError("Index path could not be read.");
  }
}

function selectIndexedRecord(
  database: DatabaseSync,
  sourceReference: string,
): IndexedRecordRow | undefined {
  return database
    .prepare(`
      SELECT id, checksum, state
      FROM records
      WHERE source_type = 'indexed-file' AND source_reference = ?
    `)
    .get(sourceReference) as IndexedRecordRow | undefined;
}

function markFailed(
  database: DatabaseSync,
  sourceReference: string,
  message: string,
): void {
  database
    .prepare(`
      UPDATE records
      SET state = 'failed', error_message = ?
      WHERE source_type = 'indexed-file' AND source_reference = ?
    `)
    .run(message, sourceReference);
}

function indexFile(
  database: DatabaseSync,
  indexRoot: string,
  path: string,
): "indexed" | "unchanged" | "updated" | "failed" {
  const existing = selectIndexedRecord(database, path);
  let bytes: Buffer;
  let stats;
  try {
    bytes = readFileSync(path);
    stats = statSync(path);
  } catch {
    if (existing !== undefined) {
      markFailed(database, path, invalidSourceError);
    }
    return "failed";
  }

  const extension = extname(path).toLowerCase();
  const mediaType = supportedDocumentTypes.get(extension);
  if (mediaType === undefined) {
    return "failed";
  }

  const contentChecksum = checksum(bytes);
  let normalizedText: string;
  try {
    normalizedText = normalizeText(decodeUtf8(bytes));
    if (normalizedText.trim().length === 0) {
      throw new KnowledgeInputError("Document content must not be empty.");
    }
  } catch {
    if (existing === undefined) {
      database
        .prepare(`
          INSERT INTO records (
            id, source_type, title, source_reference, captured_at, state,
            normalized_text, source_adapter, external_reference_json,
            original_name, claimed_mime_type, detected_media_type, byte_length,
            checksum, error_message, index_root, source_modified_at
          ) VALUES (?, 'indexed-file', ?, ?, ?, 'failed', '', 'directory-index',
                    ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          randomUUID(),
          basename(path),
          path,
          new Date().toISOString(),
          JSON.stringify({ indexRoot }),
          basename(path),
          mediaType,
          mediaType,
          bytes.byteLength,
          contentChecksum,
          invalidSourceError,
          indexRoot,
          stats.mtime.toISOString(),
        );
    } else {
      database
        .prepare(`
          UPDATE records
          SET title = ?, state = 'failed', normalized_text = '',
              external_reference_json = ?, original_name = ?,
              claimed_mime_type = ?, detected_media_type = ?, byte_length = ?,
              checksum = ?, error_message = ?, index_root = ?,
              source_modified_at = ?
          WHERE id = ?
        `)
        .run(
          basename(path),
          JSON.stringify({ indexRoot }),
          basename(path),
          mediaType,
          mediaType,
          bytes.byteLength,
          contentChecksum,
          invalidSourceError,
          indexRoot,
          stats.mtime.toISOString(),
          existing.id,
        );
    }
    return "failed";
  }

  if (
    existing?.checksum === contentChecksum &&
    existing.state === "ready"
  ) {
    database
      .prepare(`
        UPDATE records
        SET source_modified_at = ?, error_message = NULL
        WHERE id = ?
      `)
      .run(stats.mtime.toISOString(), existing.id);
    return "unchanged";
  }

  if (existing === undefined) {
    database
      .prepare(`
        INSERT INTO records (
          id, source_type, title, source_reference, captured_at, state,
          normalized_text, source_adapter, external_reference_json,
          original_name, claimed_mime_type, detected_media_type, byte_length,
          checksum, error_message, index_root, source_modified_at
        ) VALUES (?, 'indexed-file', ?, ?, ?, 'ready', ?, 'directory-index',
                  ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `)
      .run(
        randomUUID(),
        basename(path),
        path,
        new Date().toISOString(),
        normalizedText,
        JSON.stringify({ indexRoot }),
        basename(path),
        mediaType,
        mediaType,
        bytes.byteLength,
        contentChecksum,
        indexRoot,
        stats.mtime.toISOString(),
      );
    return "indexed";
  }

  database
    .prepare(`
      UPDATE records
      SET title = ?, state = 'ready', normalized_text = ?,
          external_reference_json = ?, original_name = ?,
          claimed_mime_type = ?, detected_media_type = ?, byte_length = ?,
          checksum = ?, error_message = NULL, index_root = ?,
          source_modified_at = ?
      WHERE id = ?
    `)
    .run(
      basename(path),
      normalizedText,
      JSON.stringify({ indexRoot }),
      basename(path),
      mediaType,
      mediaType,
      bytes.byteLength,
      contentChecksum,
      indexRoot,
      stats.mtime.toISOString(),
      existing.id,
    );
  return "updated";
}

export function indexRepository(
  dataRoot: string,
  path: string,
): RepositoryIndexResult {
  const indexRoot = canonicalDirectory(path);
  const result: RepositoryIndexResult = {
    indexed: 0,
    unchanged: 0,
    updated: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  };
  const discovered = new Set<string>();
  const connection = openKnowledgeDatabase(dataRoot);

  function visit(directory: string): void {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
    } catch {
      result.failed += 1;
      return;
    }

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        result.skipped += 1;
      } else if (entry.isDirectory()) {
        visit(entryPath);
      } else if (!entry.isFile()) {
        result.skipped += 1;
      } else if (!supportedDocumentTypes.has(extname(entry.name).toLowerCase())) {
        result.skipped += 1;
      } else {
        discovered.add(entryPath);
        result[indexFile(connection.database, indexRoot, entryPath)] += 1;
      }
    }
  }

  try {
    connection.database.exec("BEGIN IMMEDIATE");
    try {
      visit(indexRoot);
      const previous = connection.database
        .prepare(`
          SELECT source_reference
          FROM records
          WHERE source_type = 'indexed-file' AND index_root = ?
          ORDER BY source_reference
        `)
        .all(indexRoot) as unknown as { source_reference: string }[];
      for (const row of previous) {
        if (!discovered.has(row.source_reference)) {
          markFailed(connection.database, row.source_reference, missingSourceError);
          result.missing += 1;
        }
      }
      connection.database.exec("COMMIT");
    } catch (error) {
      connection.database.exec("ROLLBACK");
      throw error;
    }
    return result;
  } finally {
    connection.close();
  }
}
