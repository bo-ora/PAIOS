import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const schemaVersion = 4;

const recordsSchema = `
  CREATE TABLE IF NOT EXISTS records (
    internal_id INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (
      source_type IN ('note', 'managed-file', 'indexed-file', 'audio')
    ),
    title TEXT,
    source_reference TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'failed')),
    normalized_text TEXT NOT NULL,
    source_adapter TEXT NOT NULL,
    external_reference_json TEXT,
    original_name TEXT,
    claimed_mime_type TEXT,
    detected_media_type TEXT,
    detected_container TEXT,
    detected_codec TEXT,
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    checksum TEXT NOT NULL,
    error_message TEXT,
    index_root TEXT,
    source_modified_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS records_checksum ON records(checksum);
  CREATE UNIQUE INDEX IF NOT EXISTS indexed_source_reference
  ON records(source_reference)
  WHERE source_type = 'indexed-file';

  CREATE VIRTUAL TABLE IF NOT EXISTS record_search USING fts5(
    title,
    normalized_text,
    content='records',
    content_rowid='internal_id'
  );

  CREATE TRIGGER IF NOT EXISTS records_after_insert AFTER INSERT ON records BEGIN
    INSERT INTO record_search(rowid, title, normalized_text)
    VALUES (new.internal_id, new.title, new.normalized_text);
  END;

  CREATE TRIGGER IF NOT EXISTS records_after_delete AFTER DELETE ON records BEGIN
    INSERT INTO record_search(record_search, rowid, title, normalized_text)
    VALUES ('delete', old.internal_id, old.title, old.normalized_text);
  END;

  CREATE TRIGGER IF NOT EXISTS records_after_update AFTER UPDATE ON records BEGIN
    INSERT INTO record_search(record_search, rowid, title, normalized_text)
    VALUES ('delete', old.internal_id, old.title, old.normalized_text);
    INSERT INTO record_search(rowid, title, normalized_text)
    VALUES (new.internal_id, new.title, new.normalized_text);
  END;
`;

const processingAttemptsSchema = `
  CREATE TABLE IF NOT EXISTS processing_attempts (
    internal_id INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    record_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    implementation TEXT NOT NULL CHECK (implementation = 'whisper-cli'),
    implementation_version TEXT NOT NULL,
    model_filename TEXT NOT NULL,
    model_checksum TEXT NOT NULL,
    language TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
    exit_status INTEGER,
    diagnostic TEXT,
    FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS processing_attempts_record
  ON processing_attempts(record_id, started_at, internal_id);
`;

const migrateVersionOne = `
  DROP TRIGGER IF EXISTS records_after_insert;
  DROP TRIGGER IF EXISTS records_after_delete;
  DROP TRIGGER IF EXISTS records_after_update;
  DROP TABLE IF EXISTS record_search;

  ALTER TABLE records RENAME TO records_version_one;

  CREATE TABLE records (
    internal_id INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (
      source_type IN ('note', 'managed-file', 'indexed-file', 'audio')
    ),
    title TEXT,
    source_reference TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'failed')),
    normalized_text TEXT NOT NULL,
    source_adapter TEXT NOT NULL,
    external_reference_json TEXT,
    original_name TEXT,
    claimed_mime_type TEXT,
    detected_media_type TEXT,
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    checksum TEXT NOT NULL,
    error_message TEXT,
    index_root TEXT,
    source_modified_at TEXT
  ) STRICT;

  INSERT INTO records (
    internal_id, id, source_type, title, source_reference, captured_at, state,
    normalized_text, source_adapter, external_reference_json, original_name,
    claimed_mime_type, detected_media_type, byte_length, checksum, error_message
  )
  SELECT internal_id, id, source_type, title, source_reference, captured_at,
         state, normalized_text, source_adapter, external_reference_json,
         original_name, claimed_mime_type, detected_media_type, byte_length,
         checksum, error_message
  FROM records_version_one;

  DROP TABLE records_version_one;
`;

const migrateVersionTwo = `
  ALTER TABLE records ADD COLUMN detected_container TEXT;
  ALTER TABLE records ADD COLUMN detected_codec TEXT;
`;

export interface KnowledgeDatabase {
  database: DatabaseSync;
  close: () => void;
}

export function openKnowledgeDatabase(dataRoot: string): KnowledgeDatabase {
  mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(join(dataRoot, "knowledge.sqlite"), {
    timeout: 5_000,
  });

  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      ) STRICT;
    `);
    const version = database
      .prepare("SELECT version FROM schema_metadata WHERE id = 1")
      .get() as { version: number } | undefined;
    if (version === undefined) {
      database.exec(recordsSchema);
      database.exec(processingAttemptsSchema);
      database
        .prepare("INSERT INTO schema_metadata(id, version) VALUES (1, ?)")
        .run(schemaVersion);
    } else if (
      version.version === 1 ||
      version.version === 2 ||
      version.version === 3
    ) {
      database.exec("BEGIN IMMEDIATE");
      try {
        if (version.version === 1) {
          database.exec(migrateVersionOne);
        }
        if (version.version === 1 || version.version === 2) {
          database.exec(migrateVersionTwo);
        }
        database.exec(recordsSchema);
        database.exec(processingAttemptsSchema);
        database.exec(
          "INSERT INTO record_search(record_search) VALUES ('rebuild');",
        );
        database
          .prepare("UPDATE schema_metadata SET version = ? WHERE id = 1")
          .run(schemaVersion);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } else if (version.version === schemaVersion) {
      database.exec(recordsSchema);
      database.exec(processingAttemptsSchema);
    } else {
      throw new Error("Unsupported knowledge database schema.");
    }
  } catch (error) {
    database.close();
    throw error;
  }

  return {
    database,
    close: () => database.close(),
  };
}
