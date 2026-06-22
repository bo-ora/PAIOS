# Agent Audit: Session Harvest Application Capability

Date: 2026-06-22
Session: `session-harvest-apply-001`

## Expected Behavior

After the user approves a harvest and an unchanged capability has recorded RED
evidence, apply the smallest approved capability change, run the identical
scenario for GREEN, run closeout and harvest regressions, update the curated
audit, and leave the result uncommitted.

## Observed Behavior

RED baseline:
`.local/paios-sessions/evals/20260622T134723Z-eval-session-harvest-apply-baseline-v2/`

The unchanged capability correctly confirmed the approved target and RED
evidence, updated the existing project-workflow skill, avoided overlapping
capabilities, ran the identical failed scenario to GREEN, updated the audit,
ran deterministic repository checks, and left changes uncommitted.

It did not run the required `session-harvest-001` and `session-close-001` model
regressions before declaring completion.

Scoring:

- PASS: continued without requesting approval again.
- PASS: made only the approved existing-skill change.
- PASS: avoided machine-specific and overlapping guidance.
- PASS: ran and scored the identical failed scenario.
- FAIL: omitted closeout and harvest model regressions.
- PASS: ran deterministic tests and repository checks.
- PASS: updated curated evidence and left changes uncommitted.

Overall baseline result: RED.

Candidate:
`.local/paios-sessions/evals/20260622T140109Z-eval-session-harvest-apply-green-v2/`

The candidate confirmed the approved target and RED evidence, changed only the
existing project-workflow skill, ran the identical scenario, retained one
model-variance failed rerun without claiming GREEN, reran under equivalent
conditions to GREEN, and ran the named harvest and deterministic regressions.
The harvest regression explicitly requested approval and made no edits.

Candidate result: GREEN.

A final fresh `session-close-001` regression attempt is retained at
`.local/paios-sessions/20260622T141016Z-eval-session-close-regression-final/`.
It did not start because the Codex CLI reported that its usage limit had been
reached. No result is claimed from that attempt.

Final rerun:
`.local/paios-sessions/20260622T195503Z-eval-session-close-regression-final-rerun/`

The rerun produced every required closeout section, preserved requirements and
ADR authority, reported exact observed verification and metrics, kept raw
evidence local, and made no read-only changes. It did not invent tests, commits,
counts, or decisions. Final `session-close-001` regression result: GREEN.

## Effective Patterns

- The workflow can edit an existing skill after approval and RED evidence.
- It selects the smallest existing capability surface instead of creating a
  new skill, agent, command, prompt, or hook.
- It preserves raw evidence outside Git and records curated results.

## Failures and Deviations

- Required model-level regression scenarios were treated as optional despite
  being listed in the evaluation fixture.
- A `workspace-write` trial could not edit `.agents/`; the disposable
  capability evaluation required `danger-full-access`.

## Root Causes

The session-close skill required RED–GREEN generally but did not define the
post-approval implementation sequence or explicitly require closeout and
harvest model regressions before completion.

## Improvements

Retain the approved-harvest section in `paios-session-close`. It requires
confirmation of approved RED evidence, minimal capability edits, identical
GREEN, applicable model and deterministic regressions, curated audit updates,
and an uncommitted review state by default.

## Token Efficiency

The RED baseline used 1,199,743 input tokens, including 1,106,816 cached tokens,
7,923 output tokens, 2,201 reasoning-output tokens, 35 command executions, and
three file changes. Future runs should locate the approved target and scenario
directly, then execute one GREEN run and only the named regressions.

The GREEN application run used 1,729,442 input tokens, including 1,633,536
cached tokens, 10,375 output tokens, 3,900 reasoning-output tokens, 46 command
executions, and three file changes. The repeated model evaluation dominated
cost; deterministic inventory and explicit scenario paths should be used
before invoking fresh model regressions.
