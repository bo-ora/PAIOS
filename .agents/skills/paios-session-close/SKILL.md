---
name: paios-session-close
description: Use when ending, handing off, summarizing, harvesting, or auditing a meaningful PAIOS Codex session so future work can resume from verified evidence.
---

# PAIOS Session Close

Create a curated handoff without turning raw conversation into project truth.

## Gather Evidence

Inspect only what is available:

- current goal and user-approved decisions;
- `git status`, relevant diff, and recent commits;
- tests, validation, and sources actually used;
- local metrics supplied by `scripts/capture_codex_session.py`, when present.

Never invent evidence or hidden reasoning. Label interpretations as inferences.

## Produce the Closeout

Use the headings from `docs/sessions/template.md`:

- Objective
- Outcome
- Artifacts
- Decisions
- Verification
- Blockers and Open Questions
- Process Audit
- Follow-up

Audit strengths, deviations, repeated work, unnecessary reads or commands,
context loss, and token efficiency. If metrics are unavailable, say so.

## Propose a Capability Harvest

When closing or harvesting a session:

1. inventory repository-local skills, commands, agents, prompts, and hooks;
2. mine verified facts, decisions, effective patterns, failures, and user
   corrections, stating when a category has no candidate;
3. classify each candidate as update existing, create new, promote to another
   authoritative artifact, or reject;
4. present item, target, action, and session evidence in a table.

Prefer existing capabilities with the same trigger space. Exclude secrets,
personal data, machine paths, one-off details, session narrative, and knowledge
already recorded at its authoritative source.

If a change is not already approved, explicitly request approval before edits.

Create a separate `docs/audits/` record only when the session exposes a reusable
process failure or capability-change proposal.

## Apply an Approved Harvest

When the user has approved a harvest and the unchanged capability has a
recorded RED result, continue without requesting approval again:

1. confirm the target, failed assertion, RED report, and local raw evidence;
2. update the existing capability when it covers the trigger space; create a
   new skill, command, agent, prompt, or hook only when RED evidence proves the
   existing surfaces are insufficient;
3. make only the approved durable change;
4. rerun the identical scenario and claim GREEN only from observed evidence;
5. run the applicable session-close, harvest, boundary, and deterministic
   repository regressions;
6. update the curated evaluation audit with RED, change, GREEN, regressions,
   and token-efficiency evidence.

Leave changes uncommitted unless committing was explicitly authorized.

## Authority and Privacy

- Session summaries are evidence, not requirements or ADRs.
- Link decisions to their authoritative files; do not silently rewrite them.
- Keep raw events and transcripts under `.local/paios-sessions/`.
- Do not copy private reasoning or full raw transcripts into Git.
- Capability changes require the RED–GREEN protocol in `evals/codex/README.md`.

## Read-Only Fallback

When writes are unavailable, return the complete closeout in the final response
using every required heading. Do not attempt file edits and do not replace the
closeout with a list of intended files.

## Verification

When writing files, run:

```text
python3 scripts/validate_repository.py .
git diff --check
```

Report the exact output or blocker.
