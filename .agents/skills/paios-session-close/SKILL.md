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
- tests, validation commands, and source links actually used;
- local metrics supplied by `scripts/capture_codex_session.py`, when present.

Never invent token counts, tests, commits, decisions, or hidden reasoning.
Label interpretations as inferences.

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

The process audit must identify concrete strengths, deviations, repeated work,
unnecessary commands or reads, context loss, and token-efficiency improvements.
If exact usage metrics are unavailable, say so and assess observable behavior.

Create a separate `docs/audits/` record only when the session exposes a reusable
process failure or capability-change proposal.

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
