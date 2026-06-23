import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { CursorStore } from "./messaging.js";

/**
 * File-backed long-poll cursor under the git-ignored data root. Losing it only
 * means re-fetching from Telegram's retained update window; no knowledge is at
 * risk because records are durable independently (ADR-0005).
 */
export function createFileCursorStore(dataRoot: string): CursorStore {
  const file = join(dataRoot, "telegram", "cursor.json");
  return {
    read(): string | null {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as {
          offset?: unknown;
        };
        return typeof parsed.offset === "string" ? parsed.offset : null;
      } catch {
        return null;
      }
    },
    write(cursor: string): void {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify({ offset: cursor })}\n`, "utf8");
    },
  };
}
