# Phase 0: Development Operating System

Status: Approved  
Date: 2026-06-21

## Purpose

Phase 0 establishes a simple, repeatable way to develop PAIOS with Codex. It
must prove the workflow by delivering one small, useful product feature through
requirements, architecture, planning, implementation, testing, documentation,
and session audit.

Phase 0 is not the PAIOS runtime, autonomous SDLC platform, workflow engine,
multi-agent system, or durable task service.

## Deliverables

1. Repository knowledge structure for requirements, ADRs, plans, research,
   sessions, operations, and audits.
2. RED–GREEN evaluation protocol for Codex capability changes.
3. Local-only raw Codex event capture and curated session summaries in Git.
4. Repository validation for knowledge artifacts.
5. Evaluated PAIOS project-workflow and session-close skills.
6. A TypeScript Project Status CLI exposed as `./paios status`.
7. One complete audited delivery cycle using the status CLI as the product
   change.
8. A resumable session handoff identifying Phase 1 candidates.

## Functional Requirements

- The development workflow must preserve approved decisions in authoritative
  repository documents.
- A future Codex session must be able to resume from committed artifacts without
  requiring the raw transcript.
- Meaningful sessions must record outcomes, evidence, unresolved questions,
  process deviations, and follow-up.
- Changes to Codex skills, plugins, agents, hooks, commands, prompts, or their
  descriptions must have documented RED and GREEN evaluations.
- Phase 0 must deliver and verify the Project Status CLI requirements in
  `docs/requirements/project-status-cli.md`.

## Non-Functional Requirements

- Local-first: raw sessions, events, and metrics remain outside Git.
- Simple: no database, daemon, workflow engine, agent framework, or cloud
  service is required.
- Portable: a fresh clone requires only Git, Node.js, and npm for the CLI.
- Deterministic: repository validation and CLI output must not depend on AI or
  network access.
- Replaceable: documents and scripts remain usable if Codex or its extensions
  change.
- Auditable: completion claims cite tests, validation, diffs, or source links.

## Out of Scope

- Telegram, health, wearable, knowledge-search, CRM, and dashboard features.
- Durable autonomous execution, retries, scheduling, or approval services.
- Model routing, local models, LangGraph, Temporal, MongoDB, or LiteLLM.
- Custom Codex agents or hooks without separate RED evidence.
- Rewriting working Python bootstrap utilities solely for language consistency.

## Acceptance Criteria

- All Phase 0 documents pass repository validation.
- The status CLI passes type checking, automated tests, and production build.
- `./paios status` and `./paios status --json` work offline on a clean clone
  after `npm ci && npm run build`.
- The CLI never changes repository state.
- One curated session summary and audit document the complete delivery cycle.
- The final handoff names unresolved decisions and the recommended next phase.
