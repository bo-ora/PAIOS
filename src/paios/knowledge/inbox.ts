import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

import type {
  InboxIngestResult,
  InboxItemResult,
  InboxItemStatus,
} from "../types.js";
import {
  addFile,
  DuplicateKnowledgeError,
  KnowledgeInputError,
} from "./records.js";

const documentExtensions = new Set([".md", ".txt"]);
const audioExtensions = new Set([".wav", ".mp3", ".m4a"]);

function compareNames(
  left: { name: string },
  right: { name: string },
): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function inboxPaths(dataRoot: string): {
  inboxRoot: string;
  processedRoot: string;
} {
  const localRoot = dirname(resolve(dataRoot));
  return {
    inboxRoot: join(localRoot, "inbox"),
    processedRoot: join(localRoot, "inbox-processed"),
  };
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function moveToProcessed(
  inboxRoot: string,
  processedRoot: string,
  path: string,
): void {
  const relativePath = relative(inboxRoot, path);
  const destination = join(processedRoot, relativePath);
  const destinationDirectory = dirname(destination);
  mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  if (existsSync(destination)) {
    throw new Error("Processed destination already exists.");
  }
  renameSync(path, destination);
  fsyncDirectory(destinationDirectory);
  fsyncDirectory(dirname(path));
}

function discoverInbox(
  inboxRoot: string,
): {
  path: string;
  relativePath: string;
  kind: "document" | "audio" | "skip";
}[] {
  const discovered: {
    path: string;
    relativePath: string;
    kind: "document" | "audio" | "skip";
  }[] = [];

  function visit(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true }).sort(
      compareNames,
    );
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(inboxRoot, path);
      if (entry.isSymbolicLink()) {
        discovered.push({ path, relativePath, kind: "skip" });
      } else if (entry.isDirectory()) {
        visit(path);
      } else if (!entry.isFile()) {
        discovered.push({ path, relativePath, kind: "skip" });
      } else {
        const extension = extname(entry.name).toLowerCase();
        const kind = documentExtensions.has(extension)
          ? "document"
          : audioExtensions.has(extension)
            ? "audio"
            : "skip";
        discovered.push({ path, relativePath, kind });
      }
    }
  }

  visit(inboxRoot);
  return discovered;
}

function addResult(
  result: InboxIngestResult,
  item: InboxItemResult,
): void {
  result.items.push(item);
  const countKey: Record<InboxItemStatus, keyof InboxIngestResult> = {
    processed: "processed",
    duplicate: "duplicates",
    skipped: "skipped",
    failed: "failed",
  };
  const key = countKey[item.status];
  if (key !== "items") {
    result[key] += 1;
  }
}

export function ingestInbox(dataRoot: string): InboxIngestResult {
  const { inboxRoot, processedRoot } = inboxPaths(dataRoot);
  mkdirSync(inboxRoot, { recursive: true, mode: 0o700 });
  let canonicalInbox: string;
  try {
    const stats = lstatSync(inboxRoot);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new KnowledgeInputError("Inbox path must reference a directory.");
    }
    canonicalInbox = realpathSync(inboxRoot);
  } catch (error) {
    if (error instanceof KnowledgeInputError) {
      throw error;
    }
    throw new KnowledgeInputError("Inbox path could not be read.");
  }

  const result: InboxIngestResult = {
    processed: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };
  let discovered;
  try {
    discovered = discoverInbox(canonicalInbox);
  } catch {
    throw new KnowledgeInputError("Inbox path could not be read.");
  }

  for (const item of discovered) {
    if (item.kind === "skip") {
      addResult(result, {
        path: item.relativePath,
        status: "skipped",
        message: "Unsupported inbox entry.",
      });
      continue;
    }
    if (item.kind === "audio") {
      addResult(result, {
        path: item.relativePath,
        status: "failed",
        message: "Local audio processing is not implemented yet.",
      });
      continue;
    }

    let status: Extract<InboxItemStatus, "processed" | "duplicate"> =
      "processed";
    let recordId: string;
    try {
      recordId = addFile(dataRoot, item.path).id;
    } catch (error) {
      if (error instanceof DuplicateKnowledgeError) {
        status = "duplicate";
        recordId = error.existingRecordId;
      } else {
        addResult(result, {
          path: item.relativePath,
          status: "failed",
          message:
            error instanceof KnowledgeInputError
              ? error.message
              : "Document processing failed.",
        });
        continue;
      }
    }

    try {
      moveToProcessed(canonicalInbox, processedRoot, item.path);
      addResult(result, {
        path: item.relativePath,
        status,
        recordId,
      });
    } catch {
      addResult(result, {
        path: item.relativePath,
        status: "failed",
        recordId,
        message: "Durable record exists, but moving the inbox input failed.",
      });
    }
  }

  return result;
}
