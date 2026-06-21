---
name: paios-project-workflow
description: Use when a PAIOS task mixes requirements, research, architecture, planning, implementation, testing, documentation, or monitoring and the next authoritative artifact or approval gate is unclear.
---

# PAIOS Project Workflow

Keep decisions durable without turning every session into infrastructure work.

## Route the Objective

1. Read `docs/architecture/codex-operating-model.md`.
2. Read only the relevant sections of `docs/requirements/INITIAL.md`.
3. Classify the current role: requirements, research, architecture, planning,
   implementation, testing, monitoring, documentation, or audit.
4. State goal, constraints, done criteria, and unresolved decisions.
5. Select the next authoritative artifact:

| Need | Artifact |
| --- | --- |
| Product behavior or constraint | `docs/requirements/` |
| Consequential technical choice | `docs/architecture/decisions/` |
| Source-backed comparison | `docs/research/` |
| Approved execution sequence | `docs/plans/` |
| Session outcome | `docs/sessions/` |
| Agent/process improvement | `docs/audits/` |

Session summaries are evidence, not requirements or ADRs.

## Approval Gates

Do not implement while material requirements or architecture choices remain
unapproved. Present alternatives, recommendation, consequences, and the exact
decision required. Continue autonomously only for reversible work inside an
approved boundary.

Every approval request must include:

- **Decision:** the exact choice required;
- **Artifact:** exact file paths to create or update after approval;
- **Verification:** concrete tests or evidence required for completion.

Do not reduce the final response to a bare question that drops these fields.

Before yielding for approval, use this exact structure:

```markdown
Recommendation: <recommended choice and boundary>
Decision: <one explicit choice required from the user>
Artifact:
- `<exact/path>`
Verification:
- `<specific test or observable evidence>`
```

If the request is read-only, describe the paths and evidence without creating
them.

## Verification

Before calling a milestone complete, name and run evidence appropriate to it:

- tests for behavior;
- restart/resume checks for durability;
- failure/retry checks for workflows;
- `python3 scripts/validate_repository.py .` for knowledge artifacts;
- `git diff --check` and a final diff review.

Record exact evidence in the related plan, session summary, or audit.

## Capability Changes

Before changing a Codex skill, plugin, agent, hook, command, prompt, or
description, follow `evals/codex/README.md`. Do not change the capability when
the unchanged baseline already passes.

## Token Discipline

Read targeted sections, not whole document trees. Use subagents only for
independent read-heavy research or review, and require concise summaries rather
than raw logs.
