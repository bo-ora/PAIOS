import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { collectStatus } from "../../src/paios/status.js";
import {
  createRepositoryFixture,
  type RepositoryFixture,
  writeFixtureFile,
} from "./fixtures.js";

let fixtures: RepositoryFixture[] = [];

function fixture(validationPasses = true): RepositoryFixture {
  const created = createRepositoryFixture({ validationPasses });
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures) {
    created.cleanup();
  }
  fixtures = [];
});

test("collects clean Git state and repository Markdown facts", () => {
  const { root } = fixture();

  const status = collectStatus(root);

  assert.deepEqual(status.git, {
    branch: "master",
    clean: true,
    changed: 0,
    staged: 0,
    untracked: 0,
  });
  assert.deepEqual(status.validation, { passed: true, errors: [] });
  assert.deepEqual(status.latestSession, {
    path: "docs/sessions/2026-06-22-0900-implementation-status-cli.md",
    date: "2026-06-22",
    role: "implementation",
    status: "partial",
  });
  assert.deepEqual(status.unresolvedQuestions, [
    "How should a malformed table be reported?",
    "Is the output deterministic when Markdown wraps onto another line?",
  ]);
  assert.equal(status.nextAction, "Implement the next verified task.");
  assert.deepEqual(status.pendingPlanItems, [
    {
      path: "docs/plans/2026-06-22-example.md",
      text: "Implement the next verified task.",
    },
    {
      path: "docs/plans/2026-06-22-example.md",
      text: "Verify the result across multiple lines.",
    },
  ]);
  assert.deepEqual(status.roadmap, {
    path: "docs/ROADMAP.md",
    currentPhase: {
      id: 0,
      name: "Development Operating System",
      state: "in-progress",
      value: "Develop consistently and resume after time away.",
    },
    nextPhase: {
      id: 1,
      name: "Local Knowledge Loop",
      state: "refining",
      value: "Capture knowledge locally and find it later.",
    },
  });
  assert.deepEqual(status.technicalDebt, {
    path: "docs/TECH_DEBT.md",
    unresolvedBySeverity: {
      critical: 0,
      high: 0,
      medium: 1,
      low: 1,
    },
  });
  assert.deepEqual(status.warnings, []);
});

test("counts staged, changed, and untracked Git files", () => {
  const { root } = fixture();
  writeFixtureFile(root, "tracked-a.txt", "changed\n");
  writeFixtureFile(root, "tracked-b.txt", "staged\n");
  execFileSync("git", ["add", "tracked-b.txt"], { cwd: root });
  writeFixtureFile(root, "untracked.txt", "new\n");

  const status = collectStatus(root);

  assert.deepEqual(status.git, {
    branch: "master",
    clean: false,
    changed: 1,
    staged: 1,
    untracked: 1,
  });
});

test("selects the latest session by filename timestamp", () => {
  const { root } = fixture();
  writeFixtureFile(
    root,
    "docs/sessions/2026-06-23-0100-testing-newer.md",
    `# Session: Newer

Date: 2026-06-23
Role: testing
Status: completed

## Blockers and Open Questions

None.

## Follow-up

1. Publish verified work.
`,
  );

  const status = collectStatus(root);

  assert.equal(
    status.latestSession?.path,
    "docs/sessions/2026-06-23-0100-testing-newer.md",
  );
  assert.equal(status.latestSession?.role, "testing");
  assert.deepEqual(status.unresolvedQuestions, []);
  assert.equal(status.nextAction, "Publish verified work.");
});

test("warns without inventing values when expected documents are missing", () => {
  const { root } = fixture();
  rmSync(join(root, "docs/ROADMAP.md"));
  rmSync(join(root, "docs/TECH_DEBT.md"));
  rmSync(join(root, "docs/sessions"), { recursive: true });

  const status = collectStatus(root);

  assert.equal(status.latestSession, null);
  assert.deepEqual(status.unresolvedQuestions, []);
  assert.equal(status.nextAction, null);
  assert.equal(status.roadmap.currentPhase, null);
  assert.equal(status.roadmap.nextPhase, null);
  assert.deepEqual(status.technicalDebt.unresolvedBySeverity, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  assert.deepEqual(status.warnings, [
    "Missing expected document: docs/ROADMAP.md",
    "Missing expected document: docs/TECH_DEBT.md",
    "No session summaries found under docs/sessions/",
  ]);
});

test("warns when roadmap data has multiple active phases", () => {
  const { root } = fixture();
  writeFixtureFile(
    root,
    "docs/ROADMAP.md",
    `# PAIOS Roadmap

## Phase Table

| Phase | State | User value |
| --- | --- | --- |
| **0 — First** | \`in-progress\` | First value. |
| **1 — Second** | \`blocked\` | Second value. |
`,
  );

  const status = collectStatus(root);

  assert.equal(status.roadmap.currentPhase, null);
  assert.equal(status.roadmap.nextPhase, null);
  assert.ok(
    status.warnings.includes(
      "Malformed docs/ROADMAP.md: expected exactly one active phase, found 2",
    ),
  );
});

test("treats the first non-completed phase as current without warning when none is active", () => {
  const { root } = fixture();
  writeFixtureFile(
    root,
    "docs/ROADMAP.md",
    `# PAIOS Roadmap

## Phase Table

| Phase | State | User value |
| --- | --- | --- |
| **0 — Development Operating System** | \`completed\` | Develop consistently. |
| **1 — Local Knowledge Loop** | \`completed\` | Capture knowledge locally. |
| **2 — Telegram Daily Assistant** | \`completed\` | Use PAIOS from Telegram. |
| **3 — Health Journal** | \`provisional\` | Record health observations. |
| **4 — Wearable Health** | \`provisional\` | Automate health metrics. |
`,
  );

  const status = collectStatus(root);

  assert.deepEqual(status.roadmap.currentPhase, {
    id: 3,
    name: "Health Journal",
    state: "provisional",
    value: "Record health observations.",
  });
  assert.equal(status.roadmap.nextPhase?.id, 4);
  assert.ok(
    !status.warnings.some((warning) => warning.includes("no current phase")),
  );
});

test("selects the first unfinished phase during requirements refinement", () => {
  const { root } = fixture();
  writeFixtureFile(
    root,
    "docs/ROADMAP.md",
    `# PAIOS Roadmap

## Phase Table

| Phase | State | User value |
| --- | --- | --- |
| **0 — Development Operating System** | \`completed\` | Develop consistently. |
| **1 — Local Knowledge Loop** | \`refining\` | Capture knowledge locally. |
| **2 — Telegram Daily Assistant** | \`proposed\` | Use PAIOS from Telegram. |
`,
  );

  const status = collectStatus(root);

  assert.deepEqual(status.roadmap.currentPhase, {
    id: 1,
    name: "Local Knowledge Loop",
    state: "refining",
    value: "Capture knowledge locally.",
  });
  assert.deepEqual(status.roadmap.nextPhase, {
    id: 2,
    name: "Telegram Daily Assistant",
    state: "proposed",
    value: "Use PAIOS from Telegram.",
  });
  assert.deepEqual(status.warnings, []);
});

test("warns for missing sections and malformed roadmap and debt rows", () => {
  const { root } = fixture();
  writeFixtureFile(
    root,
    "docs/ROADMAP.md",
    `# PAIOS Roadmap

## Phase Table

| Phase | State | User value |
| --- | --- | --- |
| **0 — First** | \`in-progress\` |
| **1 — Second** | \`refining\` | Second value. |
`,
  );
  writeFixtureFile(
    root,
    "docs/TECH_DEBT.md",
    `# Technical Debt Register

## Debt Items

| ID | Area | Severity | Status |
| --- | --- | --- | --- |
| TD-001 | Tooling | \`low\` |
`,
  );
  writeFixtureFile(
    root,
    "docs/sessions/2026-06-22-0900-implementation-status-cli.md",
    `# Session: Status CLI

Date: 2026-06-22
Role: implementation
Status: partial
`,
  );

  const status = collectStatus(root);

  assert.ok(
    status.warnings.includes(
      "Malformed docs/ROADMAP.md: phase row must contain at least 3 cells",
    ),
  );
  assert.ok(
    status.warnings.includes(
      "Malformed docs/TECH_DEBT.md: debt row must contain at least 4 cells",
    ),
  );
  assert.ok(
    status.warnings.includes(
      "Malformed docs/sessions/2026-06-22-0900-implementation-status-cli.md: missing Blockers and Open Questions section",
    ),
  );
  assert.ok(
    status.warnings.includes(
      "Malformed docs/sessions/2026-06-22-0900-implementation-status-cli.md: missing Follow-up section",
    ),
  );
});

test("warns and ignores rows with empty required table cells", () => {
  const { root } = fixture();
  writeFixtureFile(
    root,
    "docs/ROADMAP.md",
    `# PAIOS Roadmap

## Phase Table

| Phase | State | User value |
| --- | --- | --- |
| **0 — First** | \`in-progress\` | |
| **1 — Second** | \`refining\` | Second value. |
`,
  );
  writeFixtureFile(
    root,
    "docs/TECH_DEBT.md",
    `# Technical Debt Register

## Debt Items

| ID | Area | Severity | Status |
| --- | --- | --- | --- |
| TD-001 | Tooling | \`low\` | |
| TD-002 | Delivery | \`medium\` | \`open\` |
`,
  );

  const status = collectStatus(root);

  assert.deepEqual(status.roadmap.currentPhase, {
    id: 1,
    name: "Second",
    state: "refining",
    value: "Second value.",
  });
  assert.deepEqual(status.technicalDebt.unresolvedBySeverity, {
    critical: 0,
    high: 0,
    medium: 1,
    low: 0,
  });
  assert.ok(
    status.warnings.includes(
      "Malformed docs/ROADMAP.md: phase row contains an empty required cell",
    ),
  );
  assert.ok(
    status.warnings.includes(
      "Malformed docs/TECH_DEBT.md: debt row contains an empty required cell",
    ),
  );
});

test("reports validator failure while preserving all other status", () => {
  const { root } = fixture(false);

  const status = collectStatus(root);

  assert.equal(status.validation.passed, false);
  assert.ok(
    status.validation.errors.includes(
      "evals/codex/scenarios/invalid.json: assertions must be a non-empty list",
    ),
  );
  assert.equal(status.git.branch, "master");
  assert.equal(status.roadmap.currentPhase?.id, 0);
});
