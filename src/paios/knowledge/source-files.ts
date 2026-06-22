import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function writeManagedSource(
  dataRoot: string,
  reference: string,
  content: string,
): void {
  const destination = join(dataRoot, reference);
  const directory = dirname(destination);
  const temporary = `${destination}.tmp`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
    const descriptor = openSync(temporary, "r");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, destination);
    fsyncDirectory(directory);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
