import { collectGitStatus } from "./git.js";
import {
  collectLatestSession,
  collectPendingPlanItems,
  collectRoadmap,
  collectTechnicalDebt,
} from "./markdown.js";
import type { ProjectStatus } from "./types.js";
import { validateRepository } from "./validation.js";

export function collectStatus(root: string): ProjectStatus {
  const warnings: string[] = [];
  const roadmap = collectRoadmap(root, warnings);
  const technicalDebt = collectTechnicalDebt(root, warnings);
  const latestSession = collectLatestSession(root, warnings);

  return {
    git: collectGitStatus(root),
    validation: validateRepository(root),
    latestSession: latestSession?.metadata ?? null,
    unresolvedQuestions: latestSession?.unresolvedQuestions ?? [],
    pendingPlanItems: collectPendingPlanItems(root),
    nextAction: latestSession?.nextAction ?? null,
    roadmap,
    technicalDebt,
    warnings,
  };
}
