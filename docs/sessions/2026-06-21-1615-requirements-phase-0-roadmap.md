# Session: Requirements — Phase 0 and Roadmap

Date: 2026-06-21
Role: requirements
Status: partial

## Objective

Refine Phase 0 into a simple, valuable delivery boundary; define the first
product change that proves the development workflow; and begin defining a
visual project roadmap and technical-debt tracking model.

## Outcome

Phase 0 was narrowed from a complete autonomous SDLC platform to a Development
Operating System proven through one audited delivery cycle. The selected product
change is a repository-local Project Status CLI.

The CLI will be implemented in TypeScript, compiled with `tsc`, invoked through
`./paios`, derive current status from Git and Markdown, support human and JSON
output, and remain read-only and offline.

The roadmap discussion established that:

- `docs/ROADMAP.md` should become the authoritative phase source.
- A phase table should hold purpose, value, deliverables, state, dependencies,
  and exit criteria.
- A Mermaid diagram should be a projection of that table, not a separate source
  of truth.
- `docs/TECH_DEBT.md` should hold the technical-debt register.
- Periodic reviews should be stored under `docs/reviews/`.
- The future `./paios status` output should link to `docs/ROADMAP.md` and report
  current and next phase data.

## Artifacts

- `docs/requirements/phase-0-development-operating-system.md`
- `docs/requirements/project-status-cli.md`
- `docs/architecture/decisions/0001-project-status-cli-architecture.md`
- Commit `4ac4ed1 docs: approve Phase 0 status CLI requirements`

## Decisions

- Phase 0 delivers a Development Operating System, not a PAIOS runtime.
- Phase 0 completion requires one audited end-to-end delivery cycle.
- The validating product feature is the Project Status CLI.
- The CLI status source is the current Git working tree and repository Markdown.
- The CLI uses compiled TypeScript with no runtime npm dependencies.
- Validation failures exit `1`; warnings alone exit `0`.
- Roadmap data should have one Markdown source of truth with Mermaid as a view.

The authoritative Phase 0 and CLI decisions are in the approved requirements
and ADR listed above. Roadmap and technical-debt decisions are preliminary until
their own approved artifacts are created.

## Verification

- `python3 scripts/validate_repository.py .` passed after the Phase 0 documents
  were written.
- `git diff --check` passed.
- Commit `4ac4ed1` was pushed to `origin/master`.
- Current `git status --short --branch` reports
  `master...origin/master` with no changes before this handoff.

## Blockers and Open Questions

- Should the roadmap retain the eight phases from `INITIAL.md` as a draft and
  refine them, or redefine phases from scratch around incremental user value?
- What exact fields and prioritization rules should the technical-debt register
  use?
- What review cadence should be mandatory beyond phase completion and major
  requirement changes?
- The Status CLI requirements do not yet include roadmap fields or the roadmap
  link; update them only after the roadmap model is approved.
- The Status CLI implementation plan has not been written.

## Process Audit

The one-question-at-a-time requirements process kept decisions explicit and
prevented premature implementation. Repeated confirmation messages were
effective but somewhat verbose; future sessions can reduce tokens by grouping
closely coupled low-risk output-format decisions after the main boundary is
approved.

No exact session token metrics are available because this interactive session
was not started through `scripts/capture_codex_session.py`. Observable tool use
was limited to targeted requirement, architecture, and Git reads during
closeout.

## Follow-up

1. Decide whether to refine the existing eight phases or replace them.
2. Approve the roadmap phase schema and lifecycle states.
3. Create `docs/ROADMAP.md`, `docs/TECH_DEBT.md`, and a review template under
   `docs/reviews/`.
4. Update the Status CLI requirements to include roadmap path, current phase,
   next phase, and value.
5. Create the TypeScript Status CLI implementation plan.
