export type ViewId = "overview" | "projects" | "unclassified" | "conversations" | "summaries" | "knowledge" | "activity" | "settings";

export interface ProjectRecord {
  name: string;
  path: string;
  sourcePath?: string;
  updatedAt: string;
  status: "synced" | "review" | "conflict";
  counts: Record<string, number>;
  totalArtifacts: number;
}

export interface ArtifactRecord {
  path: string;
  title: string;
  type: string;
  status: string | null;
  project: string | null;
  sourceThreadId: string | null;
  sourceTurnId: string | null;
  knowledgeOperation: string | null;
  updatedAt: string;
}

export interface ActivityRecord {
  eventId: string;
  occurredAt: string;
  operation: string;
  artifactType: string;
  target: string;
  outcome: string;
  projectRoot: string | null;
  transactionId: string;
  knowledgeOperation: string | null;
}

export interface OverviewData {
  mode: "safe" | "manual" | "all";
  autoWatch: boolean;
  pollIntervalMs: number;
  locale: "zh-CN" | "en-US";
  vaultRoot: string;
  projectsCount: number;
  artifactsCount: number;
  unclassifiedCount: number;
  artifactsByType: Record<string, number>;
  artifactsByStatus: Record<string, number>;
  workspaceMappings: Array<{ path: string; project: string }>;
  integration: {
    name: string;
    available: boolean;
    command: string;
    version: string | null;
    detail: string | null;
  };
  projects: ProjectRecord[];
  artifacts: ArtifactRecord[];
  activity: ActivityRecord[];
}
