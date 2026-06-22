# Project Status CLI Requirements

Status: Approved  
Date: 2026-06-21
Last updated: 2026-06-22

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
- roadmap path, current phase, current phase value, state, and next phase;
- technical-debt register path and unresolved item counts by severity;
- warnings for missing or malformed expected documents.

The command reads the current working tree, including uncommitted documents.

## Derivation Rules

- Git state comes from Git commands, not a copied state file.
- Pending plan work comes from unchecked Markdown task items.
- Unresolved questions come from the latest session’s
  `Blockers and Open Questions` section.
- The suggested next action is the first item under the latest session’s
  `Follow-up` section.
- Roadmap data comes from the authoritative phase table in `docs/ROADMAP.md`.
  The current phase is the single row with state `in-progress` or `blocked`.
  Between implementation phases, when neither state exists, the current phase
  is the first row with state `refining` or `approved`. The next phase is the
  following non-deferred row. More than one `in-progress` or `blocked` row is
  malformed roadmap data.
- The human report includes the repository-relative roadmap path
  `docs/ROADMAP.md` so supported terminals and clients can open it.
- Technical-debt counts come from unresolved rows in `docs/TECH_DEBT.md`.
- Missing or malformed content produces explicit warnings. The CLI must not
  invent replacement values.
- Repeated runs against unchanged repository contents produce equivalent data.

## Output

Human output must be concise and scannable. JSON output must expose the same
facts using stable field names and arrays.

Paths shown in output must be repository-relative. Output must not include raw
transcripts, secrets, hidden reasoning, or absolute user paths.

JSON output must use the following stable root shape. Values shown are
illustrative and must always be derived from the current working tree and
authoritative documents:

```json
{
  "git": {
    "branch": "master",
    "clean": false,
    "changed": 2,
    "staged": 0,
    "untracked": 1
  },
  "validation": {
    "passed": true,
    "errors": []
  },
  "latestSession": {
    "path": "docs/sessions/YYYY-MM-DD-HHMM-role-title.md",
    "date": "YYYY-MM-DD",
    "role": "requirements",
    "status": "completed"
  },
  "unresolvedQuestions": [],
  "pendingPlanItems": [
    {
      "path": "docs/plans/YYYY-MM-DD-plan.md",
      "text": "Implement the next verified task."
    }
  ],
  "nextAction": "Implement the next verified task.",
  "roadmap": {
    "path": "docs/ROADMAP.md",
    "currentPhase": {
      "id": 0,
      "name": "Development Operating System",
      "state": "in-progress",
      "value": "PAIOS can be developed consistently and resumed after time away."
    },
    "nextPhase": {
      "id": 1,
      "name": "Local Knowledge Loop",
      "state": "refining",
      "value": "Capture personal knowledge locally and find it later with sources."
    }
  },
  "technicalDebt": {
    "path": "docs/TECH_DEBT.md",
    "unresolvedBySeverity": {
      "critical": 0,
      "high": 0,
      "medium": 1,
      "low": 3
    }
  },
  "warnings": []
}
```

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
- Roadmap output identifies the current and next rows from `docs/ROADMAP.md`
  and includes the repository-relative roadmap path.
- Technical-debt output reports unresolved counts from `docs/TECH_DEBT.md`.
- Validation failure returns `1`; warnings alone return `0`.
- Fixtures cover clean/dirty Git state, missing sections, unchecked plans,
  latest-session selection, roadmap parsing, debt counts, warnings, and failed
  validation.
