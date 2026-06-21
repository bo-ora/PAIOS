# ADR-0001: Project Status CLI Architecture

Status: Accepted
Date: 2026-06-21

## Context

Phase 0 needs one small product feature that proves the complete development
workflow while providing immediate daily value. The feature must remain easy to
evolve, work offline, avoid additional infrastructure, and align with the
project preference for TypeScript.

## Decision

Build a repository-local TypeScript CLI using ESM and the standard TypeScript
compiler. Source lives under `src/paios/`, tests use Node’s built-in test runner,
and production output is compiled to `dist/`.

The executable wrapper `./paios` runs the compiled entry point. The CLI derives
status from Git and repository Markdown in the current working tree. It has no
runtime npm dependencies and may invoke the existing Python repository
validator as a subprocess.

## Alternatives Considered

- ESM JavaScript with JSDoc: simpler tooling, but rejected because TypeScript is
  the project default from the start.
- Native Node TypeScript execution: avoids compilation, but depends on recent
  Node type-stripping behavior and does not provide full type checking.
- `tsx` direct execution: convenient for development, but adds a runtime
  development dependency to the invocation path.
- Rewrite all Python bootstrap utilities first: improves language consistency,
  but delays the first useful feature without adding required capability.
- CLI framework or plugin system: offers extensibility, but adds premature
  abstractions for one command.

## Consequences

Positive:

- Strong static checking and a clear production build.
- No runtime package installation beyond Node.js itself.
- Small, testable modules can evolve into additional `paios` commands.
- Git and Markdown remain the authoritative state.

Negative:

- Contributors must build after source changes.
- A fresh clone requires npm dependency installation for TypeScript tooling.
- Phase 0 temporarily contains both TypeScript and Python utilities.

Operational:

- Commit `package-lock.json` for reproducible tooling.
- Do not commit `dist/` unless a later portability requirement justifies it.
- `./paios` must fail clearly when compiled output is absent.

## Validation

- Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
- Verify both CLI output modes against repository fixtures.
- Verify the CLI makes no file or Git changes.
- Revisit this ADR if runtime dependencies, cross-platform packaging, or global
  installation become concrete requirements.
