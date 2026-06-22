# Session: Implementation — Document Import and Search

Date: 2026-06-22
Role: implementation
Status: completed

## Objective

Complete the first Phase 1 capture-to-retrieval loop by implementing managed
UTF-8 Markdown/plain-text import, deterministic lexical search, exact phrase
queries, sourced excerpts, and derived-index rebuild.

## Outcome

`knowledge add-file` now validates and imports `.md` and `.txt` files while
preserving their original bytes. Searchable text is decoded as strict UTF-8,
strips a leading byte-order mark, normalizes line endings and Unicode, and is
stored separately from the managed source.

`knowledge search` now returns FTS5 BM25-ranked source matches with stable
record-ID tie-breaking. `knowledge rebuild` recreates derived FTS state without
changing source files or durable records. `HOW_TO_USE.md` contains verified
examples for all three commands.

## Artifacts

- `src/paios/knowledge/records.ts`
- `src/paios/knowledge/source-files.ts`
- `src/paios/cli.ts`
- `src/paios/types.ts`
- `tests/paios/knowledge.test.ts`
- `.github/workflows/ci.yml`
- `HOW_TO_USE.md`
- `README.md`
- `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`
- `docs/sessions/2026-06-22-1227-implementation-document-search.md`

## Decisions

- Preserve exact imported bytes and use normalized text only for retrieval.
- Treat filename extension as the approved Phase 1 document-format gate while
  strict UTF-8 decoding validates content.
- Use the original filename as managed-file title without retaining or printing
  unrelated absolute source paths.
- Rank by FTS5 BM25 with title weight 5 and text weight 1, then stable record ID.
- Keep FTS5 as derived external-content state and rebuild it transactionally.

These implementation decisions remain within ADR-0002 and the approved Phase 1
requirements.

## Verification

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 31 tests, 0 failures.
- `npm run build` passed.
- `python3 -m unittest discover -s tests -v` passed: 13 tests.
- `python3 scripts/validate_repository.py .` passed.
- `git diff --check` passed.
- `sh -n lde.sh` passed.
- An isolated real CLI scenario imported Markdown, found an exact phrase with a
  highlighted source excerpt, and rebuilt one ready record.
- Tests cover original-byte preservation, BOM/line normalization, unsupported
  formats, invalid UTF-8, empty documents, directory rejection, duplicates,
  case-insensitive terms, exact phrases, no matches, malformed queries, BM25
  ordering, stable ties, source references, updates, and index rebuild.

## Blockers and Open Questions

- No blocker prevents repository indexing.
- Deletion and stale-source handling apply to externally indexed files and
  remain in the next slice.
- Audio dependencies remain deferred until the audio slice.

## Process Audit

The implementation reused the existing schema and transaction model, avoiding
an unnecessary migration. The first real CLI smoke command ran in parallel with
the build and used stale compiled output, producing expected “not implemented”
messages. It was rerun sequentially after build completion and passed. Future
smoke checks that consume generated output should run after, not in parallel
with, the build.

Exact token metrics are unavailable because the session was not run through the
repository capture script.

## Follow-up

1. Implement stable-order repository/directory indexing.
2. Add idempotent unchanged/updated/skipped/failed counts.
3. Detect deleted or moved indexed sources and suppress stale search results.
4. Add verified repository-indexing scenarios to `HOW_TO_USE.md`.
