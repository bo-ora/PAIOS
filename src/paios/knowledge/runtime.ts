import { DatabaseSync } from "node:sqlite";

const minimumNodeMajor = 24;

export function assertKnowledgeRuntime(nodeVersion = process.versions.node): void {
  const major = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major) || major < minimumNodeMajor) {
    throw new Error(`PAIOS knowledge commands require Node.js ${minimumNodeMajor}+.`);
  }

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE capability_check (
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL
      ) STRICT;
      CREATE VIRTUAL TABLE capability_search USING fts5(text);
    `);
  } finally {
    database.close();
  }
}
