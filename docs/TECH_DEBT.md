# Technical Debt Register

Status: Active  
Last reviewed: 2026-06-24

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
| TD-001 | Tooling | `low` | `accepted` | Bootstrap validation and Codex capture utilities are Python while TypeScript is the preferred application language. Maintaining two languages adds minor setup and cognitive cost. | A Python utility needs substantial feature work, shared models with the TypeScript CLI, or causes onboarding friction. | Reassessed at Phase 1 approval; retain until the trigger occurs. |
| TD-002 | Delivery | `medium` | `open` | Work currently commits directly to `master`, reducing independent review and rollback isolation. Phase 1 recovery and personal-data changes required repeated independent review, so the original repayment trigger has occurred. | Trigger met during Phase 1 backup/restore acceptance. | Introduce branch/PR delivery before Phase 2 implementation or the next operational, migration, or personal-data change. |
| TD-003 | Automation | `low` | `resolved` | Repository tests and knowledge validation were local-only, allowing broken code or documents to be pushed unnoticed. GitHub Actions now enforces lint, typecheck, tests, build, CLI smoke checks, Python tests, repository validation, and whitespace checks. | Trigger met when the first executable CLI and stable validation commands existed. | Resolved in Phase 0 by commits `0f00730` and `f67d459`; CI runs `27936321778` and `27936349931` passed. |
| TD-004 | Roadmap | `low` | `accepted` | Mermaid phase labels duplicate the authoritative phase table and can drift. | A drift occurs, phase count grows materially, or the status CLI needs structured roadmap parsing beyond the agreed table format. | Reassessed at Phase 1 approval; retain until the trigger occurs. |
| TD-005 | Telegram | `low` | `accepted` | Phase 3 recall/summarize/view paths scope inconsistently by workspace: `recall` scopes `listRecords` to the originating chat/thread, but summarize-recent (`ask.ts` `summarizeRecords`), `/show <id>`, and `view:<id>` resolve records by id with no workspace filter. Harmless under the current single-user, single-allowlist deployment, but a multi-tenant or shared-chat deployment could surface another workspace's records. | A second workspace/chat is added to the allowlist, or any multi-user deployment is contemplated. | Scope summarize-recent and id-based fetches to the originating workspace (or document the single-user assumption in ADR-0008) before multi-workspace use. |
| TD-006 | Telegram | `low` | `accepted` | `parseCallbackPayload` (`messaging.ts`) bounds payloads by JS string length (`> 64`, UTF-16 code units) while the comment cites Telegram's 64-*byte* `callback_data` cap. Not exploitable today: valid payloads are `view:`/`sum:` + `[A-Za-z0-9-]+` (ASCII, 1 byte/char), so length equals byte count. | A future callback action allows non-ASCII payload content. | Switch the bound to a byte count (`Buffer.byteLength`) or correct the comment to say "length" if payloads stay ASCII-only. |
| TD-007 | Telegram | `low` | `accepted` | `formatRecordView` (`recall.ts`) bounds the record body to `maxChars` but the header and `…(truncated)` marker are not counted against that budget, so the returned string slightly exceeds `maxChars`. No real risk: the default (3500) plus a short header stays well under Telegram's 4096-char message limit. | The default `maxChars` is raised close to 4096, or the header grows materially. | Subtract the header/marker length from the body budget. |

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
