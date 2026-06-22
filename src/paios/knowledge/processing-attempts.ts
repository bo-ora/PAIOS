import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import type { DatabaseSync } from "node:sqlite";

import type {
  ProcessingAttempt,
  ProcessingAttemptStatus,
} from "../types.js";
import { openKnowledgeDatabase } from "./database.js";

const maximumDiagnosticLength = 500;

interface ProcessingAttemptRow {
  id: string;
  record_id: string;
  schema_version: 1;
  implementation: "whisper-cli";
  implementation_version: string;
  model_filename: string;
  model_checksum: string;
  language: string;
  started_at: string;
  completed_at: string;
  status: ProcessingAttemptStatus;
  exit_status: number | null;
  diagnostic: string | null;
}

export interface RecordProcessingAttemptInput {
  recordId: string;
  implementationVersion: string;
  modelFilename: string;
  modelChecksum: string;
  language: string;
  startedAt: string;
  completedAt: string;
  status: ProcessingAttemptStatus;
  exitStatus: number | null;
  diagnostic: string | null;
}

export type CompleteAudioProcessingInput = RecordProcessingAttemptInput &
  (
    | {
        status: "succeeded";
        exitStatus: 0;
        diagnostic: null;
        transcript: string;
      }
    | {
        status: "failed";
        transcript: null;
        errorMessage: string;
      }
  );

function rowToAttempt(row: ProcessingAttemptRow): ProcessingAttempt {
  return {
    id: row.id,
    recordId: row.record_id,
    schemaVersion: row.schema_version,
    implementation: row.implementation,
    implementationVersion: row.implementation_version,
    modelFilename: row.model_filename,
    modelChecksum: row.model_checksum,
    language: row.language,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    exitStatus: row.exit_status,
    diagnostic: row.diagnostic,
  };
}

function selectAttempt(
  database: DatabaseSync,
  id: string,
): ProcessingAttemptRow | undefined {
  return database
    .prepare(`
      SELECT id, record_id, schema_version, implementation,
             implementation_version, model_filename, model_checksum, language,
             started_at, completed_at, status, exit_status, diagnostic
      FROM processing_attempts
      WHERE id = ?
    `)
    .get(id) as ProcessingAttemptRow | undefined;
}

function validateInput(input: RecordProcessingAttemptInput): void {
  if (
    input.implementationVersion.trim().length === 0 ||
    basename(input.modelFilename) !== input.modelFilename ||
    !/^[0-9a-f]{64}$/.test(input.modelChecksum) ||
    !/^(auto|[a-z]{2,3})$/.test(input.language) ||
    !Number.isFinite(Date.parse(input.startedAt)) ||
    !Number.isFinite(Date.parse(input.completedAt)) ||
    Date.parse(input.completedAt) < Date.parse(input.startedAt) ||
    (input.status === "succeeded" && input.exitStatus !== 0)
  ) {
    throw new Error("Invalid processing-attempt metadata.");
  }
}

export function recordProcessingAttempt(
  dataRoot: string,
  input: RecordProcessingAttemptInput,
): ProcessingAttempt {
  validateInput(input);
  const connection = openKnowledgeDatabase(dataRoot);
  try {
    const record = connection.database
      .prepare("SELECT source_type FROM records WHERE id = ?")
      .get(input.recordId) as { source_type: string } | undefined;
    if (record?.source_type !== "audio") {
      throw new Error("Processing attempts require an existing audio record.");
    }
    const id = randomUUID();
    const diagnostic =
      input.diagnostic === null
        ? null
        : input.diagnostic.length <= maximumDiagnosticLength
          ? input.diagnostic
          : `${input.diagnostic.slice(0, maximumDiagnosticLength - 3)}...`;
    connection.database
      .prepare(`
        INSERT INTO processing_attempts (
          id, record_id, schema_version, implementation,
          implementation_version, model_filename, model_checksum, language,
          started_at, completed_at, status, exit_status, diagnostic
        ) VALUES (?, ?, 1, 'whisper-cli', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.recordId,
        input.implementationVersion.trim(),
        input.modelFilename,
        input.modelChecksum,
        input.language,
        input.startedAt,
        input.completedAt,
        input.status,
        input.exitStatus,
        diagnostic,
      );
    const stored = selectAttempt(connection.database, id);
    if (stored === undefined) {
      throw new Error("Processing attempt could not be read after storage.");
    }
    return rowToAttempt(stored);
  } finally {
    connection.close();
  }
}

export function completeAudioProcessing(
  dataRoot: string,
  input: CompleteAudioProcessingInput,
): ProcessingAttempt {
  validateInput(input);
  if (
    (input.status === "succeeded" && input.transcript.trim().length === 0) ||
    (input.status === "failed" && input.errorMessage.trim().length === 0)
  ) {
    throw new Error("Invalid audio-processing completion.");
  }

  const connection = openKnowledgeDatabase(dataRoot);
  try {
    const record = connection.database
      .prepare("SELECT source_type FROM records WHERE id = ?")
      .get(input.recordId) as { source_type: string } | undefined;
    if (record?.source_type !== "audio") {
      throw new Error("Audio processing requires an existing audio record.");
    }

    const id = randomUUID();
    const diagnostic =
      input.diagnostic === null
        ? null
        : input.diagnostic.length <= maximumDiagnosticLength
          ? input.diagnostic
          : `${input.diagnostic.slice(0, maximumDiagnosticLength - 3)}...`;
    connection.database.exec("BEGIN IMMEDIATE");
    try {
      connection.database
        .prepare(`
          INSERT INTO processing_attempts (
            id, record_id, schema_version, implementation,
            implementation_version, model_filename, model_checksum, language,
            started_at, completed_at, status, exit_status, diagnostic
          ) VALUES (?, ?, 1, 'whisper-cli', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          input.recordId,
          input.implementationVersion.trim(),
          input.modelFilename,
          input.modelChecksum,
          input.language,
          input.startedAt,
          input.completedAt,
          input.status,
          input.exitStatus,
          diagnostic,
        );
      if (input.status === "succeeded") {
        connection.database
          .prepare(`
            UPDATE records
            SET normalized_text = ?, state = 'ready', error_message = NULL
            WHERE id = ?
          `)
          .run(input.transcript, input.recordId);
      } else {
        const errorMessage =
          input.errorMessage.length <= maximumDiagnosticLength
            ? input.errorMessage
            : `${input.errorMessage.slice(0, maximumDiagnosticLength - 3)}...`;
        connection.database
          .prepare(`
            UPDATE records
            SET state = 'failed', error_message = ?
            WHERE id = ?
          `)
          .run(errorMessage, input.recordId);
      }
      connection.database.exec("COMMIT");
    } catch (error) {
      connection.database.exec("ROLLBACK");
      throw error;
    }

    const stored = selectAttempt(connection.database, id);
    if (stored === undefined) {
      throw new Error("Processing attempt could not be read after storage.");
    }
    return rowToAttempt(stored);
  } finally {
    connection.close();
  }
}

export function listProcessingAttempts(
  dataRoot: string,
  recordId: string,
): ProcessingAttempt[] {
  const connection = openKnowledgeDatabase(dataRoot);
  try {
    const rows = connection.database
      .prepare(`
        SELECT id, record_id, schema_version, implementation,
               implementation_version, model_filename, model_checksum,
               language, started_at, completed_at, status, exit_status,
               diagnostic
        FROM processing_attempts
        WHERE record_id = ?
        ORDER BY started_at, internal_id
      `)
      .all(recordId) as unknown as ProcessingAttemptRow[];
    return rows.map(rowToAttempt);
  } finally {
    connection.close();
  }
}
