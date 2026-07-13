import type { OverviewData } from "./types";

export const mockOverview: OverviewData = {
  mode: "safe",
  autoWatch: true,
  pollIntervalMs: 10000,
  locale: "zh-CN",
  vaultRoot: "D:\\ObsidianVault",
  projectsCount: 2,
  artifactsCount: 12,
  artifactsByType: { source: 5, conversation: 5, learning_summary: 3, knowledge: 4 },
  artifactsByStatus: { candidate: 2, validated: 4, conflict: 1 },
  integration: {
    name: "ChatGPT Codex",
    available: true,
    command: "codex.exe app-server",
    version: "codex-cli 0.142.0",
    detail: null
  },
  workspaceMappings: [
    { path: "D:\\ObsidianVault\\oca-duplex-public", project: "OCA-Duplex" },
    { path: "D:\\AIProjects", project: "AI Projects" }
  ],
  projects: [
    { name: "OCA-Duplex", path: "项目/OCA-Duplex", sourcePath: "D:\\ObsidianVault\\oca-duplex-public", updatedAt: "刚刚", status: "synced", counts: { sources: 3, summaries: 2, knowledge: 3 }, totalArtifacts: 8 },
    { name: "AI Projects", path: "项目/AI Projects", sourcePath: "D:\\AIProjects", updatedAt: "18 分钟前", status: "review", counts: { sources: 2, summaries: 1, knowledge: 1 }, totalArtifacts: 4 }
  ],
  artifacts: [
    { path: "项目/OCA-Duplex/学习总结/架构决策.md", title: "架构决策与实现进度", type: "learning_summary", status: "active", project: "OCA-Duplex", sourceThreadId: "019f4ab6", sourceTurnId: "turn-1", knowledgeOperation: null, updatedAt: "1 分钟前" },
    { path: "项目/OCA-Duplex/知识库/目录语言迁移规则.md", title: "目录语言迁移规则", type: "knowledge", status: "candidate", project: "OCA-Duplex", sourceThreadId: "019f4ab6", sourceTurnId: "turn-1", knowledgeOperation: "add", updatedAt: "2 分钟前" },
    { path: "项目/OCA-Duplex/原始对话/系统设计.md", title: "系统设计与桌面应用", type: "conversation", status: "captured", project: "OCA-Duplex", sourceThreadId: "019f4ab6", sourceTurnId: "turn-1", knowledgeOperation: null, updatedAt: "2 分钟前" }
  ],
  activity: [
    { eventId: "e1", occurredAt: "09:21", operation: "upsert_learning_summary", artifactType: "learning_summary", target: "项目/OCA-Duplex/学习总结/架构决策.md", outcome: "updated", projectRoot: "项目/OCA-Duplex", transactionId: "tx-8f21", knowledgeOperation: null },
    { eventId: "e2", occurredAt: "09:19", operation: "create_if_absent", artifactType: "knowledge", target: "项目/OCA-Duplex/知识库/目录语言迁移规则.md", outcome: "created", projectRoot: "项目/OCA-Duplex", transactionId: "tx-8f21", knowledgeOperation: "add" }
  ]
};
