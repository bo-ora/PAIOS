# ADR-0004: Claude Code as a Peer Harness and an Installing Bootstrap

Status: Accepted
Date: 2026-06-23

## Context

PAIOS was wired exclusively for Codex: `AGENTS.md`, `.agents/skills/` (with
`agents/openai.yaml`), `evals/codex/`, and `scripts/capture_codex_session.py`.
The maintainer now also develops with Claude Code and wants both harnesses to
share the same skills and knowledgebase without forking either. Separately,
`lde.sh` only *checks* prerequisites; bringing up a fresh machine still required
undocumented manual installs, which the development-environment "Automation
Path" anticipated would eventually need an installing bootstrap.

Two constraints shape the decision: the project is local-first and privacy
sensitive, and the repository — not any one tool's configuration — is the source
of truth.

## Decision

1. **Single canonical skill source.** Skills remain authored once under
   `.agents/skills/<name>/SKILL.md`. `.claude/skills` is a symlink to
   `.agents/skills`, so Claude Code and Codex load identical skills with no
   duplication. The portable `name`/`description` frontmatter is already
   compatible with both; Codex-only `agents/openai.yaml` files are ignored by
   Claude Code.
2. **Shared instructions.** `AGENTS.md` stays the canonical contributor guide.
   `CLAUDE.md` imports it via `@AGENTS.md` and adds only a short Claude-Code
   addendum. The knowledge model, definition of done, and RED→GREEN capability
   protocol apply to both harnesses.
3. **Shared knowledgebase.** `docs/` is agent-neutral and remains the source of
   truth. `codex-operating-model.md` keeps its filename (to avoid breaking many
   references) but is declared harness-neutral.
4. **Installing bootstrap.** `scripts/bootstrap.sh` (macOS) installs host tools
   declared in `Brewfile` via Homebrew, installs the Node major pinned by
   `.nvmrc` (24) through nvm, runs `npm ci` and `npm run build`, and verifies
   with `./lde.sh`. `lde.sh` stays read-only.

## Alternatives Considered

- **Copy skills into `.claude/skills`.** Rejected: two sources drift and violate
  the "must be reusable" requirement.
- **Rename `codex-*` files to harness-neutral names.** Deferred: high churn
  across many cross-references for low benefit; a declared neutrality note is
  enough for now.
- **Homebrew-managed Node instead of nvm.** Rejected: the maintainer already
  uses nvm; a brew `node` would conflict. `.nvmrc` keeps the pin reproducible
  and per-project.
- **Make `lde.sh` install tools.** Rejected: the operating model requires
  installation actions to stay explicit and separate from the read-only check.

## Consequences

- One edit point for skills; both harnesses stay in sync automatically.
- New machines reach a green `./lde.sh` with a single `scripts/bootstrap.sh`.
- `Brewfile`/`.nvmrc` are a declarative inventory that can later become Ansible,
  Dev Containers, or Nix.
- Symlinks must survive on contributor filesystems; macOS/Linux handle them, and
  this is currently a single-maintainer local-first repo.
- Capability changes for *either* harness still require the RED→GREEN protocol.

## Validation

- `ls .claude/skills/` lists the same skills as `.agents/skills/`.
- Claude Code discovers `paios-project-workflow` and `paios-session-close`.
- `scripts/bootstrap.sh` on this machine ends with `./lde.sh` reporting zero
  failures (Node ≥ 24).
- `python3 scripts/validate_repository.py .` passes and `git diff --check` is
  clean.

Revisit if a second contributor's filesystem cannot use symlinks, or if either
harness changes its skill-discovery convention.
