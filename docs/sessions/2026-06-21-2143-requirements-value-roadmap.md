# Session: Requirements — Value-Based Roadmap

Date: 2026-06-22
Role: requirements
Status: completed

## Objective

Replace the original capability-oriented phase list with an authoritative
roadmap organized by incremental user value, while preserving
`INITIAL.md` as vision input.

## Outcome

The project now has an authoritative phase table, a Mermaid roadmap view, a
technical-debt register, a periodic roadmap-review process, and Status CLI
requirements for exposing current/next phase context and debt counts.

Phase 0 is in progress. Phase 1 is the Local Knowledge Loop and Phase 2 is the
Telegram Daily Assistant. Later phases remain explicitly provisional.

## Artifacts

- `docs/ROADMAP.md`
- `docs/TECH_DEBT.md`
- `docs/reviews/template.md`
- `docs/reviews/2026-06-22-roadmap-review.md`
- Updated `docs/requirements/project-status-cli.md`
- Updated `docs/requirements/INITIAL.md`
- Updated `README.md` and `docs/README.md`

## Decisions

- `docs/ROADMAP.md` is the source of truth for phases.
- The phase table is authoritative; Mermaid is a visual projection.
- Phases are organized by standalone user value rather than technology layers.
- `docs/TECH_DEBT.md` is the source of truth for technical debt.
- Reviews occur monthly while active, at phase boundaries, and after major
  requirements, architecture, or roadmap divergence.
- The Status CLI must link to the roadmap and report current/next phase value
  and unresolved debt counts.

## Verification

- The roadmap table and Mermaid view both contain Phase 0 through Phase 7.
- Phase 0 is the only `in-progress` row.
- Phase 1 follows Phase 0 and is not deferred.
- Repository validation and whitespace checks must pass before commit.
- A final documentation review must confirm source-of-truth language is
  consistent across README, requirements, and project knowledge guidance.

## Blockers and Open Questions

- Phase 1 needs formal requirements before approval or implementation.
- Audio transcription privacy, local/hosted model choice, and supported formats
  remain unresolved for Phase 1.
- Later phases may be reordered after real usage evidence.
- The Status CLI implementation plan has not been written.

## Process Audit

Rebuilding phases from user value produced a clearer sequence than refining the
original technology-oriented list. Keeping later phases provisional avoids
false precision. The roadmap table intentionally contains more detail than the
Mermaid diagram; maintaining both manually creates low-severity drift risk,
recorded as TD-004.

No exact token metrics are available because this interactive session was not
run through the local capture utility. Tool use was limited to targeted
requirements reads, Git inspection, and documentation edits.

## Follow-up

1. Write the TypeScript Status CLI implementation plan.
2. Implement roadmap and debt parsing test-first.
3. Complete and audit the Phase 0 delivery cycle.
4. Begin formal Phase 1 requirements discovery.
