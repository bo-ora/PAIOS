export interface GitStatus {
  branch: string;
  clean: boolean;
  changed: number;
  staged: number;
  untracked: number;
}

export interface ValidationStatus {
  passed: boolean;
  errors: string[];
}

export interface SessionStatus {
  path: string;
  date: string;
  role: string;
  status: string;
}

export interface PendingPlanItem {
  path: string;
  text: string;
}

export interface PhaseStatus {
  id: number;
  name: string;
  state: string;
  value: string;
}

export interface RoadmapStatus {
  path: "docs/ROADMAP.md";
  currentPhase: PhaseStatus | null;
  nextPhase: PhaseStatus | null;
}

export interface DebtCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TechnicalDebtStatus {
  path: "docs/TECH_DEBT.md";
  unresolvedBySeverity: DebtCounts;
}

export interface ProjectStatus {
  git: GitStatus;
  validation: ValidationStatus;
  latestSession: SessionStatus | null;
  unresolvedQuestions: string[];
  pendingPlanItems: PendingPlanItem[];
  nextAction: string | null;
  roadmap: RoadmapStatus;
  technicalDebt: TechnicalDebtStatus;
  warnings: string[];
}
