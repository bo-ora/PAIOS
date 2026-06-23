# PAIOS — Claude Code project memory

Claude Code is a **peer development harness** alongside Codex. The contributor
guide, knowledge model, and definition of done are shared and authoritative for
both. Read them here:

@AGENTS.md

## Claude Code specifics

- **Skills** live in `.agents/skills/<name>/SKILL.md` (the single canonical
  source). `.claude/skills` is a symlink to `.agents/skills`, so the same skills
  load in Claude Code and Codex with no duplication. Add or edit a skill in one
  place only.
- **Knowledgebase** is `docs/` — agent-neutral Markdown. Treat
  `docs/requirements/`, `docs/architecture/decisions/`, and `docs/plans/` as the
  source of truth, not session transcripts. See
  [docs/architecture/codex-operating-model.md](docs/architecture/codex-operating-model.md);
  it governs both harnesses despite the historical filename.
- **Capability changes** (any skill, agent, command, hook, or prompt — for
  either harness) follow the RED→GREEN protocol in
  [evals/codex/README.md](evals/codex/README.md): run the unchanged scenario,
  record RED, make the smallest change, rerun for GREEN. Do not change a
  capability whose baseline already passes.
- **Fresh-machine setup**: `scripts/bootstrap.sh` installs prerequisites; `./lde.sh`
  only checks them. See
  [docs/operations/development-environment.md](docs/operations/development-environment.md).
- **Privacy**: keep raw events, transcripts, and personal data under `.local/`
  (git-ignored). Never commit secrets or machine-specific absolute paths.
