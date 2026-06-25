# Design: Near-Autonomous SDLC — Unattended Plan Executor (slice 1, phase 1)

Status: Draft (brainstorming output, pending plan)
Date: 2026-06-25
Role: architecture / design

## North Star (vision context, not this phase's scope)

Near-autonomous SDLC for PAIOS, delivered as two slices across future phases:

- **Slice 1 — meta:** PAIOS develops *itself* via a continuous backlog loop —
  select the next item from the roadmap / `docs/TECH_DEBT.md` → draft
  requirements *(human gate)* → draft a plan *(human gate)* → execute →
  test → self-review → commit to `master` **unattended**, self-healing with
  bounded retries before escalating, never merging red → loop.
- **Slice 2 — product:** the same engine pointed at the user's *own external
  projects*.

The human stays in the loop at exactly two gates — **requirements approval** and
**plan approval** — consistent with the existing rule that the main thread owns
requirements and decisions. Everything from an approved plan onward
(implement → test → self-review → merge to `master`) runs unattended.

This design covers **only the first shippable phase**: the unattended plan
executor. Backlog selection, auto-drafting, the continuous loop, and external
projects are explicitly later phases that build on a proven executor.

## Scope of This Phase

**Delivers:** an **unattended plan executor**. Given *one already-approved plan*
(a `docs/plans/*.md` produced by the existing requirements → plan flow), it
drives that plan to a verified commit on `master`, unattended, self-healing then
escalating, never merging red. The user triggers it with an approved plan and
"go"; it runs the plan to completion without further per-step prompting.

**Out of scope (later phases):** backlog selection, automated drafting of
requirements/plans, the continuous loop, and external-project SDLC.

**Where it lives / how "unattended" is achieved:** per the operating model
("automation starts as repository scripts and skills; external orchestration is
introduced only when repository-native workflows are demonstrably
insufficient"), the executor is a **new skill** (`paios-autonomous-executor`)
backed by small **repo scripts** for the deterministic gates — *not* an external
cron/daemon. "Unattended" in this phase means it drives the whole approved plan
in one run without per-step prompts. Headless/scheduled operation is deferred
until the loop phase proves it is needed.

**Reuses, does not rebuild:** `using-git-worktrees`,
`executing-plans` / `subagent-driven-development`, `test-driven-development`,
`systematic-debugging`, `verification-before-completion`,
`requesting-code-review`, `paios-session-close`, plus
`scripts/validate_repository.py` and the npm test / lint / typecheck / build
gates.

## Components

Eight units, each with one job. Only the run controller is substantial new code;
the rest is wiring over proven capabilities.

| Unit | Responsibility | Reuses |
| --- | --- | --- |
| **Run controller** | Entry point: take an approved plan path, set up isolation, drive the step loop, own escalation/exit. The one genuinely new piece. | — |
| **Workspace isolation** | Run the whole plan in a git worktree so the live tree and `master` are untouched until the explicit final merge. | `using-git-worktrees` |
| **Step executor** | For each plan step: test-first, then implement. | `test-driven-development`, `executing-plans` |
| **Verification gate** | Full bar: `npm test` + typecheck + lint + build + `validate_repository.py` + `git diff --check`, then independent review subagent. | `verification-before-completion`, `requesting-code-review` |
| **Self-heal loop** | On failure, bounded systematic-debugging retries (default 3) before escalating. | `systematic-debugging` |
| **Capability guard** | Detect changes to `.agents/skills/`, agents, hooks, prompts → route through RED→GREEN; if unsatisfiable unattended → escalate. | `evals/codex/README.md` |
| **Merge step** | Only after green + review pass + capability guard satisfied: merge to `master`. | — |
| **Escalation / evidence** | On give-up: stop, leave work in the worktree, emit a concise summary + decision-needed; write a run record (`.local/`, raw) + curated session summary. | `paios-session-close` |

## Data Flow

```
approved plan
  → controller spawns worktree
  → for each step: TDD(red→green) → step check → [fail → self-heal ≤3 → escalate]
  → full verification gate → independent review → capability guard
  → merge to master → write session summary → exit
```

A single happy path, a single escalation path, isolation throughout.

## Error Handling & Safety Invariants

Trustworthy autonomy is the whole point, so the invariants *are* the design:

- **Never merge red.** Merge to `master` happens only after the full gate +
  independent review + capability guard all pass. No override.
- **Bounded self-heal.** Up to N (default 3) systematic-debugging attempts per
  failure; on the Nth failure, stop and escalate. No infinite loops.
- **Isolation always.** All work in a worktree; a bad/abandoned run cannot
  corrupt the live tree or `master`. Abandon = remove worktree.
- **Self-modification gated.** Any change touching PAIOS's own
  skills/agents/hooks/prompts routes through RED→GREEN; if it cannot be satisfied
  unattended, escalate rather than self-merge a capability change.
- **One run at a time** (mirrors "at most one phase executing").
- **$0 / local, no egress.** Raw run records under `.local/`, never committed.
- **Resumable / clean exit.** A run is either resumed or cleanly abandoned,
  leaving committed evidence of what happened.

## Testing

- **Faked-boundary suite** (default `npm test`): controller logic with
  skill/subprocess boundaries faked — verify gate sequencing, self-heal retry
  counts, escalate-on-Nth-failure, capability-guard routing, **never-merge-red**,
  and resumability.
- **Live local smoke** (required by `AGENTS.md`; opt-in, never networked): point
  it at a real small approved plan → confirm it reaches a `master` commit
  unattended; then a deliberately-failing plan → confirm self-heal-then-escalate,
  no red merge, clean worktree. Record the evidence.

## Roadmap Placement

This is **not** an existing phase. It enters the roadmap as new `provisional`
phases:

- **This phase (executor-first):** the unattended plan executor above. Builds on
  the Phase 0 operating model; does not reopen Phase 0.
- **Next phase:** continuous backlog loop (selection + auto-drafting + loop) on
  top of the proven executor.
- **Later phase:** external-project SDLC (slice 2).

Sequencing against the in-flight Phase 4 (Health Journal) is a roadmap decision
to settle when this is promoted from design to an approved phase — these new
phases are added as `provisional` and do not change the rule that at most one
phase executes at a time.

## Open Questions (to settle in planning)

1. **Plan-step contract.** What structure must a `docs/plans/*.md` step have for
   the step executor to consume it deterministically (e.g., explicit
   per-step test/verification)? May require a light convention on plan format.
2. **Independent-review authority.** Does a non-blocking-but-flagged review
   finding block the unattended merge, or escalate? (Default proposal: any
   critical/high finding escalates; lower findings are recorded and merged.)
3. **Capability-guard detection.** Exact path/glob set that triggers the
   RED→GREEN route, and how much of RED→GREEN can run unattended vs always
   escalates.
4. **Controller substrate.** Skill-driven in-session run vs a thin repo script
   entry point (e.g. `./paios run-plan <path>`) — confirm against the
   repo-native-first principle during planning.
