export type AppLocale = "zh-CN" | "en-US";

const zh = {
  nav: { overview: "总览", projects: "项目", conversations: "原始对话", summaries: "学习总结", knowledge: "知识库", activity: "活动记录", settings: "设置" },
  common: { openObsidian: "打开 Obsidian", syncNow: "立即同步", more: "更多操作", refresh: "刷新数据", cancel: "取消", back: "返回", continue: "继续", browse: "浏览", none: "暂无", path: "路径", status: "状态", settings: "打开设置", remove: "移除", add: "添加", close: "关闭" },
  brand: "ChatGPT Codex × Obsidian",
  overview: {
    title: "知识工作台", subtitle: "清楚看到读取了什么、写入了什么、哪些需要确认",
    projects: "授权项目", projectsHint: "个 Vault 项目已识别", conversations: "原始对话", conversationsHint: "按 ChatGPT 中的 Codex 任务聚合",
    candidates: "候选知识", candidatesHint: "需要确认后再验证", conflicts: "待处理冲突", conflictsNow: "建议尽快处理", noConflicts: "当前没有冲突",
    recentProjects: "最近读取的项目", recentProjectsHint: "仅显示已授权或已映射的工作目录", viewAll: "查看全部项目",
    projectName: "项目名称", sourcePath: "来源路径", lastRead: "最近读取", content: "内容", recentWrites: "最近写入", recentWritesHint: "来自隐私友好的审计记录"
  },
  projects: { title: "项目", subtitle: "工作目录与 Obsidian 项目一一对应，避免内容混入其他项目", add: "添加项目", noSource: "未关联来源目录", conversation: "对话", summary: "总结", knowledge: "知识", output: "成果" },
  artifacts: { conversationsTitle: "原始对话", conversationsSubtitle: "同一 Codex 任务的多轮对话保存为一份连续记录", summariesTitle: "学习总结", summariesSubtitle: "每个任务一份当前结论与持续学习历程", search: "搜索", empty: "目前没有" },
  knowledge: { title: "知识库", subtitle: "候选知识经过确认后才成为已验证知识", merge: "处理合并与冲突", all: "全部", candidate: "候选", validated: "已验证", conflict: "冲突", superseded: "已替代", operation: "操作", add: "新增", validate: "确认并验证", archive: "驳回并归档", markSuperseded: "标记为已替代", reviewProject: "查看待确认知识", reviewed: "知识状态已更新" },
  activity: { title: "活动记录", subtitle: "只记录操作元数据，不在审计日志中保存对话正文", export: "导出审计记录", time: "时间", operation: "操作", type: "类型", target: "目标", result: "结果", transaction: "事务" },
  settings: {
    title: "设置", subtitle: "切换读取范围、语言、项目授权和应用集成", modeTitle: "读取模式", modeDescription: "控制 OCA-Duplex 可以读取哪些 ChatGPT Codex 任务。",
    safe: "安全模式", safeDescription: "只读取明确授权的项目目录，推荐公开发行版使用。", manual: "手动模式", manualDescription: "点击同步时先选择具体任务。", all: "全部模式", allDescription: "检查最近任务并按工作目录路由。",
    languageTitle: "目录与界面语言", languageDescription: "界面与 Vault 目录保持同一语言；迁移前会检查冲突。", chinese: "纯中文", english: "English",
    vaultTitle: "Obsidian Vault", vaultHint: "更换 Vault 会创建独立配置。当前版本请通过首次向导初始化另一个 Vault。",
    workspaceTitle: "授权项目", workspaceDescription: "一个工作目录只映射到一个 Obsidian 项目，避免内容混写。", workspacePath: "ChatGPT Codex 工作目录", projectName: "写入项目名称", projectPlaceholder: "例如：OCA-Duplex", noWorkspaces: "当前没有授权目录。",
    integrationTitle: "ChatGPT / Codex 集成", integrationReady: "已找到本地 Codex 运行时", integrationMissing: "未找到可用的 Codex 运行时", integrationHint: "新版 ChatGPT 桌面应用已包含 Codex；OCA-Duplex 通过本地 codex.exe 读取任务，不读取普通 Chat 对话。",
    autoWatchTitle: "自动监听新回合", autoWatchDescription: "应用打开时定时检查已完成的 Codex 回合；只生成预览，确认后才写入。", autoWatchOn: "已开启", autoWatchOff: "已关闭", autoWatchManual: "手动模式下不会自动扫描，请点击“立即同步”选择任务。"
  },
  inspector: { title: "Vault 概览", projectInspector: "项目检查器", artifactInspector: "内容检查器", vaultStructure: "Vault 结构", knowledgeStatus: "知识状态", sourceTask: "来源任务", recentTransaction: "最近事务", open: "在 Obsidian 中打开", project: "项目", targetPath: "Vault 写入路径", sourceWorkspace: "来源工作目录" },
  setup: {
    vaultTitle: "连接你的 Obsidian Vault", vaultDescription: "所有内容只写入你选择的本地 Vault，应用不会上传对话正文。", vaultPlaceholder: "选择 Vault 文件夹",
    languageTitle: "选择目录与界面语言", languageDescription: "界面与项目结构会保持纯中文或纯英文，之后可以安全迁移。", chineseLayout: "项目 / 原始对话 / 学习总结 / 知识库", englishLayout: "Projects / Conversations / Learning Summaries / Knowledge",
    scopeTitle: "设置读取范围", scopeDescription: "推荐安全模式：只读取你明确授权的项目目录。", finish: "完成设置",
    localFirst: "本地优先 · 默认不保存工具输出 · 可随时撤销授权"
  },
  sync: { title: "确认本次同步", tasks: "个 Codex 任务", operations: "个文件操作", sources: "原始对话", summaries: "学习总结", candidates: "候选知识", conflicts: "冲突", empty: "没有发现尚未处理的新任务", confirm: "确认写入", failed: "同步失败", noNew: "没有新的已完成回合，已同步内容不会重复显示。", success: "同步完成", successDetail: "本次已按确认的回合写入并更新状态。", changedFiles: "个文件发生变化", autoFound: "监听到新的已完成回合，请确认后写入。" },
  picker: { title: "选择要同步的 Codex 任务", subtitle: "手动模式只读取本次勾选的任务", loading: "正在读取 ChatGPT Codex 任务…", empty: "没有找到可用任务", preview: "预览所选任务", selectOne: "请至少选择一个任务" },
  system: { running: "系统运行中", authorized: "个授权项目", ready: "集成正常", attention: "需要检查", listening: "正在监听新回合", scanning: "正在检查更新", paused: "自动监听已暂停", manual: "手动同步模式", lastScan: "最近检查" },
  fatal: "无法读取 OCA-Duplex 数据", loading: "正在读取本地知识库…",
  statuses: { synced: "已同步", review: "待确认", conflict: "冲突", candidate: "候选", validated: "已验证", superseded: "已替代", archived: "已归档", active: "有效", created: "已创建", updated: "已更新", completed: "完成", captured: "已捕获", skipped_existing: "已存在，已跳过" },
  types: { conversation: "原始对话", source: "原始对话", learning_summary: "学习总结", knowledge: "知识", prompt: "提示词", output: "输出成果", decision: "决策" }
};

type Localized<T> = { [K in keyof T]: T[K] extends string ? string : Localized<T[K]> };

const en: Localized<typeof zh> = {
  nav: { overview: "Overview", projects: "Projects", conversations: "Conversations", summaries: "Learning Summaries", knowledge: "Knowledge", activity: "Activity", settings: "Settings" },
  common: { openObsidian: "Open Obsidian", syncNow: "Sync now", more: "More actions", refresh: "Refresh data", cancel: "Cancel", back: "Back", continue: "Continue", browse: "Browse", none: "None", path: "Path", status: "Status", settings: "Open settings", remove: "Remove", add: "Add", close: "Close" },
  brand: "ChatGPT Codex × Obsidian",
  overview: {
    title: "Knowledge Workspace", subtitle: "See what was read, what was written, and what needs review",
    projects: "Authorized projects", projectsHint: "Vault projects identified", conversations: "Conversations", conversationsHint: "Grouped by Codex tasks in ChatGPT",
    candidates: "Candidate knowledge", candidatesHint: "Review before validation", conflicts: "Open conflicts", conflictsNow: "Review recommended", noConflicts: "No current conflicts",
    recentProjects: "Recently read projects", recentProjectsHint: "Only authorized or mapped workspaces are shown", viewAll: "View all projects",
    projectName: "Project", sourcePath: "Source path", lastRead: "Last read", content: "Content", recentWrites: "Recent writes", recentWritesHint: "From privacy-friendly audit metadata"
  },
  projects: { title: "Projects", subtitle: "Map each workspace to one Obsidian project to prevent mixed content", add: "Add project", noSource: "No source workspace", conversation: "Chats", summary: "Summaries", knowledge: "Knowledge", output: "Outputs" },
  artifacts: { conversationsTitle: "Conversations", conversationsSubtitle: "Multiple turns in one Codex task stay in one continuous source note", summariesTitle: "Learning Summaries", summariesSubtitle: "One current summary and learning history per task", search: "Search", empty: "No" },
  knowledge: { title: "Knowledge", subtitle: "Candidate knowledge becomes validated only after review", merge: "Review merges and conflicts", all: "All", candidate: "Candidate", validated: "Validated", conflict: "Conflict", superseded: "Superseded", operation: "Operation", add: "Add", validate: "Validate", archive: "Reject and archive", markSuperseded: "Mark superseded", reviewProject: "Review pending knowledge", reviewed: "Knowledge status updated" },
  activity: { title: "Activity", subtitle: "Audit logs contain operation metadata, not conversation text", export: "Export audit log", time: "Time", operation: "Operation", type: "Type", target: "Target", result: "Result", transaction: "Transaction" },
  settings: {
    title: "Settings", subtitle: "Manage read scope, language, project access, and integrations", modeTitle: "Read scope", modeDescription: "Control which ChatGPT Codex tasks OCA-Duplex can read.",
    safe: "Safe", safeDescription: "Read only explicitly authorized project folders. Recommended for public releases.", manual: "Manual", manualDescription: "Choose specific tasks whenever you sync.", all: "All", allDescription: "Check recent tasks and route them by workspace.",
    languageTitle: "Folder and interface language", languageDescription: "Keep the interface and Vault structure in one language; conflicts are checked before migration.", chinese: "纯中文", english: "English",
    vaultTitle: "Obsidian Vault", vaultHint: "Changing Vault creates a separate configuration. Use first-run setup to initialize another Vault.",
    workspaceTitle: "Authorized projects", workspaceDescription: "Map each workspace to exactly one Obsidian project to prevent mixed content.", workspacePath: "ChatGPT Codex workspace", projectName: "Obsidian project name", projectPlaceholder: "For example: OCA-Duplex", noWorkspaces: "No authorized workspaces yet.",
    integrationTitle: "ChatGPT / Codex integration", integrationReady: "Local Codex runtime found", integrationMissing: "No usable Codex runtime found", integrationHint: "The new ChatGPT desktop app includes Codex. OCA-Duplex reads local Codex tasks through codex.exe; ordinary Chat conversations are not read.",
    autoWatchTitle: "Watch for new turns", autoWatchDescription: "While the app is open, periodically check completed Codex turns. A review is shown before anything is written.", autoWatchOn: "On", autoWatchOff: "Off", autoWatchManual: "Automatic scanning is paused in Manual mode. Use Sync now to choose tasks."
  },
  inspector: { title: "Vault overview", projectInspector: "Project inspector", artifactInspector: "Content inspector", vaultStructure: "Vault structure", knowledgeStatus: "Knowledge status", sourceTask: "Source task", recentTransaction: "Recent transaction", open: "Open in Obsidian", project: "Project", targetPath: "Vault target path", sourceWorkspace: "Source workspace" },
  setup: {
    vaultTitle: "Connect your Obsidian Vault", vaultDescription: "Everything is written only to the local Vault you choose. Conversation text is not uploaded.", vaultPlaceholder: "Choose a Vault folder",
    languageTitle: "Choose folder and interface language", languageDescription: "The interface and project structure stay fully Chinese or fully English and can be migrated later.", chineseLayout: "项目 / 原始对话 / 学习总结 / 知识库", englishLayout: "Projects / Conversations / Learning Summaries / Knowledge",
    scopeTitle: "Set the read scope", scopeDescription: "Safe mode is recommended: only read project folders you explicitly authorize.", finish: "Finish setup",
    localFirst: "Local first · Tool output is off by default · Access can be revoked"
  },
  sync: { title: "Review this sync", tasks: "Codex tasks", operations: "file operations", sources: "Conversations", summaries: "Learning summaries", candidates: "Candidate knowledge", conflicts: "Conflicts", empty: "No unprocessed tasks were found", confirm: "Confirm write", failed: "Sync failed", noNew: "No new completed turns. Previously synced content will not be shown again.", success: "Sync complete", successDetail: "Only the reviewed turns were written and marked processed.", changedFiles: "files changed", autoFound: "New completed turns were detected. Review them before writing." },
  picker: { title: "Choose Codex tasks to sync", subtitle: "Manual mode reads only the tasks selected here", loading: "Loading ChatGPT Codex tasks…", empty: "No tasks found", preview: "Preview selected tasks", selectOne: "Select at least one task" },
  system: { running: "System running", authorized: "authorized projects", ready: "Integration ready", attention: "Needs attention", listening: "Listening for completed turns", scanning: "Checking for updates", paused: "Automatic watch paused", manual: "Manual sync mode", lastScan: "Last scan" },
  fatal: "Unable to read OCA-Duplex data", loading: "Reading local knowledge base…",
  statuses: { synced: "Synced", review: "Review", conflict: "Conflict", candidate: "Candidate", validated: "Validated", superseded: "Superseded", archived: "Archived", active: "Active", created: "Created", updated: "Updated", completed: "Complete", captured: "Captured", skipped_existing: "Already exists" },
  types: { conversation: "Conversation", source: "Conversation", learning_summary: "Learning summary", knowledge: "Knowledge", prompt: "Prompt", output: "Output", decision: "Decision" }
};

export type Copy = Localized<typeof zh>;

export function getCopy(locale: AppLocale): Copy {
  return locale === "en-US" ? en : zh;
}
