# Session: Implementation — Backup and Restore Local Knowledge

Date: 2026-06-23
Role: implementation
Status: completed

## Objective

Implement the next approved Phase 1 task: a portable local-knowledge backup
package, validated restore into a clean destination, restart/retrieval
acceptance evidence, and operational recovery documentation.

Completion required preserving SQLite metadata, managed source bytes,
transcripts, processing metadata, and lexical retrieval without modifying the
pre-existing uncommitted audio-benchmark work.

## Outcome

Added `knowledge backup` and `knowledge restore` workflows. Backup uses the
Node SQLite backup API, copies managed regular files, and writes a versioned
manifest containing byte lengths and SHA-256 checksums. Restore requires an
explicit empty `--data-root`, validates safe paths and the exact package
contents before activation, copies the package, and rebuilds derived FTS state.

Clean-environment tests restored note, document, and audio records; transcript
and processing-attempt metadata; managed source bytes; and expected searches
after reopening the destination. Tampered package content is rejected before
the destination is touched.

## Artifacts

- Created `src/paios/knowledge/backup.ts`.
- Modified `src/paios/knowledge/commands.ts` and `src/paios/cli.ts`.
- Modified `tests/paios/knowledge.test.ts` and `tests/paios/cli.test.ts`.
- Updated `HOW_TO_USE.md`.
- Updated `docs/plans/2026-06-22-phase-1-local-knowledge-loop.md`.
- No commit was created.
- Existing audio-benchmark changes in `package.json`, `HOW_TO_USE.md`, the Phase
  1 plan, `tests/paios/audio-benchmark*.ts`, and the earlier session summary
  were preserved.

## Decisions

- Used a directory package containing `knowledge.sqlite`, managed `sources/`,
  and `manifest.json`.
- Required restore destination selection through `--data-root`; implicit
  restore to the default root is rejected.
- Rejected missing, extra, modified, unsafe, or symlinked package entries.
- Rebuilt FTS during restore because search state is derived.
- Did not copy indexed external files because their original paths remain
  authoritative.

These are reversible implementation details inside the approved requirements
in `docs/requirements/phase-1-local-knowledge-loop.md`, ADR-0002, and delivery
step 7 of the Phase 1 plan.

## Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, 73 tests.
- `npm run build` — passed.
- `python3 -m unittest discover -s tests -v` — passed, 13 tests.
- `python3 scripts/validate_repository.py .` — passed.
- `git diff --check` — passed.
- Final diff review found the backup/restore changes scoped to the approved
  slice and the pre-existing benchmark changes intact.

## Blockers and Open Questions

None for this slice. Phase 1 acceptance and independent review remain next.

## Process Audit

The project workflow correctly selected the approved backup/restore task from
`./paios status --json`. One attempted `rg` lookup failed because `rg` was not
available through the configured command environment; targeted `grep` and
direct file reads were used instead. The first test run found an expected CLI
usage fixture update and an invalid unquoted FTS hyphen query; both were
corrected before full verification.

No raw session metrics were available. Reads were limited to the operating
model, relevant requirement/ADR/plan sections, implementation boundaries,
tests, and session-close template.

## Capability Harvest

| Item | Target | Action | Session evidence |
| --- | --- | --- | --- |
| Backup/restore behavior | Phase 1 plan and `HOW_TO_USE.md` | Promote to authoritative plan evidence and operational documentation | Implemented and verified in this session |
| Project workflow skill | `.agents/skills/paios-project-workflow/` | Reject change | It selected the correct approved next task |
| Session-close skill | `.agents/skills/paios-session-close/` | Reject change | Existing headings and evidence workflow were sufficient |
| New skill, command, agent, prompt, or hook | None | Reject | No repeated process gap or failed capability scenario was observed |

## Follow-up

- Run Phase 1 acceptance and independent privacy, data-loss, portability, and
  correctness review. Update roadmap, debt, review, plan, and session artifacts
  only from that verified evidence.
