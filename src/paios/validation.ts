import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { ValidationStatus } from "./types.js";

const requiredScenarioKeys = [
  "id",
  "version",
  "capability",
  "purpose",
  "prompt",
  "fixture",
  "environment",
  "assertions",
  "prohibited",
  "scoring",
] as const;

const markdownRules: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "docs/architecture/decisions",
    [
      "## Context",
      "## Decision",
      "## Alternatives Considered",
      "## Consequences",
      "## Validation",
    ],
  ],
  [
    "docs/sessions",
    [
      "## Objective",
      "## Outcome",
      "## Artifacts",
      "## Decisions",
      "## Verification",
      "## Blockers and Open Questions",
      "## Process Audit",
      "## Follow-up",
    ],
  ],
  [
    "docs/audits",
    [
      "## Expected Behavior",
      "## Observed Behavior",
      "## Effective Patterns",
      "## Failures and Deviations",
      "## Root Causes",
      "## Improvements",
      "## Token Efficiency",
    ],
  ],
];

function repositoryPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function filesWithExtension(directory: string, extension: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function trackedFiles(root: string): string[] {
  const result = spawnSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0);
}

export function validateRepository(root: string): ValidationStatus {
  const errors: string[] = [];

  for (const [directory, headings] of markdownRules) {
    for (const path of filesWithExtension(join(root, directory), ".md")) {
      const content = readFileSync(path, "utf8");
      for (const heading of headings) {
        if (!content.includes(heading)) {
          errors.push(`${repositoryPath(root, path)}: missing ${heading}`);
        }
      }
    }
  }

  for (const path of filesWithExtension(
    join(root, "evals/codex/scenarios"),
    ".json",
  )) {
    const relativePath = repositoryPath(root, path);
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      errors.push(`${relativePath}: invalid JSON`);
      continue;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      errors.push(`${relativePath}: scenario must be a JSON object`);
      continue;
    }
    const scenario = data as Record<string, unknown>;
    const missing = requiredScenarioKeys.filter((key) => !(key in scenario));
    if (missing.length > 0) {
      errors.push(`${relativePath}: missing keys: ${missing.join(", ")}`);
    }
    if (
      !Array.isArray(scenario.assertions) ||
      scenario.assertions.length === 0
    ) {
      errors.push(`${relativePath}: assertions must be a non-empty list`);
    }
    if (!Array.isArray(scenario.prohibited)) {
      errors.push(`${relativePath}: prohibited must be a list`);
    }
  }

  for (const path of trackedFiles(root)) {
    if (
      path === ".local/paios-sessions" ||
      path.startsWith(".local/paios-sessions/")
    ) {
      errors.push(`${path}: raw session file is tracked`);
    }
  }

  return { passed: errors.length === 0, errors };
}
