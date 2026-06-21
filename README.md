# PAIOS

![PAIOS — Personal AI Operating System](docs/assets/paios-hero.png)

PAIOS is a local-first, AI-native personal operating system designed to plan,
remember, research, execute, and improve over time while keeping persistent data
under the user’s control.

The project begins with an automated software-development workflow and will
expand incrementally into knowledge management, health intelligence, durable
agent orchestration, and additional personal workflows.

## Project Status

PAIOS is in the requirements and architecture phase. Implementation begins only
after the initial workflow requirements and architecture are explicitly
approved.

- [Initial vision and requirements](docs/requirements/INITIAL.md)
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

## Validate the Repository

```bash
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
