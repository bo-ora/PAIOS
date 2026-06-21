import { spawnSync } from "node:child_process";

import type { GitStatus } from "./types.js";

function runGit(root: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const message = result.stderr.trim() || `git ${args.join(" ")} failed`;
    throw new Error(message);
  }
  return result.stdout;
}

export function collectGitStatus(root: string): GitStatus {
  const branch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const rawStatus = runGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const entries = rawStatus.split("\0");
  let changed = 0;
  let staged = 0;
  let untracked = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined || entry.length < 3) {
      continue;
    }
    const x = entry[0];
    const y = entry[1];
    if (x === "?" && y === "?") {
      untracked += 1;
      continue;
    }
    if (x !== " " && x !== undefined) {
      staged += 1;
    }
    if (y !== " " && y !== undefined) {
      changed += 1;
    }
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      index += 1;
    }
  }

  return {
    branch,
    clean: changed === 0 && staged === 0 && untracked === 0,
    changed,
    staged,
    untracked,
  };
}
