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

export type KnowledgeSourceType =
  | "note"
  | "managed-file"
  | "indexed-file"
  | "audio";

export type KnowledgeProcessingState = "pending" | "ready" | "failed";

export interface SourceProvenance {
  adapter: string;
  externalReference?: Record<string, string>;
  originalName?: string;
  claimedMimeType?: string;
  detectedMediaType?: string;
  detectedContainer?: string;
  detectedCodec?: string;
  byteLength: number;
  checksum: string;
}

export type MediaSourceKind = "local-file" | "remote";

export interface MediaDescriptor {
  sourceKind: MediaSourceKind;
  originalName?: string;
  claimedMimeType?: string;
  detectedMediaType: string;
  detectedContainer: string;
  detectedCodec: string;
  byteLength: number;
  checksum: string;
}

export interface KnowledgeRecord {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string | null;
  sourceReference: string;
  capturedAt: string;
  state: KnowledgeProcessingState;
  normalizedText: string;
  provenance: SourceProvenance;
  error: string | null;
}

export type ProcessingAttemptStatus = "succeeded" | "failed";

export interface ProcessingAttempt {
  id: string;
  recordId: string;
  schemaVersion: 1;
  implementation: "whisper-cli";
  implementationVersion: string;
  modelFilename: string;
  modelChecksum: string;
  language: string;
  startedAt: string;
  completedAt: string;
  status: ProcessingAttemptStatus;
  exitStatus: number | null;
  diagnostic: string | null;
}

export interface KnowledgeSearchResult {
  position: number;
  recordId: string;
  title: string | null;
  sourceType: KnowledgeSourceType;
  excerpt: string;
  sourceReference: string;
  capturedAt: string;
  rank: number;
}

export interface RepositoryIndexResult {
  indexed: number;
  unchanged: number;
  updated: number;
  skipped: number;
  missing: number;
  failed: number;
}

export type InboxItemStatus =
  | "processed"
  | "duplicate"
  | "skipped"
  | "failed";

export interface InboxItemResult {
  path: string;
  status: InboxItemStatus;
  recordId?: string;
  message?: string;
}

export interface InboxIngestResult {
  processed: number;
  duplicates: number;
  skipped: number;
  failed: number;
  items: InboxItemResult[];
}
