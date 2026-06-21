# PAIOS

![PAIOS — Personal AI Operating System](docs/assets/paios-hero.png)

PAIOS is a local-first, AI-native personal operating system designed to plan,
remember, research, execute, and improve over time while keeping persistent data
under the user’s control.

The project begins with an automated software-development workflow and will
expand incrementally into knowledge management, health intelligence, durable
agent orchestration, and additional personal workflows.

## Project Status

PAIOS is currently in **Phase 0 — Development Operating System**. The immediate
product is the TypeScript Project Status CLI, which makes project state,
roadmap position, pending work, and technical debt easy to understand after
time away.

- [Roadmap and current phase](docs/ROADMAP.md)
- [Technical debt register](docs/TECH_DEBT.md)
- [Initial vision and requirements](docs/requirements/INITIAL.md)
- [Approved Phase 0 requirements](docs/requirements/phase-0-development-operating-system.md)
- [Codex operating model](docs/architecture/codex-operating-model.md)
- [Project knowledge guide](docs/README.md)
- [Codex workflow commands](docs/operations/codex-workflow.md)
- [Contributor guidelines](AGENTS.md)

## Core Principles

- Local-first ownership and portability
- Modular, replaceable providers and runtimes
- Durable, resumable workflows
- Human approval at consequential decision points
- Infrastructure, configuration, prompts, and documentation as code
- Incremental phases that each deliver standalone user value

## Project Status CLI

Node.js 20 or newer and npm are required. Install the pinned development
tooling and build the generated, untracked `dist/` output:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Read the current repository state in human or JSON form:

```bash
./paios status
./paios status --json
```

The command is read-only, offline, and has no runtime npm dependencies. It
derives status directly from Git and repository Markdown.

## Validate the Repository

```bash
npm run typecheck
npm test
npm run build
python3 -m unittest discover -s tests -v
python3 scripts/validate_repository.py .
git diff --check
```

Run a measured read-only Codex task while keeping raw events outside Git:

```bash
python3 scripts/capture_codex_session.py \
  "architecture research" \
  "Compare persistence options for the first durable workflow milestone."
```
