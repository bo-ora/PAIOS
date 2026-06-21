# Project Knowledge

PAIOS treats reviewed repository documents as durable project memory.

## Artifact Map

- `ROADMAP.md`: authoritative phases, state, value, deliverables, dependencies,
  and exit criteria.
- `TECH_DEBT.md`: deliberate shortcuts, maintenance risks, and repayment
  triggers.
- `requirements/`: approved or proposed product behavior and constraints.
- `architecture/decisions/`: architecture decision records (ADRs).
- `plans/`: approved implementation plans.
- `research/`: source-backed investigations and comparisons.
- `sessions/`: curated outcomes from meaningful Codex sessions.
- `audits/`: process and agent-performance findings.
- `operations/`: runbooks, monitoring, backup, and recovery guidance.
- `reviews/`: periodic roadmap, vision, and technical-debt reviews.

Raw Codex transcripts and JSONL events belong in `.local/paios-sessions/`.
They are local diagnostic data and must never be committed.

## Promotion Rule

A session summary is evidence, not authority. Promote stable conclusions into:

- requirements for behavior or constraints;
- ADRs for consequential technical decisions;
- plans for approved implementation work;
- `AGENTS.md` for durable repository rules;
- repository skills for evaluated repeatable workflows.

Commit documentation with the implementation or decision it explains.

The phase table in `ROADMAP.md` is authoritative. Its Mermaid diagram and
current-position summary are projections for orientation.

## Naming

- ADRs: `NNNN-short-title.md`
- Plans: `YYYY-MM-DD-short-title.md`
- Session summaries: `YYYY-MM-DD-HHMM-role-short-title.md`
- Audits: `YYYY-MM-DD-short-title.md`
- Roadmap reviews: `YYYY-MM-DD-roadmap-review.md`

Use UTC in generated session filenames and include exact local dates in content
when local timing matters.
