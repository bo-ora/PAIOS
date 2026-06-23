# Agent Audit: Session-Close Harvest — Tools & Accesses

Date: 2026-06-23
Scenario: `session-harvest-tools-access-001` (`evals/codex/scenarios/session-harvest-tools-access.json`)
Capability: `paios-session-close`

## Expected Behavior

When closing a session that introduced a new host tool or a new external access,
the harvest should treat "tools or accesses introduced this session" as a
distinct, named concern and verify each was recorded at its authoritative
inventory — new host tools in `Brewfile` / `scripts/bootstrap.sh` /
`docs/operations/development-environment.md`; new credentials or accesses in
`docs/operations/credentials.md` (value-free), with real values kept only in
`.local/secrets.env`. An added tool/access not yet recorded there is a harvest
item, not a silent rejection.

## Method

Fresh read-only subagents under strict isolation: forbidden from reading
`docs/sessions/` and `evals/` so the baseline could not crib from the
already-committed closeout (which itself proposed this change) or from the
scenario assertions. Each reasoned only from an abstract session narrative. An
earlier non-isolated baseline was discarded as contaminated.

## Observed Behavior

RED baseline (`.local/paios-sessions/evals/session-harvest-tools-access-RED.md`):
the unchanged skill lists only generic mining categories (facts, decisions,
patterns, failures, corrections). The closer folded the added runtime and access
into "effective patterns," classified them "reject — already recorded," and
aimed its one improvement proposal at a *different* skill
(`paios-project-workflow` routing). It never framed "were added tools/accesses
recorded?" as a session-close harvest check. Discriminating assertion A4 failed.

GREEN (`.local/paios-sessions/evals/session-harvest-tools-access-GREEN.md`,
identical prompt, updated skill): the closer mined an explicit "Tools or accesses
introduced" category, tied it to the inventories the skill names, tabled each
with routing to `Brewfile`/`development-environment.md` and `credentials.md`, and
performed the record-or-flag check — correctly rejecting because this repo's
state already records them. All assertions satisfied.

## Change Made

`.agents/skills/paios-session-close/SKILL.md`, "Propose a Capability Harvest":
added "tools or accesses introduced during the session" to the mining list and a
paragraph routing each to its authoritative inventory (value-free for
credentials; real values only in `.local/secrets.env`), instructing the closer to
flag an unrecorded tool/access as a harvest item rather than a rejection.

## Regression

`session-harvest-001` (rtk-fallback scenario), updated skill: PASS. Full
structured closeout, capability inventory, all mining categories (incl. the new
one correctly reporting "none new introduced"), classification, harvest table,
and approval + RED→GREEN gating all intact. The added category did not distort
an unrelated scenario.

`python3 scripts/validate_repository.py .` and `git diff --check`: see the
commit that lands this record.

## Notes

- Token efficiency: not instrumented (`capture_codex_session.py` not run); each
  eval subagent used ~40–50k tokens.
- The smallest effective change was an edit to the existing skill; no new
  capability surface was created, consistent with preferring existing
  capabilities in the same trigger space.
