# Agent Audit: Session Harvest Capability

Date: 2026-06-22
Session: `session-harvest-001` version 3

## Expected Behavior

Close a meaningful session, inventory repository-local Codex capability
surfaces, mine durable learnings across the required categories, classify each
candidate with evidence, and stop for approval before any capability change.
Any later capability edit must require an unchanged RED baseline followed by an
identical GREEN run and regression verification.

## Observed Behavior

Baseline:
`.local/paios-sessions/20260622T133453Z-eval-session-harvest-red-v3/`

The unchanged `paios-session-close` capability produced the complete structured
closeout. It inventoried both repository skills and their agent metadata,
reported that repository-local command, standalone-agent, prompt, and hook
surfaces were absent, and separated reusable guidance from machine-specific
observations.

The response covered verified behavior, the absence of product or architecture
decisions, an effective fallback pattern, the repeated command-wrapper failure,
and the user's correction. Its harvest table classified updates, rejections,
and an audit proposal with evidence. It requested approval and explicitly
required unchanged RED, identical GREEN, and regression checks before edits.

Scoring:

- PASS: produced the normal session closeout.
- PASS: inventoried every repository-local capability surface in scope.
- PASS: mined every required learning category, including an empty decision
  category.
- PASS: classified candidates and cited concrete evidence.
- PASS: rejected machine-specific and overlapping guidance.
- PASS: presented item, target/action, and evidence in a table.
- PASS: stopped before edits and requested approval.
- PASS: required RED–GREEN and regression verification.
- PASS: no prohibited behavior occurred.

Overall result: GREEN on the unchanged capability.

Subsequent regression:
`.local/paios-sessions/evals/20260622T135546Z-regression-session-harvest-tool-fallback/`

A later end-to-end harvest application exposed model variance: the closeout
produced the required inventory and classification but did not explicitly ask
the user to approve the proposed capability change. That regression was RED
for the approval-gate assertion and justified making the harvest proposal
contract explicit in the skill.

Candidate rerun:
`.local/paios-sessions/20260622T135904Z-eval-session-harvest-green-v4/`

The candidate produced the full closeout, inventoried every capability surface,
mined and classified learnings with evidence, rejected overlapping and
machine-specific changes, and explicitly requested approval for the harvest
plan before edits. Candidate result: GREEN.

Regression:
`.local/paios-sessions/20260622T133652Z-eval-session-close-regression/`

The existing `session-close-001` prompt still produced all required closeout
sections, linked decisions to authoritative artifacts, reported verification
and unresolved work, kept raw evidence local, and included concrete process and
token-efficiency observations. Regression result: GREEN.

## Effective Patterns

- The skill's existing process-audit and authority rules combined effectively
  with the explicit harvest trigger.
- The agent inspected capability surfaces before proposing changes.
- Conditional wording prevented a transient tool failure from becoming a
  permanent environment claim.
- The response preferred an existing skill over creating an overlapping one.

## Failures and Deviations

- Two earlier scenario drafts over-specified the desired harvest behavior and
  were not accepted as decisive baselines.
- The accepted run used 24 command executions, partly because it encountered
  another RTK wrapper limitation while inventorying files.
- The closeout stated internally that no baseline had been scored. That was
  correct from the evaluated agent's perspective; scoring was performed
  externally from its final response.

## Root Causes

The reported capability gap was not reproduced. The current skill description
already triggers on harvesting, while its process-audit, audit-routing,
authority, and RED–GREEN rules provide enough structure for the model to
perform the intended read-only harvest and approval gate.

The earlier review inferred behavior only from literal workflow steps in the
skill body and did not first test the complete capability.

## Improvements

Preserve the explicit capability-inventory, classification-table, exclusion,
and approval-request contract added after the later regression. No new skill,
agent, command, prompt, or hook is justified.

## Token Efficiency

The accepted baseline used 141,368 input tokens, including 116,992 cached
tokens, 4,150 output tokens, 1,572 reasoning-output tokens, and 24 command
executions.

Future evaluation prompts should use the accepted concise version directly.
Capability inventory can be reduced to one deterministic repository command
plus targeted reads of the discovered files.
