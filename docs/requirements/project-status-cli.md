# Project Status CLI Requirements

Status: Approved  
Date: 2026-06-21

## Objective

Provide a fast, read-only view of PAIOS development health using Git and
repository Markdown as the source of truth.

## Invocation

```bash
./paios status
./paios status --json
```

The repository-local `paios` wrapper runs compiled TypeScript from `dist/`.

## Status Data

The command must report:

- current Git branch;
- clean or dirty working-tree state;
- changed, staged, and untracked file counts;
- repository knowledge validation result;
- latest session summary by filename timestamp;
- unresolved questions from the latest session;
- unchecked items from plans under `docs/plans/`;
- first follow-up action from the latest session;
- warnings for missing or malformed expected documents.

The command reads the current working tree, including uncommitted documents.

## Derivation Rules

- Git state comes from Git commands, not a copied state file.
- Pending plan work comes from unchecked Markdown task items.
- Unresolved questions come from the latest session’s
  `Blockers and Open Questions` section.
- The suggested next action is the first item under the latest session’s
  `Follow-up` section.
- Missing or malformed content produces explicit warnings. The CLI must not
  invent replacement values.
- Repeated runs against unchanged repository contents produce equivalent data.

## Output

Human output must be concise and scannable. JSON output must expose the same
facts using stable field names and arrays.

Paths shown in output must be repository-relative. Output must not include raw
transcripts, secrets, hidden reasoning, or absolute user paths.

## Exit Codes

- `0`: repository validation passed; warnings may be present.
- `1`: repository validation failed.
- `2`: command usage or an unrecoverable execution error.

The command prints all available status information before exiting `1`.

## Technical Constraints

- TypeScript with ESM modules.
- Standard TypeScript compilation to `dist/`.
- Node.js built-in test runner.
- No runtime npm dependencies.
- Existing `scripts/validate_repository.py` may be invoked as a subprocess.
- No AI, API, network, database, daemon, or background process.
- The command must not write files or mutate Git state.

## Acceptance Criteria

- `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- `./paios status` produces human-readable output.
- `./paios status --json` produces valid JSON with equivalent status.
- Dirty working-tree changes appear immediately.
- Validation failure returns `1`; warnings alone return `0`.
- Fixtures cover clean/dirty Git state, missing sections, unchecked plans,
  latest-session selection, warnings, and failed validation.
