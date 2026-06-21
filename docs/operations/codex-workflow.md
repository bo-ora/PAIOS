# Codex Workflow

## Start a Session

Choose one role and write a bounded prompt:

```text
Goal: <measurable outcome>
Context: <relevant files and prior decisions>
Constraints: <safety, scope, architecture, cost>
Done when: <tests or observable evidence>
```

Use `$paios-project-workflow` when a request crosses requirements,
architecture, planning, or implementation boundaries. Use Goal mode for
multi-step work with measurable completion criteria.

## Run a Measured Session

The capture utility runs `codex exec --json` and stores raw events, the final
message, and derived metrics under ignored local storage:

```bash
python3 scripts/capture_codex_session.py \
  "requirements review" \
  "Review Priority 0 requirements and list unresolved product decisions."
```

Read-only is the default. Use `--sandbox workspace-write` only for an approved
implementation task. Raw evidence is written to `.local/paios-sessions/`.

## Close a Session

Invoke `$paios-session-close` for meaningful work. A closeout records objective,
outcome, artifacts, decisions, verification, blockers, process audit, and
follow-up. Promote stable conclusions into requirements, ADRs, plans,
`AGENTS.md`, or an evaluated repository skill.

## Evaluate Capability Changes

Before changing a Codex skill, plugin, agent, hook, command, prompt, or
description:

1. Add or update a scenario in `evals/codex/scenarios/`.
2. Run the unchanged capability in a fresh session.
3. Keep raw JSONL local and record the RED result in
   `docs/audits/codex-evals/`.
4. Stop if the baseline passes.
5. Make the smallest change that addresses observed failures.
6. Re-run the identical scenario and require GREEN.
7. Run boundary scenarios before broadening trigger descriptions.

## Use Subagents Deliberately

Use subagents for independent research, exploration, test analysis, and review.
Keep the main thread focused on requirements and decisions. Avoid parallel
agents editing shared files, and require concise evidence-backed summaries.

## Routine Verification

```bash
python3 -m unittest discover -s tests -v
python3 scripts/validate_repository.py .
git diff --check
git status --short --branch
```
