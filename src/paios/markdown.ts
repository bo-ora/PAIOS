import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type {
  DebtCounts,
  PendingPlanItem,
  PhaseStatus,
  RoadmapStatus,
  SessionStatus,
  TechnicalDebtStatus,
} from "./types.js";

export interface SessionDetails {
  metadata: SessionStatus;
  unresolvedQuestions: string[];
  nextAction: string | null;
}

function repositoryPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

function markdownFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...markdownFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files.sort();
}

function section(content: string, heading: string): string | null {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) {
    return null;
  }
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line?.startsWith("## ")) {
      break;
    }
    collected.push(line ?? "");
  }
  return collected.join("\n");
}

function listItems(content: string): string[] {
  const items: string[] = [];
  let current: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/.exec(line);
    if (match?.[1] !== undefined) {
      if (current !== null) {
        items.push(current);
      }
      current = match[1].toLowerCase() === "none." ? null : match[1];
    } else if (current !== null && /^\s+\S/.test(line)) {
      current = `${current} ${line.trim()}`;
    } else if (line.trim().length > 0) {
      items.push(current ?? "");
      current = null;
    }
  }
  if (current !== null) {
    items.push(current);
  }
  return items.filter((item) => item.length > 0);
}

function metadataValue(content: string, key: string): string | null {
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(content);
  return match?.[1] ?? null;
}

function tableRows(content: string): string[][] {
  const rows: string[][] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      continue;
    }
    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (
      cells.every((cell) => /^:?-{3,}:?$/.test(cell)) ||
      cells[0]?.toLowerCase() === "phase" ||
      cells[0]?.toLowerCase() === "id"
    ) {
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

function plainCell(cell: string): string {
  return cell.replaceAll("`", "").replaceAll("**", "").trim();
}

export function collectLatestSession(
  root: string,
  warnings: string[],
): SessionDetails | null {
  const sessionsDirectory = join(root, "docs/sessions");
  const candidates = markdownFiles(sessionsDirectory).filter((path) =>
    /^\d{4}-\d{2}-\d{2}-\d{4}-.+\.md$/.test(path.split(sep).at(-1) ?? ""),
  );
  const latestPath = candidates.at(-1);
  if (latestPath === undefined) {
    warnings.push("No session summaries found under docs/sessions/");
    return null;
  }

  const content = readFileSync(latestPath, "utf8");
  const date = metadataValue(content, "Date");
  const role = metadataValue(content, "Role");
  const status = metadataValue(content, "Status");
  const path = repositoryPath(root, latestPath);
  if (date === null || role === null || status === null) {
    warnings.push(`Malformed ${path}: missing Date, Role, or Status metadata`);
    return null;
  }

  const blockers = section(content, "Blockers and Open Questions");
  const followUp = section(content, "Follow-up");
  if (blockers === null) {
    warnings.push(`Malformed ${path}: missing Blockers and Open Questions section`);
  }
  if (followUp === null) {
    warnings.push(`Malformed ${path}: missing Follow-up section`);
  }

  return {
    metadata: { path, date, role, status },
    unresolvedQuestions: blockers === null ? [] : listItems(blockers),
    nextAction: followUp === null ? null : (listItems(followUp)[0] ?? null),
  };
}

export function collectPendingPlanItems(root: string): PendingPlanItem[] {
  const plansDirectory = join(root, "docs/plans");
  const items: PendingPlanItem[] = [];
  for (const path of markdownFiles(plansDirectory)) {
    const content = readFileSync(path, "utf8");
    let current: PendingPlanItem | null = null;
    for (const line of content.split(/\r?\n/)) {
      const checkbox = /^\s*-\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
      if (checkbox !== null) {
        if (current !== null) {
          items.push(current);
        }
        current =
          checkbox[1] === " " && checkbox[2] !== undefined
            ? {
                path: repositoryPath(root, path),
                text: checkbox[2],
              }
            : null;
      } else if (current !== null && /^\s+\S/.test(line)) {
        current.text = `${current.text} ${line.trim()}`;
      } else if (line.trim().length > 0) {
        if (current !== null) {
          items.push(current);
        }
        current = null;
      }
    }
    if (current !== null) {
      items.push(current);
    }
  }
  return items;
}

export function collectRoadmap(
  root: string,
  warnings: string[],
): RoadmapStatus {
  const path = "docs/ROADMAP.md";
  const absolutePath = join(root, path);
  const empty: RoadmapStatus = {
    path,
    currentPhase: null,
    nextPhase: null,
  };
  if (!existsSync(absolutePath)) {
    warnings.push(`Missing expected document: ${path}`);
    return empty;
  }

  const content = readFileSync(absolutePath, "utf8");
  const phaseTable = section(content, "Phase Table");
  if (phaseTable === null) {
    warnings.push(`Malformed ${path}: missing Phase Table section`);
    return empty;
  }

  const phases: PhaseStatus[] = [];
  for (const cells of tableRows(phaseTable)) {
    if (cells.length < 3) {
      warnings.push(
        `Malformed ${path}: phase row must contain at least 3 cells`,
      );
      continue;
    }
    const phaseCell = plainCell(cells[0] ?? "");
    const match = /^(\d+)\s+[—-]\s+(.+)$/.exec(phaseCell);
    if (match?.[1] === undefined || match[2] === undefined) {
      warnings.push(`Malformed ${path}: invalid phase cell "${phaseCell}"`);
      continue;
    }
    const state = plainCell(cells[1] ?? "");
    const value = plainCell(cells[2] ?? "");
    if (match[2].trim() === "" || state === "" || value === "") {
      warnings.push(
        `Malformed ${path}: phase row contains an empty required cell`,
      );
      continue;
    }
    phases.push({
      id: Number.parseInt(match[1], 10),
      name: match[2],
      state,
      value,
    });
  }

  const active = phases.filter(
    (phase) => phase.state === "in-progress" || phase.state === "blocked",
  );
  if (active.length !== 1) {
    warnings.push(
      `Malformed ${path}: expected exactly one active phase, found ${active.length}`,
    );
    return empty;
  }
  const currentPhase = active[0] ?? null;
  const currentIndex = phases.findIndex((phase) => phase === currentPhase);
  const nextPhase =
    phases.slice(currentIndex + 1).find((phase) => phase.state !== "deferred") ??
    null;

  return { path, currentPhase, nextPhase };
}

export function collectTechnicalDebt(
  root: string,
  warnings: string[],
): TechnicalDebtStatus {
  const path = "docs/TECH_DEBT.md";
  const counts: DebtCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const result: TechnicalDebtStatus = {
    path,
    unresolvedBySeverity: counts,
  };
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) {
    warnings.push(`Missing expected document: ${path}`);
    return result;
  }

  const content = readFileSync(absolutePath, "utf8");
  const debtTable = section(content, "Debt Items");
  if (debtTable === null) {
    warnings.push(`Malformed ${path}: missing Debt Items section`);
    return result;
  }

  for (const cells of tableRows(debtTable)) {
    if (cells.length < 4) {
      warnings.push(
        `Malformed ${path}: debt row must contain at least 4 cells`,
      );
      continue;
    }
    const severity = plainCell(cells[2] ?? "");
    const status = plainCell(cells[3] ?? "");
    if (
      plainCell(cells[0] ?? "") === "" ||
      plainCell(cells[1] ?? "") === "" ||
      severity === "" ||
      status === ""
    ) {
      warnings.push(
        `Malformed ${path}: debt row contains an empty required cell`,
      );
      continue;
    }
    if (status === "resolved" || status === "obsolete") {
      continue;
    }
    if (
      severity === "critical" ||
      severity === "high" ||
      severity === "medium" ||
      severity === "low"
    ) {
      counts[severity] += 1;
    } else {
      warnings.push(`Malformed ${path}: unknown severity "${severity}"`);
    }
  }
  return result;
}
