# Technical Debt Register

Status: Active  
Last reviewed: 2026-06-22

This register tracks deliberate shortcuts, maintainability risks, and deferred
quality work. Planned features are not technical debt unless an existing
implementation creates a concrete future cost or risk.

## Prioritization

| Severity | Meaning | Required response |
| --- | --- | --- |
| `critical` | Active security, privacy, data-loss, or delivery risk. | Stop affected work and resolve immediately. |
| `high` | Material reliability or architecture risk that compounds quickly. | Resolve before the affected phase completes. |
| `medium` | Real maintenance or migration cost with a workable current path. | Review at each phase boundary and repay when its trigger occurs. |
| `low` | Local inconvenience or minor inconsistency. | Repay opportunistically; do not block user value. |

## Debt Items

| ID | Area | Severity | Status | Debt and impact | Repayment trigger | Target |
| --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Tooling | `low` | `accepted` | Bootstrap validation and Codex capture utilities are Python while TypeScript is the preferred application language. Maintaining two languages adds minor setup and cognitive cost. | A Python utility needs substantial feature work, shared models with the TypeScript CLI, or causes onboarding friction. | Reassess during Phase 1. |
| TD-002 | Delivery | `medium` | `accepted` | Work currently commits directly to `master`, reducing independent review and rollback isolation. This is intentional for single-user bootstrap speed. | Parallel development begins, external contributors join, or changes become operationally risky. | Before Phase 1 implementation or earlier if triggered. |
| TD-003 | Automation | `low` | `open` | Repository tests and knowledge validation are local-only; GitHub does not currently enforce them. Broken documents could be pushed unnoticed. | The first executable CLI is implemented and stable validation commands exist. | Phase 0 exit. |
| TD-004 | Roadmap | `low` | `accepted` | Mermaid phase labels duplicate the authoritative phase table and can drift. | A drift occurs, phase count grows materially, or the status CLI needs structured roadmap parsing beyond the agreed table format. | Reassess at Phase 1 approval. |

## Status Definitions

- `open`: accepted debt awaiting prioritization or repayment.
- `accepted`: consciously retained until its trigger occurs.
- `in-progress`: repayment work has started.
- `resolved`: repayment is verified; retain the row for history.
- `obsolete`: the affected implementation was removed or replaced.

## Rules

- Give each item a stable ID.
- Record impact and a concrete repayment trigger; avoid vague “clean up later”
  entries.
- Link debt repayment to requirements, ADRs, plans, commits, or audits when work
  begins.
- Review critical/high items continuously and all items at roadmap reviews.
- Do not use this register as a general feature backlog.
