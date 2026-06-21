# Project Status CLI Implementation Plan

Status: Approved
Date: 2026-06-22

## Goal

Deliver the Phase 0 TypeScript Project Status CLI through a strict test-first
cycle. The completed `./paios status` and `./paios status --json` commands must
report current Git and repository-document state without network access,
runtime dependencies, or repository mutation.

## Authoritative Inputs

- `docs/requirements/phase-0-development-operating-system.md`
- `docs/requirements/project-status-cli.md`
- `docs/architecture/decisions/0001-project-status-cli-architecture.md`
- `docs/ROADMAP.md`
- `docs/TECH_DEBT.md`
- `AGENTS.md`

## Architecture

Compile ESM TypeScript from `src/paios/` into ignored `dist/` output. Keep the
core as small pure parsers and formatters, with filesystem and subprocess access
at the boundary. The CLI entry point resolves the repository root, gathers Git
state, reads Markdown, performs the repository knowledge checks natively in
Node, builds one typed status model, and renders either human text or the
required JSON shape.

Tests use Node's built-in test runner against disposable repository fixtures.
Integration tests initialize temporary Git repositories and install fixture
documents so production code reads realistic current-working-tree state.

## Constraints

- TypeScript, ESM, `tsc`, and Node's built-in test runner.
- No runtime npm dependencies.
- Read-only, deterministic, offline behavior.
- Repository-relative paths only in output.
- Exit `0` when validation passes, `1` when validation fails, and `2` for usage
  or unrecoverable execution errors.
- No frameworks, databases, AI calls, hooks, agents, or unrelated abstractions.
- No Codex capability changes.

## Done Criteria

- Every behavior in `docs/requirements/project-status-cli.md` has automated
  coverage, including malformed and missing documents.
- RED is observed before production implementation for each behavior group.
- `npm ci`, type checking, tests, and build pass.
- Both CLI modes work against the real repository and expose equivalent facts.
- A before/after repository-state check demonstrates read-only behavior.
- Python repository tests and validation pass.
- Documentation reflects exact bootstrap, build, test, and invocation commands.
- An independent final review has no unresolved critical or high findings.
- The delivery cycle is recorded under `docs/sessions/`.

## Implementation Tasks

### Task 1: Establish reproducible TypeScript tooling

**Files:**

- Create `package.json`.
- Create `package-lock.json`.
- Create `tsconfig.json`.
- Create `tsconfig.test.json`.
- Modify `.gitignore`.

- [x] Add only TypeScript and Node type definitions as development dependencies.
- [x] Define `typecheck`, `build`, and `test` scripts using `tsc` and
      `node --test`.
- [x] Configure strict ESM compilation from `src/paios/` and tests into
      disposable build directories.
- [x] Ignore generated CLI and test output.
- [x] Run `npm ci` and record the initial expected test/build state.

### Task 2: Specify status derivation with failing tests

**Files:**

- Create `tests/paios/fixtures.ts`.
- Create `tests/paios/status.test.ts`.

- [x] Add disposable fixture helpers for Git state and authoritative Markdown.
- [x] Add failing tests for clean and dirty Git counts, including staged,
      changed, and untracked files.
- [x] Add failing tests for latest-session filename selection and metadata.
- [x] Add failing tests for unresolved questions, first follow-up action, and
      unchecked plan items.
- [x] Add failing tests for roadmap current/next phase parsing and malformed
      active-phase states.
- [x] Add failing tests for unresolved technical-debt counts by severity.
- [x] Add failing tests for missing/malformed documents and stable warnings.
- [x] Add failing tests for validator success and failure.
- [x] Run the test suite and record RED because production modules are absent.

### Task 3: Implement the typed status model and readers

**Files:**

- Create `src/paios/types.ts`.
- Create `src/paios/git.ts`.
- Create `src/paios/markdown.ts`.
- Create `src/paios/status.ts`.
- Create `src/paios/validation.ts`.

- [x] Implement Git status collection using read-only Git subprocesses.
- [x] Implement focused Markdown section and table parsing without a framework.
- [x] Implement latest-session, pending-plan, roadmap, and debt derivation.
- [x] Implement the existing repository knowledge checks natively in Node.
- [x] Accumulate explicit warnings rather than inventing missing values.
- [x] Run tests until the status derivation suite is GREEN.
- [x] Run type checking before proceeding.

### Task 4: Specify and implement CLI behavior

**Files:**

- Create `tests/paios/cli.test.ts`.
- Create `src/paios/format.ts`.
- Create `src/paios/cli.ts`.
- Create executable `paios`.

- [x] Add failing tests for accepted invocations, rejected usage, JSON shape,
      human output, validation exit codes, and missing compiled output.
- [x] Add an equivalence assertion that human and JSON modes are rendered from
      the same status model.
- [x] Implement concise human formatting and stable pretty-printed JSON.
- [x] Implement `status` and `status --json` argument handling.
- [x] Implement the repository-local wrapper with a clear pre-build error.
- [x] Run tests until the CLI suite is GREEN.
- [x] Build and exercise both invocation modes against fixtures.

### Task 5: Prove read-only behavior and document operation

**Files:**

- Modify `README.md`.
- Modify `AGENTS.md`.
- Modify `docs/operations/codex-workflow.md` if operational command guidance is
  needed.

- [x] Add exact Node/npm prerequisites and bootstrap, typecheck, test, build,
      and invocation commands.
- [x] Document that `dist/` is generated and intentionally untracked.
- [x] Snapshot Git status and tracked-file hashes before and after both CLI
      modes to verify no repository mutation.
- [x] Confirm operation with network access unavailable after dependencies are
      installed.
- [x] Mark completed plan checkboxes only after corresponding evidence passes.

### Task 6: Complete verification and independent review

**Files:**

- Create `docs/sessions/<timestamp>-implementation-project-status-cli.md`.
- Modify `docs/TECH_DEBT.md` only if verification resolves or changes a listed
  debt item.

- [x] Run `npm ci`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `./paios status`.
- [x] Run `./paios status --json` and parse the result as JSON.
- [x] Run `python3 -m unittest discover -s tests -v`.
- [x] Run `python3 scripts/validate_repository.py .`.
- [x] Run `git diff --check`.
- [x] Review the full diff for scope, privacy, portability, determinism, and
      accidental generated files.
- [x] Obtain an independent read-only final review and resolve all material
      findings.
- [x] Record exact evidence, remaining questions, and follow-up in the session
      closeout.
- [x] Commit verified work directly to `master`.
- [ ] Push the verified commit to `origin/master` after GitHub authentication
      is available.

## Plan Review

The approved requirements determine the status fields, JSON structure,
derivation sources, exit codes, technology choices, and scope exclusions.
Implementation choices in this plan are reversible and remain inside ADR-0001.
No material product or architecture decision is unresolved.

The primary execution risks are parser behavior on malformed Markdown,
cross-platform Git status interpretation, and accidentally testing generated
output instead of source behavior. Disposable fixtures, explicit warning tests,
porcelain Git parsing, and clean `npm ci` verification address those risks.
