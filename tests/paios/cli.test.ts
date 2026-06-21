import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { runCli } from "../../src/paios/cli.js";
import { formatHuman } from "../../src/paios/format.js";
import {
  createRepositoryFixture,
  type RepositoryFixture,
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

function captureIo(): {
  stdout: string[];
  stderr: string[];
  io: { stdout: (text: string) => void; stderr: (text: string) => void };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  };
}

test("status --json prints the stable status shape and exits zero", () => {
  const { root } = fixture();
  const captured = captureIo();

  const exitCode = runCli(["status", "--json"], root, captured.io);
  const output = JSON.parse(captured.stdout.join("")) as {
    git: { branch: string };
    roadmap: { path: string; currentPhase: { id: number } };
    technicalDebt: { path: string };
    warnings: string[];
  };

  assert.equal(exitCode, 0);
  assert.equal(output.git.branch, "master");
  assert.equal(output.roadmap.path, "docs/ROADMAP.md");
  assert.equal(output.roadmap.currentPhase.id, 0);
  assert.equal(output.technicalDebt.path, "docs/TECH_DEBT.md");
  assert.deepEqual(output.warnings, []);
  assert.deepEqual(captured.stderr, []);
});

test("human and JSON modes render equivalent status facts", () => {
  const { root } = fixture();
  const jsonCapture = captureIo();
  const humanCapture = captureIo();

  assert.equal(runCli(["status", "--json"], root, jsonCapture.io), 0);
  assert.equal(runCli(["status"], root, humanCapture.io), 0);

  const status = JSON.parse(jsonCapture.stdout.join(""));
  assert.equal(humanCapture.stdout.join(""), formatHuman(status));
  assert.match(humanCapture.stdout.join(""), /Git: master — clean/);
  assert.match(
    humanCapture.stdout.join(""),
    /Current phase: 0 — Development Operating System \[in-progress\]/,
  );
  assert.match(
    humanCapture.stdout.join(""),
    /Technical debt: critical 0, high 0, medium 1, low 1/,
  );
  assert.match(
    humanCapture.stdout.join(""),
    /Next action: Implement the next verified task\./,
  );
});

test("validation failure prints available status and exits one", () => {
  const { root } = fixture(false);
  const captured = captureIo();

  const exitCode = runCli(["status", "--json"], root, captured.io);
  const output = JSON.parse(captured.stdout.join("")) as {
    validation: { passed: boolean; errors: string[] };
    roadmap: { currentPhase: { id: number } };
  };

  assert.equal(exitCode, 1);
  assert.equal(output.validation.passed, false);
  assert.ok(
    output.validation.errors.includes(
      "evals/codex/scenarios/invalid.json: assertions must be a non-empty list",
    ),
  );
  assert.equal(output.roadmap.currentPhase.id, 0);
});

test("invalid usage exits two without collecting status", () => {
  const { root } = fixture();
  const captured = captureIo();

  const exitCode = runCli(["unknown"], root, captured.io);

  assert.equal(exitCode, 2);
  assert.deepEqual(captured.stdout, []);
  assert.equal(
    captured.stderr.join(""),
    "Usage: ./paios status [--json]\n",
  );
});

test("both CLI modes leave Git and tracked files unchanged", () => {
  const { root } = fixture();
  const beforeStatus = execFile("git", ["status", "--porcelain=v1", "-z"], root);
  const tracked = execFile("git", ["ls-files"], root)
    .split(/\r?\n/)
    .filter((path) => path.length > 0);
  const beforeFiles = tracked.map((path) => readFileSync(join(root, path)));

  assert.equal(runCli(["status"], root, captureIo().io), 0);
  assert.equal(runCli(["status", "--json"], root, captureIo().io), 0);

  assert.equal(
    execFile("git", ["status", "--porcelain=v1", "-z"], root),
    beforeStatus,
  );
  assert.deepEqual(
    tracked.map((path) => readFileSync(join(root, path))),
    beforeFiles,
  );
});

test("unrecoverable errors do not expose absolute paths", () => {
  const captured = captureIo();
  const secretPath = "/private/example/paios";

  const exitCode = runCli(["status"], secretPath, captured.io);

  assert.equal(exitCode, 2);
  assert.equal(
    captured.stderr.join(""),
    "Unable to collect PAIOS status from the current repository.\n",
  );
  assert.doesNotMatch(captured.stderr.join(""), /private|example/);
});

test("wrapper fails clearly when compiled output is absent", () => {
  const { root } = fixture();
  const wrapper = join(root, "paios");
  copyFileSync(join(process.cwd(), "paios"), wrapper);
  chmodSync(wrapper, 0o755);

  const result = spawnSync(wrapper, ["status"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /compiled CLI not found/i);
  assert.match(result.stderr, /npm run build/);
});

function execFile(command: string, args: string[], root: string): string {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
