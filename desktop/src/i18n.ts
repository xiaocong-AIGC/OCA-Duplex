export type AppLocale = "zh-CN" | "en-US";

const zh = {
  nav: { overview: "运营总览", projects: "项目资产", conversations: "对话底稿", summaries: "复盘总结", knowledge: "待审知识", activity: "入库流水", settings: "运行策略" },
  common: { openObsidian: "打开资产库", syncNow: "立即检查", more: "更多操作", refresh: "刷新数据", cancel: "取消", back: "返回", continue: "继续", browse: "选择目录", none: "暂无", path: "路径", status: "状态", settings: "运行策略", remove: "移除", add: "添加", close: "关闭" },
  brand: "ChatGPT Codex × Obsidian",
  overview: {
    title: "内容资产运营台", subtitle: "监听 ChatGPT/Codex 项目对话，把可复用结论转成可审核、可追溯的运营资产",
    projects: "已沉淀项目", projectsHint: "个项目已产生入库资产", conversations: "对话资产", conversationsHint: "已确认写入的项目对话",
    candidates: "待运营审核", candidatesHint: "确认后进入正式知识库", conflicts: "规则冲突", conflictsNow: "需要运营判断", noConflicts: "当前没有冲突",
    recentProjects: "项目资产盘点", recentProjectsHint: "这里展示已经写入 Vault 的结果，不是监听来源", viewAll: "查看全部资产",
    projectName: "项目", sourcePath: "ChatGPT/Codex 工作目录", lastRead: "最近入库", content: "资产数", recentWrites: "最近入库", recentWritesHint: "仅展示实际发生变化的内容资产"
  },
  projects: { title: "项目资产", subtitle: "按工作目录隔离项目，运营复盘、知识与成果不串库", add: "配置项目", noSource: "由工作目录自动识别", conversation: "底稿", summary: "复盘", knowledge: "知识", output: "成果" },
  artifacts: { conversationsTitle: "对话底稿", conversationsSubtitle: "保留项目决策上下文，方便运营追溯结论来源", summariesTitle: "复盘总结", summariesSubtitle: "持续维护每个任务的当前结论、方法和下一步动作", search: "搜索", empty: "暂无" },
  knowledge: { title: "待审知识", subtitle: "只有运营确认过的规则和方法才能进入正式知识库", merge: "只看冲突", all: "全部", candidate: "待审核", validated: "已采用", conflict: "冲突", superseded: "已淘汰", operation: "处理方式", add: "新增", validate: "采用并入库", archive: "不采用", markSuperseded: "淘汰旧规则", reviewProject: "处理待审知识", reviewed: "知识处理结果已保存" },
  activity: { title: "入库流水", subtitle: "记录谁在什么时候处理了什么，不保存额外对话副本", export: "导出流水", time: "时间", operation: "动作", type: "资产类型", target: "入库位置", result: "结果", transaction: "批次" },
  settings: {
    title: "运行策略", subtitle: "管理监听范围、项目隔离、入库语言和数据清理", modeTitle: "监听范围", modeDescription: "决定哪些 ChatGPT/Codex 项目任务进入运营待处理队列。",
    safe: "安全模式", safeDescription: "只读取明确授权的项目目录，推荐公开发行版使用。", manual: "手动模式", manualDescription: "点击同步时先选择具体任务。", all: "全部模式", allDescription: "检查最近任务并按工作目录路由。",
    languageTitle: "目录与界面语言", languageDescription: "界面与 Vault 目录保持同一语言；迁移前会检查冲突。", chinese: "纯中文", english: "English",
    vaultTitle: "Obsidian Vault", vaultHint: "更换 Vault 会创建独立配置。当前版本请通过首次向导初始化另一个 Vault。",
    workspaceTitle: "授权项目", workspaceDescription: "一个工作目录只映射到一个 Obsidian 项目，避免内容混写。", workspacePath: "ChatGPT Codex 工作目录", projectName: "写入项目名称", projectPlaceholder: "例如：OCA-Duplex", noWorkspaces: "当前没有授权目录。",
    integrationTitle: "ChatGPT / Codex 集成", integrationReady: "已找到本地 Codex 运行时", integrationMissing: "未找到可用的 Codex 运行时", integrationHint: "新版 ChatGPT 桌面应用已包含 Codex；OCA-Duplex 通过本地 codex.exe 读取任务，不读取普通 Chat 对话。",
    autoWatchTitle: "持续监听", autoWatchDescription: "应用打开时持续检查已完成回合，结果进入右侧待处理队列，不弹窗、不自动写入。", autoWatchOn: "正在监听", autoWatchOff: "已暂停", autoWatchManual: "手动模式不自动检查，请点击“立即检查”选择任务。",
    resetTitle: "清空 OCA 历史数据", resetDescription: "删除 OCA 生成的内容、流水和处理记录，保留其他 Obsidian 笔记；当前已有回合会设为基线，只监听清空之后的新内容。", resetAction: "清空并从现在开始", resetConfirm: "将删除全部 OCA-Duplex 历史产物，但不会删除其他 Obsidian 笔记。确定继续？", resetDone: "历史数据已清空"
  },
  inspector: { title: "资产概览", projectInspector: "项目资产概览", artifactInspector: "资产详情", vaultStructure: "入库目录", knowledgeStatus: "审核状态", sourceTask: "来源任务", recentTransaction: "最近处理批次", open: "在 Obsidian 中打开", project: "项目", targetPath: "入库路径", sourceWorkspace: "来源工作目录" },
  setup: {
    vaultTitle: "连接你的 Obsidian Vault", vaultDescription: "所有内容只写入你选择的本地 Vault，应用不会上传对话正文。", vaultPlaceholder: "选择 Vault 文件夹",
    languageTitle: "选择目录与界面语言", languageDescription: "界面与项目结构会保持纯中文或纯英文，之后可以安全迁移。", chineseLayout: "项目 / 原始对话 / 学习总结 / 知识库", englishLayout: "Projects / Conversations / Learning Summaries / Knowledge",
    scopeTitle: "设置读取范围", scopeDescription: "推荐安全模式：只读取你明确授权的项目目录。", finish: "完成设置",
    localFirst: "本地优先 · 默认不保存工具输出 · 可随时撤销授权"
  },
  sync: { title: "待入库队列", tasks: "个项目任务", operations: "项入库动作", sources: "对话底稿", summaries: "复盘总结", candidates: "待审知识", conflicts: "冲突", empty: "目前没有待处理的新回合", confirm: "确认入库", failed: "处理失败", noNew: "没有发现新回合，已处理内容不会重复进入队列。", success: "入库完成", successDetail: "已按你确认的回合更新内容资产。", changedFiles: "个文件发生变化", autoFound: "发现新的已完成回合，已加入右侧待处理队列。" },
  picker: { title: "选择要同步的 Codex 任务", subtitle: "手动模式只读取本次勾选的任务", loading: "正在读取 ChatGPT Codex 任务…", empty: "没有找到可用任务", preview: "预览所选任务", selectOne: "请至少选择一个任务" },
  monitor: { title: "ChatGPT/Codex 监听台", subtitle: "来源是项目对话，Vault 只是入库目标", waiting: "等待新回合", scanning: "正在检查最近任务", queue: "待处理", writeOne: "入库此回合", writeUnsorted: "先入未归类收件箱", writeAll: "全部入库", ignore: "忽略此回合", details: "查看入库计划", project: "识别项目", routeNeeded: "项目待归类", routeHint: "当前任务没有可信的工作目录映射，将先进入未归类收件箱，避免混入其他项目。", workspace: "来源工作目录", detected: "发现新回合", started: "监听已启动", noNew: "本次检查没有新内容", wrote: "已完成入库", ignored: "已忽略，不再提醒", error: "监听异常", sourceOnly: "仅保留对话底稿" },
  system: { running: "运行状态", authorized: "个授权项目", scopeAll: "按工作目录监控最近任务", scopeManual: "仅处理手动选择的任务", ready: "ChatGPT/Codex 已连接", attention: "连接需要处理", listening: "正在监听项目对话", scanning: "正在检查新回合", paused: "监听已暂停", manual: "等待手动检查", lastScan: "最近检查" },
  fatal: "无法读取 OCA-Duplex 运行数据", loading: "正在连接 ChatGPT/Codex 与入库配置…",
  statuses: { synced: "已同步", review: "待确认", conflict: "冲突", candidate: "候选", validated: "已验证", superseded: "已替代", archived: "已归档", active: "有效", created: "已创建", updated: "已更新", completed: "完成", captured: "已捕获", skipped_existing: "已存在，已跳过" },
  types: { conversation: "原始对话", source: "原始对话", learning_summary: "学习总结", knowledge: "知识", prompt: "提示词", output: "输出成果", decision: "决策" }
};

type Localized<T> = { [K in keyof T]: T[K] extends string ? string : Localized<T[K]> };

const en: Localized<typeof zh> = {
  nav: { overview: "Operations", projects: "Project assets", conversations: "Source records", summaries: "Reviews", knowledge: "Knowledge review", activity: "Intake log", settings: "Run policy" },
  common: { openObsidian: "Open asset vault", syncNow: "Check now", more: "More actions", refresh: "Refresh data", cancel: "Cancel", back: "Back", continue: "Continue", browse: "Choose folder", none: "None", path: "Path", status: "Status", settings: "Run policy", remove: "Remove", add: "Add", close: "Close" },
  brand: "ChatGPT Codex × Obsidian",
  overview: {
    title: "Content Operations Desk", subtitle: "Monitor ChatGPT/Codex project work and turn reusable decisions into reviewed, traceable assets",
    projects: "Projects archived", projectsHint: "projects have stored assets", conversations: "Source assets", conversationsHint: "project conversations approved for storage",
    candidates: "Needs operator review", candidatesHint: "approve before it becomes active knowledge", conflicts: "Rule conflicts", conflictsNow: "operator decision required", noConflicts: "No current conflicts",
    recentProjects: "Project asset inventory", recentProjectsHint: "This is stored Vault output, not the monitoring source", viewAll: "View all assets",
    projectName: "Project", sourcePath: "ChatGPT/Codex workspace", lastRead: "Last intake", content: "Assets", recentWrites: "Recent intake", recentWritesHint: "Only content that actually changed"
  },
  projects: { title: "Project assets", subtitle: "Keep reviews, knowledge, and outputs isolated by workspace", add: "Configure project", noSource: "Detected from workspace", conversation: "Sources", summary: "Reviews", knowledge: "Knowledge", output: "Outputs" },
  artifacts: { conversationsTitle: "Source records", conversationsSubtitle: "Preserve project decision context so operators can trace every conclusion", summariesTitle: "Operating reviews", summariesSubtitle: "Maintain the current conclusion, reusable method, and next action for each task", search: "Search", empty: "No" },
  knowledge: { title: "Knowledge review", subtitle: "Only operator-approved rules and methods enter the active knowledge base", merge: "Show conflicts", all: "All", candidate: "Needs review", validated: "Adopted", conflict: "Conflict", superseded: "Retired", operation: "Disposition", add: "New", validate: "Adopt and store", archive: "Do not adopt", markSuperseded: "Retire old rule", reviewProject: "Process pending knowledge", reviewed: "Knowledge disposition saved" },
  activity: { title: "Intake log", subtitle: "Track what was processed and when without storing another conversation copy", export: "Export log", time: "Time", operation: "Action", type: "Asset type", target: "Destination", result: "Result", transaction: "Batch" },
  settings: {
    title: "Run policy", subtitle: "Manage monitoring scope, project isolation, intake language, and history", modeTitle: "Monitoring scope", modeDescription: "Choose which ChatGPT/Codex project tasks enter the operator queue.",
    safe: "Safe", safeDescription: "Read only explicitly authorized project folders. Recommended for public releases.", manual: "Manual", manualDescription: "Choose specific tasks whenever you sync.", all: "All", allDescription: "Check recent tasks and route them by workspace.",
    languageTitle: "Folder and interface language", languageDescription: "Keep the interface and Vault structure in one language; conflicts are checked before migration.", chinese: "纯中文", english: "English",
    vaultTitle: "Obsidian Vault", vaultHint: "Changing Vault creates a separate configuration. Use first-run setup to initialize another Vault.",
    workspaceTitle: "Authorized projects", workspaceDescription: "Map each workspace to exactly one Obsidian project to prevent mixed content.", workspacePath: "ChatGPT Codex workspace", projectName: "Obsidian project name", projectPlaceholder: "For example: OCA-Duplex", noWorkspaces: "No authorized workspaces yet.",
    integrationTitle: "ChatGPT / Codex integration", integrationReady: "Local Codex runtime found", integrationMissing: "No usable Codex runtime found", integrationHint: "The new ChatGPT desktop app includes Codex. OCA-Duplex reads local Codex tasks through codex.exe; ordinary Chat conversations are not read.",
    autoWatchTitle: "Continuous monitoring", autoWatchDescription: "Continuously check completed turns while the app is open. Results enter the right-hand queue without popups or automatic writes.", autoWatchOn: "Monitoring", autoWatchOff: "Paused", autoWatchManual: "Manual mode does not scan automatically. Use Check now to choose tasks.",
    resetTitle: "Clear OCA history", resetDescription: "Delete OCA-generated assets, logs, and state while preserving other Obsidian notes. Existing turns become the baseline so only future work is monitored.", resetAction: "Clear and start now", resetConfirm: "Delete all OCA-Duplex history while preserving other Obsidian notes?", resetDone: "History cleared"
  },
  inspector: { title: "Asset overview", projectInspector: "Project asset overview", artifactInspector: "Asset details", vaultStructure: "Intake folders", knowledgeStatus: "Review status", sourceTask: "Source task", recentTransaction: "Latest processing batch", open: "Open in Obsidian", project: "Project", targetPath: "Intake destination", sourceWorkspace: "Source workspace" },
  setup: {
    vaultTitle: "Connect your Obsidian Vault", vaultDescription: "Everything is written only to the local Vault you choose. Conversation text is not uploaded.", vaultPlaceholder: "Choose a Vault folder",
    languageTitle: "Choose folder and interface language", languageDescription: "The interface and project structure stay fully Chinese or fully English and can be migrated later.", chineseLayout: "项目 / 原始对话 / 学习总结 / 知识库", englishLayout: "Projects / Conversations / Learning Summaries / Knowledge",
    scopeTitle: "Set the read scope", scopeDescription: "Safe mode is recommended: only read project folders you explicitly authorize.", finish: "Finish setup",
    localFirst: "Local first · Tool output is off by default · Access can be revoked"
  },
  sync: { title: "Review this sync", tasks: "Codex tasks", operations: "file operations", sources: "Conversations", summaries: "Learning summaries", candidates: "Candidate knowledge", conflicts: "Conflicts", empty: "No unprocessed tasks were found", confirm: "Confirm write", failed: "Sync failed", noNew: "No new completed turns. Previously synced content will not be shown again.", success: "Sync complete", successDetail: "Only the reviewed turns were written and marked processed.", changedFiles: "files changed", autoFound: "New completed turns were detected. Review them before writing." },
  picker: { title: "Choose Codex tasks to sync", subtitle: "Manual mode reads only the tasks selected here", loading: "Loading ChatGPT Codex tasks…", empty: "No tasks found", preview: "Preview selected tasks", selectOne: "Select at least one task" },
  monitor: { title: "ChatGPT/Codex Monitor", subtitle: "Project conversations are the source; the Vault is only the destination", waiting: "Waiting for new turns", scanning: "Checking recent tasks", queue: "Pending", writeOne: "Store this turn", writeUnsorted: "Store in unclassified inbox", writeAll: "Store all", ignore: "Ignore this turn", details: "View intake plan", project: "Detected project", routeNeeded: "Project needs routing", routeHint: "No trustworthy workspace mapping was found. This turn will go to the unclassified inbox instead of another project.", workspace: "Source workspace", detected: "New turn detected", started: "Monitoring started", noNew: "No new content in this check", wrote: "Intake complete", ignored: "Ignored and will not reappear", error: "Monitoring error", sourceOnly: "Source record only" },
  system: { running: "Run status", authorized: "authorized projects", scopeAll: "Monitoring recent tasks by workspace", scopeManual: "Only manually selected tasks", ready: "ChatGPT/Codex connected", attention: "Connection needs attention", listening: "Monitoring project conversations", scanning: "Checking new turns", paused: "Monitoring paused", manual: "Waiting for manual check", lastScan: "Last check" },
  fatal: "Unable to read OCA-Duplex runtime data", loading: "Connecting ChatGPT/Codex and intake policy…",
  statuses: { synced: "Synced", review: "Review", conflict: "Conflict", candidate: "Candidate", validated: "Validated", superseded: "Superseded", archived: "Archived", active: "Active", created: "Created", updated: "Updated", completed: "Complete", captured: "Captured", skipped_existing: "Already exists" },
  types: { conversation: "Conversation", source: "Conversation", learning_summary: "Learning summary", knowledge: "Knowledge", prompt: "Prompt", output: "Output", decision: "Decision" }
};

export type Copy = Localized<typeof zh>;

export function getCopy(locale: AppLocale): Copy {
  return locale === "en-US" ? en : zh;
}
