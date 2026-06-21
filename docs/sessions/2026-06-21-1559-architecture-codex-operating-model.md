# Session: Architecture — Codex Operating Model

Date: 2026-06-21
Role: architecture
Status: completed

## Objective

Establish a simple, effective, local-first operating model for evolving PAIOS
with Codex while harvesting durable project knowledge and agent-performance
evidence.

## Outcome

The repository now defines its knowledge model, session lifecycle, capability
evaluation protocol, deterministic validation, local event capture, and two
evaluated Codex skills.

## Artifacts

- `docs/architecture/codex-operating-model.md`
- `docs/plans/2026-06-21-codex-operating-model.md`
- `evals/codex/`
- `scripts/validate_repository.py`
- `scripts/capture_codex_session.py`
- `.agents/skills/paios-project-workflow/`
- `.agents/skills/paios-session-close/`
- `docs/audits/codex-evals/`

## Decisions

- Keep curated summaries in Git and raw events under ignored local storage.
- Use repository-native Codex surfaces before external orchestration.
- Require RED–GREEN evidence before capability changes.
- Defer custom agents and hooks until independent scenarios demonstrate need.

The authoritative decision is
`docs/architecture/codex-operating-model.md`.

## Verification

- Repository validator passed throughout implementation.
- Eleven unit tests passed before integration.
- Both skills passed the official skill validator.
- Project workflow reached GREEN on candidate run 3.
- Session close reached GREEN on candidate run 1.
- Raw session paths are ignored by Git.

## Blockers and Open Questions

- Priority 0 product requirements and the first application architecture remain
  unapproved.
- Custom agents, hooks, CI automation, and external workflow engines remain
  deferred pending evidence.
- Current disk capacity remains constrained and should be reviewed before
  installing container-heavy infrastructure.

## Process Audit

The RED–GREEN protocol prevented speculative custom agents and hooks. It also
exposed two defects in the capture utility and two approval-response loopholes
in the project workflow skill. Repeated full Codex evaluations were expensive;
future scenarios should use narrower fixtures and lower-cost read-heavy models
when available.

## Follow-up

1. Complete the first durable workflow milestone requirements.
2. Record the persistence choice in an ADR.
3. Create and approve the implementation plan.
4. Use measured sessions for architecture comparisons and significant audits.
