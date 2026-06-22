# Phase 0 CI, Lint, and Closeout Plan

Status: Approved
Date: 2026-06-22

## Goal

Add maintained TypeScript linting and GitHub Actions enforcement, resolve the
triggered automation debt, correct stale delivery evidence, and complete the
Phase 0 roadmap review if all exit criteria remain satisfied.

## Tooling Decision

Use ESLint 9 flat configuration with `@eslint/js` and `typescript-eslint`
type-checked recommended and stylistic presets. Airbnb's TypeScript preset is
not selected because its maintained package does not support ESLint 9, while
flat config is the ESLint default and the TypeScript ESLint project recommends
its type-checked shared configurations.

## Constraints

- Keep dependencies development-only; the CLI retains zero runtime npm
  dependencies.
- Do not add a formatter, framework, service, database, hook, or custom agent.
- CI must run the same deterministic commands documented for local use.
- Preserve direct-to-`master` bootstrap workflow until TD-002 is separately
  triggered.

## Tasks

### Task 1: Establish RED lint baseline

- [x] Run `npm run lint` before adding the script and record failure.
- [x] Add ESLint and maintained TypeScript ESLint packages.
- [x] Create a flat ESM configuration using type-aware recommended and
      stylistic presets.

### Task 2: Make lint GREEN

- [x] Add a deterministic `lint` npm script.
- [x] Run lint and fix findings without changing behavior.
- [x] Run typecheck and tests after lint-driven edits.

### Task 3: Add CI enforcement

- [x] Create `.github/workflows/ci.yml`.
- [x] Run npm clean install, lint, typecheck, tests, build, Python tests,
      repository validation, and whitespace validation.
- [x] Keep workflow permissions read-only.

### Task 4: Update durable project state

- [x] Update contributor and operational commands.
- [x] Correct the stale Project Status CLI plan and session push blocker.
- [x] Mark TD-003 resolved after local workflow validation and successful GitHub
      Actions execution.
- [x] Create a phase-boundary roadmap review.
- [x] Mark Phase 0 completed only when every exit criterion and CI run passes.

### Task 5: Verify and deliver

- [x] Run `npm ci`, lint, typecheck, tests, and build.
- [x] Run both CLI modes.
- [x] Run Python tests and repository validation.
- [x] Run `git diff --check`.
- [x] Review the full diff and resolve material findings.
- [x] Commit and push the Phase 0 completion records to `master`.
- [x] Confirm the GitHub Actions workflow succeeds.
