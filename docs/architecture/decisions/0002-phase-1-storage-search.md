# ADR-0002: Use SQLite and FTS5 for Phase 1 Metadata and Search

Status: Accepted
Date: 2026-06-22

## Context

Phase 1 needs durable metadata, duplicate detection, recoverable processing
states, deterministic lexical search, source inspection, index rebuild, and
consistent backup without a database server. The CLI is TypeScript and the
current minimum Node.js 20 runtime is end of life.

Durable imported sources must remain locally inspectable and must not exist only
as database rows. Search indexes are derived state.

## Decision

- Require Node.js 24 LTS for Phase 1.
- Use the built-in `node:sqlite` module for a local SQLite metadata database.
- Use STRICT tables, foreign keys, schema migrations, explicit transactions,
  and a non-zero busy timeout.
- Use an FTS5 external-content table linked to normalized record text.
- Maintain record and FTS changes in the same transaction.
- Order search by FTS5 BM25 rank, then stable record identifier as the
  deterministic tie-breaker.
- Store managed source files outside SQLite under the configured knowledge data
  root.
- Treat the FTS table as derived state and implement complete rebuild from
  durable records and indexed external sources.
- Keep all SQLite-specific behavior behind storage and search interfaces.
- Use the SQLite/Node backup API for a consistent metadata snapshot, then copy
  managed source files into the backup package.

Do not use WAL mode initially. Phase 1 is a single-process CLI, and rollback
journaling simplifies portable backup to one database file. Reconsider WAL only
after measured concurrency or latency evidence justifies its extra checkpoint
and sidecar-file handling.

## Alternatives Considered

- `better-sqlite3`: mature, but adds a native runtime dependency and build
  lifecycle when the selected Node LTS already provides SQLite.
- JSON and source files only: insufficiently robust for transactional metadata,
  migration, deterministic search, and interruption recovery without custom
  database behavior.
- PostgreSQL or another server database: contradicts the local, portable,
  zero-service Phase 1 boundary.
- A vector database: semantic retrieval is explicitly out of scope.

## Consequences

- CI and documentation must move from Node.js 20 to Node.js 24.
- The Node SQLite API is isolated because its current stability classification
  is release candidate.
- Metadata can be backed up and migrated independently from managed sources.
- FTS consistency requires transaction tests and a rebuild acceptance test.
- The database is not itself the sole durable copy of imported personal
  content.

## Validation

- Run a startup capability check for SQLite version, STRICT tables, and FTS5.
- Test transaction rollback, interrupted/pending state, duplicate checks, FTS
  updates/deletes, deterministic ordering, quoted phrases, and rebuild.
- Delete derived FTS state and prove expected search results are restored.
- Back up and restore into a clean temporary data root and compare records,
  checksums, and retrieval results.
- Revisit if Node 24 SQLite has a blocking defect, multi-process writers become
  required, or backup consistency cannot be demonstrated.
