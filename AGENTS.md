# Repository Guidelines

## Project Structure & Module Organization

PAIOS is currently in its bootstrap phase. The product vision and initial technical direction live in `docs/requirements/INITIAL.md`; treat that file as input for refinement, not as an approved implementation specification. Keep future documentation under `docs/`, using `docs/architecture/` for architecture records and `docs/requirements/` for requirements.

The repository-local TypeScript CLI source lives under `src/paios/`, with its
Node test suite under `tests/paios/`. Place future Python services in
`services/<service-name>/`, shared packages in `packages/`, infrastructure in
`infra/`, and workflow definitions in `workflows/`. Store only reproducible
configuration and templates in Git; generated `dist/` output and runtime data
belong in ignored paths.

## Codex Working Model

Give each session one primary role: requirements, research, architecture,
planning, implementation, testing, monitoring, documentation, or audit. State
the goal, relevant files, constraints, and done criteria. Use
`$paios-project-workflow` when the next artifact or approval gate is unclear,
and `$paios-session-close` to create a resumable handoff.

Approved knowledge belongs in requirements, ADRs, and plans. Session summaries
under `docs/sessions/` are evidence only. Promote stable findings rather than
treating transcripts as project truth. Keep raw Codex events under
`.local/paios-sessions/`; never commit them.

Before changing any Codex skill, plugin, agent, hook, command, prompt, or
description, follow `evals/codex/README.md`: run the unchanged scenario, record
RED, make the smallest change, and rerun the identical scenario for GREEN. If
the baseline passes, do not change the capability.

## Build, Test, and Development Commands

Use Node.js 20 or newer. The Project Status CLI has no runtime npm dependencies;
TypeScript and Node type definitions are development dependencies:

- `git status --short --branch` — review local changes and the active branch.
- `git diff --check` — detect whitespace errors before committing.
- `npm ci` — install pinned CLI development tooling.
- `npm run typecheck` — type-check CLI source and tests.
- `npm test` — compile and run the Node built-in test suite.
- `npm run build` — compile the CLI into ignored `dist/` output.
- `./paios status` and `./paios status --json` — inspect current project state.
- `python3 -m unittest discover -s tests -v` — run repository tooling tests.
- `python3 scripts/validate_repository.py .` — validate knowledge artifacts.
- `python3 scripts/capture_codex_session.py NAME PROMPT` — run a measured,
  read-only Codex session with ignored local JSONL evidence.
- `docker compose config` — validate Compose configuration once `compose.yaml` is added.
- `pytest` — run Python tests once a service defines its dependencies.

When adding a service, document its exact bootstrap, run, lint, and test commands in that service’s README.

## Coding Style & Naming Conventions

Use strict TypeScript with small modules and explicit public types. Keep parsing
and formatting pure where practical, with filesystem and subprocess operations
at module boundaries. Use four-space indentation for Python, type annotations
for public interfaces, `snake_case` for Python files and functions,
`PascalCase` for classes, and `kebab-case` for service and directory names.
Keep provider-specific code behind stable adapters; core logic must not depend
directly on one AI, database, wearable, or agent vendor.

## Testing Guidelines

Use Node's built-in test runner for the TypeScript CLI and `pytest` for future
Python components. Name Python files `test_<module>.py` and tests
`test_<behavior>`. Cover normal behavior, failure/retry paths, persistence
boundaries, and adapter contracts. Every bug fix should include a regression
test. Integration tests must use disposable repositories, containers, or
isolated test databases.

Before declaring completion, run relevant tests, repository validation,
`git diff --check`, and review the full diff. Record exact evidence in the
related plan or session summary.

## Commit & Pull Request Guidelines

Use concise imperative subjects such as `docs: refine workflow requirements` or `feat: add model-router interface`. During the bootstrap phase, commit directly to `master` to keep the workflow simple; introduce feature branches and pull requests when parallel development or review requirements justify them. Each change should explain its scope, verification performed, linked requirements, and any configuration or migration steps. Include screenshots only for user-facing changes.

## Security & Configuration

Never commit secrets, tokens, personal health data, database dumps, or populated `.env` files. Commit `.env.example` templates with safe placeholders. Preserve the local-first, portable, and replaceable architecture defined in the requirements.
