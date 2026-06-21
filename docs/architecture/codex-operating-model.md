# Codex Operating Model

Status: Approved  
Date: 2026-06-21

## Objective

Use Codex as the primary development and research environment for PAIOS while
keeping project knowledge durable, reviewable, local-first, and inexpensive to
maintain. The repository is the source of truth for approved requirements,
architecture decisions, plans, research, implementation evidence, and curated
session audits.

## Principles

- One Codex thread has one primary role and measurable objective.
- Stable knowledge belongs in Git; transient reasoning and raw events do not.
- Documentation changes travel with the implementation or decision they explain.
- The main thread owns requirements and decisions. Subagents are reserved for
  independent, read-heavy research or review.
- Existing Codex behavior is evaluated before adding or changing capabilities.
- Automation starts as repository scripts and skills. External orchestration is
  introduced only when repository-native workflows are demonstrably insufficient.

## Knowledge Model

| Artifact | Location | Authority |
| --- | --- | --- |
| Product requirements | `docs/requirements/` | Approved behavior and constraints |
| Architecture decisions | `docs/architecture/decisions/` | Accepted technical decisions |
| Plans | `docs/plans/` | Approved implementation sequence |
| Research | `docs/research/` | Evidence, alternatives, and source links |
| Session summaries | `docs/sessions/` | Curated evidence from meaningful sessions |
| Agent audits | `docs/audits/` | Process failures and improvement proposals |
| Raw Codex events | `.local/paios-sessions/` | Local-only diagnostic evidence |
| Evaluation scenarios | `evals/codex/scenarios/` | Repeatable capability tests |

Session summaries are not specifications. Stable conclusions must be promoted
into requirements, ADRs, plans, `AGENTS.md`, or a repository skill.

## Session Lifecycle

1. Choose one role: requirements, research, architecture, planning,
   implementation, testing, monitoring, documentation, or audit.
2. State goal, context, constraints, and done criteria.
3. Use Goal mode for long measurable work.
4. Keep decision-making in the main thread. Delegate only independent work.
5. Verify outputs with tests, commands, diffs, or cited sources.
6. Close a meaningful session with a structured summary and optional audit.
7. Promote durable findings and commit them with related changes.

## Capability Change Protocol

Before changing a Codex skill, plugin, agent, hook, command, prompt, or its
description:

1. Add a versioned scenario describing the prompt, fixture, environment,
   assertions, and prohibited behavior.
2. Run it in a fresh session against the unchanged capability.
3. Record the RED baseline. If it passes, do not change the capability.
4. Make the smallest candidate change only after a relevant failure.
5. Re-run the identical scenario under equivalent conditions.
6. Accept only a GREEN result and run boundary/regression scenarios.
7. Keep raw output local; commit the curated evaluation report.

Model-dependent evaluations require explicit scoring and repeated runs when one
result is not sufficient to distinguish improvement from sampling variation.

## Initial Codex Surface

- `AGENTS.md`: durable repository rules and definition of done.
- `.agents/skills/`: focused project workflows, created only after RED evidence.
- `codex exec --json`: local raw event capture for scripted sessions.
- Repository validation scripts: deterministic checks for document structure.
- Built-in explorer/worker agents: preferred until evaluations justify custom
  agents.
- Hooks: deferred until an evaluation proves scripted capture and session-close
  workflows cannot meet the requirement.

Chronicle is excluded because it is unavailable in the current region and its
screen-derived memories are stored unencrypted. Low-adoption third-party audit
skills are excluded from this privacy-sensitive project.

## Token and Context Policy

- Start new threads when the primary role or objective changes.
- Prefer file references and summaries over pasted logs.
- Use compact repository skills with progressive disclosure.
- Use lower-cost agents for read-heavy scans and stronger reasoning only for
  ambiguous decisions, architecture, debugging, and final review.
- Parallelize independent research; avoid parallel edits to shared files.
- Audit repeated exploration, unnecessary tool calls, compaction, and
  unverified conclusions as token-efficiency failures.

## Adoption Sequence

1. Establish document schemas and validation.
2. Establish RED–GREEN Codex evaluation records.
3. Add a project-workflow skill only if baseline scenarios fail.
4. Add a session-close skill only if baseline scenarios fail.
5. Add custom agents or hooks only after separate RED evidence.
6. Reassess external orchestration after real workflow volume demonstrates need.
