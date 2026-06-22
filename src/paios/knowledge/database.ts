import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const schemaVersion = 1;

const migration = `
  CREATE TABLE IF NOT EXISTS schema_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL
  ) STRICT;

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
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    checksum TEXT NOT NULL UNIQUE,
    error_message TEXT
  ) STRICT;

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
    database.exec(migration);
    const version = database
      .prepare("SELECT version FROM schema_metadata WHERE id = 1")
      .get() as { version: number } | undefined;
    if (version === undefined) {
      database
        .prepare("INSERT INTO schema_metadata(id, version) VALUES (1, ?)")
        .run(schemaVersion);
    } else if (version.version !== schemaVersion) {
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
