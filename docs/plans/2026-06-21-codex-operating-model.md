# Codex Operating Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a repository-native Codex workflow that preserves approved
knowledge in Git, raw events locally, and requires RED–GREEN evidence before
changing agent capabilities.

**Architecture:** Markdown schemas define durable artifacts, a Python validator
enforces deterministic structure, and a small capture utility records
`codex exec --json` events locally. Repository skills are introduced one at a
time only after documented baseline failures.

**Tech Stack:** Markdown, JSON, Python 3 standard library, Codex CLI, Git.

---

### Task 1: Establish documentation and evaluation contracts

**Files:**
- Create: `docs/README.md`
- Create: `docs/architecture/decisions/0000-template.md`
- Create: `docs/sessions/template.md`
- Create: `docs/audits/template.md`
- Create: `evals/codex/README.md`
- Create: `evals/codex/scenarios/project-workflow.json`
- Create: `evals/codex/scenarios/session-close.json`

- [x] Define authoritative artifact locations and promotion rules.
- [x] Define templates with required headings.
- [x] Define versioned evaluation scenarios with prompts, assertions, and
      prohibited behaviors.
- [x] Run JSON parsing and Markdown heading checks.
- [x] Commit as `docs: define Codex knowledge and evaluation contracts`.

### Task 2: Build deterministic repository validation with TDD

**Files:**
- Create: `tests/test_validate_repository.py`
- Create: `scripts/validate_repository.py`

- [x] Write tests for valid documents, missing headings, invalid scenario JSON,
      and forbidden tracked raw-session files.
- [x] Run `python3 -m unittest tests/test_validate_repository.py -v` and verify
      failure because the validator does not exist.
- [x] Implement the minimum validator using only the Python standard library.
- [x] Run `python3 -m unittest tests/test_validate_repository.py -v` and verify
      all tests pass.
- [x] Run `python3 scripts/validate_repository.py .`.
- [x] Commit as `build: validate project knowledge artifacts`.

### Task 3: Evaluate and create the project-workflow skill

**Files:**
- Create after RED: `.agents/skills/paios-project-workflow/SKILL.md`
- Create after RED: `.agents/skills/paios-project-workflow/agents/openai.yaml`
- Create: `docs/audits/codex-evals/2026-06-21-project-workflow.md`

- [x] Run the unchanged scenario in a fresh `codex exec --ephemeral` session.
- [x] Record raw JSONL under `.local/paios-sessions/evals/`.
- [x] Score the baseline. If it passes, record that no skill is needed and stop.
- [x] If RED, initialize and write the minimum skill addressing observed gaps.
- [x] Validate the skill with `quick_validate.py`.
- [x] Re-run the identical scenario explicitly using the skill and record GREEN.
- [x] Commit as `feat: add evaluated PAIOS project workflow skill`.

### Task 4: Evaluate and create the session-close skill

**Files:**
- Create after RED: `.agents/skills/paios-session-close/SKILL.md`
- Create after RED: `.agents/skills/paios-session-close/agents/openai.yaml`
- Create: `docs/audits/codex-evals/2026-06-21-session-close.md`

- [x] Run the unchanged session-close scenario in a fresh session.
- [x] Score whether it creates a valid curated summary without modifying
      authoritative documents or tracking raw events.
- [x] If RED, create the minimum session-close skill.
- [x] Validate and re-run the identical scenario for GREEN.
- [x] Commit as `feat: add evaluated PAIOS session close skill`.

### Task 5: Capture scripted Codex sessions locally

**Files:**
- Create: `tests/test_capture_codex_session.py`
- Create: `scripts/capture_codex_session.py`
- Modify: `.gitignore`

- [x] Write tests for safe session names, local output paths, event metrics, and
      final-message extraction.
- [x] Run tests and verify RED because the utility is absent.
- [x] Implement capture around `codex exec --json` using the standard library.
- [x] Run unit tests and a read-only smoke session.
- [x] Confirm raw JSONL is ignored and no secrets or transcripts are staged.
- [x] Commit as `feat: capture Codex session evidence locally`.

### Task 6: Integrate guidance and verify

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [x] Document role-focused sessions, artifact promotion, RED–GREEN capability
      changes, and required verification.
- [x] Add operating-model and command links to README.
- [x] Run all unit tests, repository validation, `git diff --check`, and skill
      validation.
- [x] Review the complete diff for privacy, portability, and unnecessary scope.
- [x] Commit and push to `master`.
