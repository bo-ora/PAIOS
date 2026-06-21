import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { formatHuman } from "./format.js";
import { collectStatus } from "./status.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const usage = "Usage: ./paios status [--json]\n";

function validArguments(args: string[]): boolean {
  return (
    (args.length === 1 && args[0] === "status") ||
    (args.length === 2 && args[0] === "status" && args[1] === "--json")
  );
}

export function runCli(args: string[], root: string, io: CliIo): number {
  if (!validArguments(args)) {
    io.stderr(usage);
    return 2;
  }

  try {
    const status = collectStatus(root);
    if (args[1] === "--json") {
      io.stdout(`${JSON.stringify(status, null, 2)}\n`);
    } else {
      io.stdout(formatHuman(status));
    }
    return status.validation.passed ? 0 : 1;
  } catch {
    io.stderr("Unable to collect PAIOS status from the current repository.\n");
    return 2;
  }
}

function repositoryRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "not inside a Git repository");
  }
  return result.stdout.trim();
}

export function main(args: string[]): number {
  const io: CliIo = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
  try {
    return runCli(args, repositoryRoot(), io);
  } catch {
    io.stderr("Unable to locate the current Git repository.\n");
    return 2;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
