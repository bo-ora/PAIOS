import type { ProjectStatus } from "./types.js";

function lineItems(lines: string[], title: string, items: string[]): void {
  lines.push(`${title} (${items.length}):`);
  if (items.length === 0) {
    lines.push("  None");
    return;
  }
  for (const item of items) {
    lines.push(`  - ${item}`);
  }
}

export function formatHuman(status: ProjectStatus): string {
  const lines = [
    "PAIOS Project Status",
    "",
    `Git: ${status.git.branch} — ${status.git.clean ? "clean" : "dirty"} ` +
      `(changed ${status.git.changed}, staged ${status.git.staged}, ` +
      `untracked ${status.git.untracked})`,
    `Validation: ${status.validation.passed ? "passed" : "failed"}`,
  ];

  for (const error of status.validation.errors) {
    lines.push(`  - ${error}`);
  }

  lines.push("", `Roadmap: ${status.roadmap.path}`);
  if (status.roadmap.currentPhase === null) {
    lines.push("Current phase: unavailable");
  } else {
    const phase = status.roadmap.currentPhase;
    lines.push(`Current phase: ${phase.id} — ${phase.name} [${phase.state}]`);
    lines.push(`Current value: ${phase.value}`);
  }
  if (status.roadmap.nextPhase === null) {
    lines.push("Next phase: unavailable");
  } else {
    const phase = status.roadmap.nextPhase;
    lines.push(`Next phase: ${phase.id} — ${phase.name} [${phase.state}]`);
    lines.push(`Next value: ${phase.value}`);
  }

  const debt = status.technicalDebt.unresolvedBySeverity;
  lines.push(
    "",
    `Technical debt register: ${status.technicalDebt.path}`,
    `Technical debt: critical ${debt.critical}, high ${debt.high}, ` +
      `medium ${debt.medium}, low ${debt.low}`,
    "",
  );

  if (status.latestSession === null) {
    lines.push("Latest session: unavailable");
  } else {
    lines.push(`Latest session: ${status.latestSession.path}`);
    lines.push(
      `Session metadata: ${status.latestSession.date}; ` +
        `${status.latestSession.role}; ${status.latestSession.status}`,
    );
  }

  lineItems(lines, "Unresolved questions", status.unresolvedQuestions);
  lineItems(
    lines,
    "Pending plan items",
    status.pendingPlanItems.map((item) => `${item.path} — ${item.text}`),
  );
  lines.push(`Next action: ${status.nextAction ?? "unavailable"}`);
  lineItems(lines, "Warnings", status.warnings);

  return `${lines.join("\n")}\n`;
}
