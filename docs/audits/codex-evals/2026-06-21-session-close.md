# Agent Audit: Session Close Capability

Date: 2026-06-21
Session: `session-close-001`

## Expected Behavior

Produce a curated, resumable session summary containing outcome, artifacts,
decisions, verification, blockers, process audit, follow-up, and concrete
token-efficiency observations. Keep raw events outside Git and avoid changing
authoritative requirements or architecture.

## Observed Behavior

RED baseline:
`.local/paios-sessions/20260621T155404Z-eval-session-close-red/`

The default workflow correctly routed the requested records to `docs/sessions/`
and `docs/audits/` and preserved the rule that raw events remain local. It then
attempted a file patch despite the read-only fixture, and its final response only
listed intended files rather than producing the structured closeout content.

Scoring:

- FAIL: did not provide separated summary sections.
- PASS: kept authoritative decisions in the existing architecture document.
- FAIL: did not provide concrete token-efficiency observations.
- PASS: did not claim unavailable token counts or hidden reasoning.
- PASS: retained raw events outside Git.
- PASS: did not invent tests, commits, counts, or source links.

Overall result: RED.

Candidate run:
`.local/paios-sessions/20260621T155659Z-eval-session-close-green/`

The identical scenario triggered the session-close skill and returned all eight
required sections without attempting a write. It linked decisions to the
approved architecture, distinguished observed evidence from unavailable
metrics, preserved raw-event privacy, identified the uncommitted candidate
state, and supplied concrete token-efficiency improvements. No prohibited
behavior occurred. Candidate result: GREEN.

## Effective Patterns

- Correctly identified session and audit artifact categories.
- Did not promote the session record into requirements or architecture.
- Reported the read-only blocker honestly.

## Failures and Deviations

- Attempted a write even though the scenario declared a read-only sandbox.
- Replaced the requested closeout with a statement about what it would contain.
- Did not distinguish observed evidence from unavailable metrics.

## Root Causes

- The project-workflow skill routes artifact types but does not define the
  session-close content contract.
- The general agent prioritized file creation over returning a complete
  read-only draft.

## Improvements

Create a concise `paios-session-close` skill that requires a complete closeout
in the response when writes are unavailable, distinguishes facts from
inferences, and uses only observed token/tool metrics.

## Token Efficiency

The baseline used 191,021 input tokens, including 178,944 cached tokens, and 10
command executions before returning a short blocker. The GREEN run used 122,710
input tokens, including 101,376 cached tokens, and seven command executions
while producing the full closeout. Future runs should continue limiting reads
to the current diff, relevant artifacts, available metrics, and templates.
