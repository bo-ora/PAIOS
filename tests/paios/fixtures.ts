import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FixtureOptions {
  validationPasses?: boolean;
}

export interface RepositoryFixture {
  root: string;
  cleanup: () => void;
}

function write(root: string, path: string, content: string): void {
  const absolutePath = join(root, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

function git(root: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

export function createRepositoryFixture(
  options: FixtureOptions = {},
): RepositoryFixture {
  const root = mkdtempSync(join(tmpdir(), "paios-status-"));
  const validationPasses = options.validationPasses ?? true;

  git(root, "init", "-b", "master");
  git(root, "config", "user.name", "PAIOS Test");
  git(root, "config", "user.email", "test@example.invalid");

  write(
    root,
    "docs/ROADMAP.md",
    `# PAIOS Roadmap

## Phase Table

| Phase | State | User value | Main deliverables | Depends on | Exit criteria |
| --- | --- | --- | --- | --- | --- |
| **0 — Development Operating System** | \`in-progress\` | Develop consistently and resume after time away. | Status CLI. | None | CLI verified. |
| **1 — Local Knowledge Loop** | \`refining\` | Capture knowledge locally and find it later. | Capture and search. | Phase 0 | Sources returned. |
| **2 — Deferred Example** | \`deferred\` | Deferred value. | None. | Phase 1 | Deferred. |
`,
  );
  write(
    root,
    "docs/TECH_DEBT.md",
    `# Technical Debt Register

## Debt Items

| ID | Area | Severity | Status | Debt and impact | Repayment trigger | Target |
| --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Tooling | \`low\` | \`accepted\` | Two languages. | Shared work. | Phase 1. |
| TD-002 | Delivery | \`medium\` | \`open\` | Direct commits. | Parallel work. | Phase 1. |
| TD-003 | CI | \`high\` | \`resolved\` | No checks. | CLI complete. | Phase 0. |
| TD-004 | Old | \`critical\` | \`obsolete\` | Removed code. | Removed. | Done. |
`,
  );
  write(
    root,
    "docs/plans/2026-06-22-example.md",
    `# Example Plan

- [x] Completed item.
- [ ] Implement the next verified task.
- [ ] Verify the result across
      multiple lines.
`,
  );
  write(
    root,
    "docs/sessions/2026-06-21-1200-requirements-old.md",
    `# Session: Old

Date: 2026-06-21
Role: requirements
Status: completed

## Objective

Record an older session.

## Outcome

Older evidence.

## Artifacts

None.

## Decisions

None.

## Verification

Fixture.

## Blockers and Open Questions

- Old question.

## Process Audit

No deviations.

## Follow-up

1. Old action.
`,
  );
  write(
    root,
    "docs/sessions/2026-06-22-0900-implementation-status-cli.md",
    `# Session: Status CLI

Date: 2026-06-22
Role: implementation
Status: partial

## Objective

Implement status.

## Outcome

Partial implementation.

## Artifacts

Fixture files.

## Decisions

Use approved requirements.

## Verification

Fixture.

## Blockers and Open Questions

- How should a malformed table be reported?
- Is the output deterministic when
  Markdown wraps onto another line?

## Process Audit

No deviations.

## Follow-up

1. Implement the next verified task.
2. Run acceptance checks.
`,
  );
  if (!validationPasses) {
    write(root, "evals/codex/scenarios/invalid.json", '{"id": "invalid"}\n');
  }
  write(root, "tracked-a.txt", "original\n");
  write(root, "tracked-b.txt", "original\n");

  git(root, "add", ".");
  git(root, "commit", "-m", "fixture");

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function writeFixtureFile(
  root: string,
  path: string,
  content: string,
): void {
  write(root, path, content);
}
