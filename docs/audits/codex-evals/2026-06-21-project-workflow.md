# Agent Audit: Project Workflow Capability

Date: 2026-06-21
Session: `project-workflow-001`

## Expected Behavior

Route a mixed architecture and implementation request through requirements,
architecture approval, planning, and verification. Name the durable repository
artifacts and avoid premature stack installation or capability changes.

## Observed Behavior

RED baseline:
`.local/paios-sessions/20260621T154826Z-eval-project-workflow-red-v3/`

The default agent inspected the repository and correctly stopped to ask which
first milestone boundary to use. It recommended a requirements-approval slice
and identified persistence, resumability, history, and approval gates as the
vertical-slice outcomes.

Scoring:

- PASS: separated requirements/architecture scope from implementation.
- PASS: made no changes in read-only mode.
- FAIL: did not name exact durable artifacts to create or update.
- FAIL: described outcomes but did not define concrete verification evidence.
- PASS: exposed the unresolved milestone choice.
- PASS: no prohibited behavior occurred.

Overall result: RED.

Candidate run 1:
`.local/paios-sessions/20260621T155021Z-eval-project-workflow-green/`

The new skill triggered and correctly identified the requirements-approval
vertical slice, but its final approval request again omitted exact artifact
paths and verification evidence. Candidate result: RED. The minimum follow-up
is to make those fields mandatory in every approval request.

Candidate run 2:
`.local/paios-sessions/20260621T155121Z-eval-project-workflow-green-v2/`

The final response still collapsed to a bare milestone question. Candidate
result: RED. The next revision adds an explicit response template to prevent
the approval question from discarding routing and verification context.

Candidate run 3:
`.local/paios-sessions/20260621T155224Z-eval-project-workflow-green-v3/`

The identical scenario produced a scoped recommendation, one explicit
persistence decision, exact requirement/ADR/plan/service paths, and restart,
checkpoint, transition, retry-history, and automated-test evidence. No
prohibited behavior occurred. Candidate result: GREEN.

## Effective Patterns

- Inspected repository context before selecting a milestone.
- Preferred a narrow vertical slice over the full technology stack.
- Asked for an explicit boundary decision instead of silently committing to one.

## Failures and Deviations

- The response did not route outputs to `docs/requirements/`,
  `docs/architecture/decisions/`, or `docs/plans/`.
- The response did not state tests or restart/resume evidence required before
  implementation could be considered complete.
- The run used 188,438 input tokens, including 120,704 cached tokens, for a
  short routing decision.

## Root Causes

- Repository guidance describes contribution mechanics but not the project
  knowledge lifecycle.
- The general workflow skills enforce planning but do not encode PAIOS artifact
  locations and promotion rules.
- The broad initial requirements file increases context cost when only Priority
  0 and the operating model are relevant.

## Improvements

Create a concise `paios-project-workflow` repository skill that routes work to
the correct durable artifacts, requires explicit approval gates, defines
verification evidence, and limits context reads to relevant sections.

## Token Efficiency

The candidate skill instructs the agent to read the operating model first, then
targeted requirement sections rather than whole document trees. The GREEN run
still consumed 266,603 input tokens (222,336 cached), which is higher than the
baseline because several mandatory general workflow skills also loaded and the
agent performed eight repository commands. Future optimization should evaluate
whether a narrower prompt or model profile reduces cost without weakening the
artifact and verification output. Subagents remain reserved for independent
research comparisons.
