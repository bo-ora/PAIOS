import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { openKnowledgeDatabase } from "./database.js";
import { rebuildSearchIndex } from "./records.js";
import { revalidateIndexedSources } from "./repository-index.js";

const manifestName = "manifest.json";
const databaseName = "knowledge.sqlite";

interface BackupManifestFile {
  path: string;
  byteLength: number;
  sha256: string;
}

interface BackupManifest {
  format: "paios-knowledge-backup";
  version: 1;
  createdAt: string;
  files: BackupManifestFile[];
}

export interface KnowledgeBackupResult {
  destination: string;
  fileCount: number;
}

export interface KnowledgeRestoreResult {
  destination: string;
  fileCount: number;
  recordCount: number;
  indexedRecordCount: number;
  staleIndexedRecordCount: number;
}

export class KnowledgeBackupError extends Error {}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function inspectEmptyDestination(path: string, description: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  if (!lstatSync(path).isDirectory() || readdirSync(path).length !== 0) {
    throw new KnowledgeBackupError(`${description} must be an empty directory.`);
  }
  chmodSync(path, 0o700);
  return true;
}

function syncFile(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function syncDirectory(path: string): void {
  try {
    syncFile(path);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (
      !["EACCES", "EBADF", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(
        code,
      )
    ) {
      throw error;
    }
  }
}

function syncDirectoryTree(root: string): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      syncDirectoryTree(join(root, entry.name));
    }
  }
  syncDirectory(root);
}

function stagingDirectory(destination: string, operation: string): string {
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  return mkdtempSync(
    join(parent, `.${basename(destination)}-${operation}-`),
    { encoding: "utf8" },
  );
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  if (existsSync(resolved)) {
    return realpathSync(resolved);
  }
  const parent = dirname(resolved);
  if (parent === resolved) {
    return resolved;
  }
  return join(canonicalPath(parent), resolved.slice(parent.length + 1));
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(canonicalPath(parent), canonicalPath(child));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

function listRegularFiles(root: string, current = root): string[] {
  if (!existsSync(current)) {
    return [];
  }
  const paths: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      paths.push(...listRegularFiles(root, path));
    } else if (entry.isFile()) {
      paths.push(relative(root, path).split(sep).join("/"));
    } else {
      throw new KnowledgeBackupError(
        "Backup sources must contain only regular files and directories.",
      );
    }
  }
  return paths.sort();
}

function copyPackageFile(sourceRoot: string, destinationRoot: string, path: string): void {
  const destination = join(destinationRoot, ...path.split("/"));
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(join(sourceRoot, ...path.split("/")), destination);
  chmodSync(destination, 0o600);
  syncFile(destination);
}

function describeFile(root: string, path: string): BackupManifestFile {
  const absolutePath = join(root, ...path.split("/"));
  return {
    path,
    byteLength: lstatSync(absolutePath).size,
    sha256: sha256(absolutePath),
  };
}

function parseManifest(backupRoot: string): BackupManifest {
  let value: unknown;
  try {
    value = JSON.parse(
      readFileSync(join(backupRoot, manifestName), "utf8"),
    ) as unknown;
  } catch {
    throw new KnowledgeBackupError("Backup manifest is missing or invalid.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("format" in value) ||
    value.format !== "paios-knowledge-backup" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("createdAt" in value) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !("files" in value) ||
    !Array.isArray(value.files)
  ) {
    throw new KnowledgeBackupError("Backup manifest has an unsupported format.");
  }

  const files: BackupManifestFile[] = [];
  const seen = new Set<string>();
  const manifestFiles = value.files as unknown[];
  for (const item of manifestFiles) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("path" in item) ||
      typeof item.path !== "string" ||
      item.path.length === 0 ||
      isAbsolute(item.path) ||
      item.path.includes("\\") ||
      item.path
        .split("/")
        .some(
          (part: string) => part === "" || part === "." || part === "..",
        ) ||
      !("byteLength" in item) ||
      !Number.isSafeInteger(item.byteLength) ||
      (item.byteLength as number) < 0 ||
      !("sha256" in item) ||
      typeof item.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.sha256) ||
      seen.has(item.path)
    ) {
      throw new KnowledgeBackupError("Backup manifest contains an invalid file entry.");
    }
    seen.add(item.path);
    files.push({
      path: item.path,
      byteLength: item.byteLength as number,
      sha256: item.sha256,
    });
  }
  if (!seen.has(databaseName)) {
    throw new KnowledgeBackupError("Backup manifest does not contain the database.");
  }
  return {
    format: value.format,
    version: value.version,
    createdAt: value.createdAt,
    files,
  };
}

function validatePackage(backupRoot: string, manifest: BackupManifest): void {
  const actualFiles = listRegularFiles(backupRoot).filter(
    (path) => path !== manifestName,
  );
  const expectedFiles = manifest.files.map((file) => file.path).sort();
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((path, index) => path !== expectedFiles[index])
  ) {
    throw new KnowledgeBackupError("Backup package files do not match the manifest.");
  }
  for (const file of manifest.files) {
    const absolutePath = join(backupRoot, ...file.path.split("/"));
    if (
      lstatSync(absolutePath).size !== file.byteLength ||
      sha256(absolutePath) !== file.sha256
    ) {
      throw new KnowledgeBackupError(`Backup checksum validation failed for ${file.path}.`);
    }
  }
}

interface ManagedRecordRow {
  source_reference: string;
  byte_length: number;
  checksum: string;
}

function managedSourceRows(databaseRoot: string): ManagedRecordRow[] {
  const database = new DatabaseSync(join(databaseRoot, databaseName), {
    readOnly: true,
  });
  try {
    const rows = database
      .prepare(`
        SELECT source_reference, byte_length, checksum
        FROM records
        WHERE source_type IN ('note', 'managed-file', 'audio')
        ORDER BY id
      `)
      .all() as unknown as ManagedRecordRow[];
    for (const row of rows) {
      if (
        !row.source_reference.startsWith("sources/") ||
        row.source_reference
          .split("/")
          .some((part) => part === "" || part === "." || part === "..")
      ) {
        throw new KnowledgeBackupError(
          "Backup database contains an unsafe managed source reference.",
        );
      }
    }
    return rows.sort((left, right) =>
      left.source_reference.localeCompare(right.source_reference),
    );
  } finally {
    database.close();
  }
}

function validateManagedSources(
  sourceRoot: string,
  databaseRoot = sourceRoot,
): string[] {
  const rows = managedSourceRows(databaseRoot);
  for (const row of rows) {
    const path = join(sourceRoot, ...row.source_reference.split("/"));
    if (!existsSync(path)) {
      throw new KnowledgeBackupError(
        "Backup is missing a required managed source file.",
      );
    }
    if (
      !lstatSync(path).isFile() ||
      lstatSync(path).size !== row.byte_length ||
      sha256(path) !== row.checksum
    ) {
      throw new KnowledgeBackupError(
        "Backup managed source does not match its database record.",
      );
    }
  }
  return rows.map((row) => row.source_reference);
}

function countRecords(root: string): number {
  const database = new DatabaseSync(join(root, databaseName), {
    readOnly: true,
  });
  try {
    const row = database
      .prepare("SELECT COUNT(*) AS count FROM records")
      .get() as { count: number };
    return row.count;
  } finally {
    database.close();
  }
}

export async function createKnowledgeBackup(
  dataRoot: string,
  destination: string,
): Promise<KnowledgeBackupResult> {
  const sourceRoot = resolve(dataRoot);
  const backupRoot = resolve(destination);
  if (sourceRoot === backupRoot || isWithin(sourceRoot, backupRoot)) {
    throw new KnowledgeBackupError(
      "Backup destination must be outside the knowledge data root.",
    );
  }
  if (!existsSync(join(sourceRoot, databaseName))) {
    throw new KnowledgeBackupError("Knowledge data root does not contain a database.");
  }
  if (existsSync(backupRoot)) {
    throw new KnowledgeBackupError(
      "Backup destination must not already exist.",
    );
  }

  const stagingRoot = stagingDirectory(backupRoot, "backup");
  let published = false;
  try {
    const connection = openKnowledgeDatabase(sourceRoot);
    try {
      await backup(connection.database, join(stagingRoot, databaseName));
      chmodSync(join(stagingRoot, databaseName), 0o600);
      syncFile(join(stagingRoot, databaseName));
    } finally {
      connection.close();
    }

    const sourceFiles = validateManagedSources(sourceRoot, stagingRoot);
    const actualSourceFiles = listRegularFiles(join(sourceRoot, "sources")).map(
      (path) => `sources/${path}`,
    );
    if (
      actualSourceFiles.length !== sourceFiles.length ||
      actualSourceFiles.some((path, index) => path !== sourceFiles[index])
    ) {
      throw new KnowledgeBackupError(
        "Knowledge data root contains an unreferenced managed source file.",
      );
    }
    for (const path of sourceFiles) {
      copyPackageFile(sourceRoot, stagingRoot, path);
    }
    validateManagedSources(stagingRoot);
    const files = [databaseName, ...sourceFiles]
      .sort()
      .map((path) => describeFile(stagingRoot, path));
    const manifest: BackupManifest = {
      format: "paios-knowledge-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      files,
    };
    writeFileSync(
      join(stagingRoot, manifestName),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    syncFile(join(stagingRoot, manifestName));
    syncDirectoryTree(stagingRoot);
    renameSync(stagingRoot, backupRoot);
    published = true;
    syncDirectory(dirname(backupRoot));
    return { destination: backupRoot, fileCount: files.length };
  } catch (error) {
    if (error instanceof KnowledgeBackupError) {
      throw error;
    }
    throw new KnowledgeBackupError("Unable to create the knowledge backup.");
  } finally {
    if (!published) {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  }
}

export function restoreKnowledgeBackup(
  backup: string,
  destination: string,
): KnowledgeRestoreResult {
  const backupRoot = resolve(backup);
  const dataRoot = resolve(destination);
  if (!existsSync(backupRoot) || !lstatSync(backupRoot).isDirectory()) {
    throw new KnowledgeBackupError("Backup path must be a directory.");
  }
  if (
    backupRoot === dataRoot ||
    isWithin(backupRoot, dataRoot) ||
    isWithin(dataRoot, backupRoot)
  ) {
    throw new KnowledgeBackupError(
      "Restore destination must be separate from the backup package.",
    );
  }

  const manifest = parseManifest(backupRoot);
  validatePackage(backupRoot, manifest);
  const managedSources = validateManagedSources(backupRoot);
  const packagedSources = manifest.files
    .map((file) => file.path)
    .filter((path) => path !== databaseName)
    .sort();
  if (
    packagedSources.length !== managedSources.length ||
    packagedSources.some((path, index) => path !== managedSources[index])
  ) {
    throw new KnowledgeBackupError(
      "Backup package contains an unexpected managed source file.",
    );
  }
  const destinationExisted = inspectEmptyDestination(
    dataRoot,
    "Restore destination",
  );
  const stagingRoot = stagingDirectory(dataRoot, "restore");
  let activated = false;
  try {
    for (const file of manifest.files) {
      copyPackageFile(backupRoot, stagingRoot, file.path);
    }
    validatePackage(stagingRoot, manifest);
    validateManagedSources(stagingRoot);
    const staleIndexedRecordCount = revalidateIndexedSources(stagingRoot);
    const indexedRecordCount = rebuildSearchIndex(stagingRoot);
    const recordCount = countRecords(stagingRoot);
    syncDirectoryTree(stagingRoot);
    if (destinationExisted) {
      rmdirSync(dataRoot);
    }
    renameSync(stagingRoot, dataRoot);
    activated = true;
    syncDirectory(dirname(dataRoot));
    return {
      destination: dataRoot,
      fileCount: manifest.files.length,
      recordCount,
      indexedRecordCount,
      staleIndexedRecordCount,
    };
  } catch {
    throw new KnowledgeBackupError("Unable to restore the knowledge backup.");
  } finally {
    if (!activated) {
      rmSync(stagingRoot, { recursive: true, force: true });
      if (destinationExisted && !existsSync(dataRoot)) {
        mkdirSync(dataRoot, { mode: 0o700 });
      }
    }
  }
}
