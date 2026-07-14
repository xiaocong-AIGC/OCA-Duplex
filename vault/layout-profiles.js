export const LAYOUT_PROFILES = Object.freeze({
  "zh-CN": Object.freeze({
    id: "zh-CN",
    name: "纯中文",
    userFacingPaths: Object.freeze({
      inbox: "收件箱",
      projects: "项目",
      globalKnowledge: "全局知识库",
      globalSource: "全局来源",
      globalPrompts: "全局提示词",
      system: "系统"
    }),
    projectSubdirs: Object.freeze({
      inbox: "待整理",
      sources: "对话底稿",
      summaries: "复盘总结",
      knowledge: "知识库",
      prompts: "提示词",
      outputs: "输出成果",
      decisions: "决策记录",
      logs: "入库流水"
    }),
    names: Object.freeze({
      projectIndex: "项目索引.md",
      projectHome: "项目主页.md",
      unsorted: "未归类对话",
      dashboard: "系统看板.md",
      daily: "每日同步",
      learningSummary: "复盘总结"
    })
  }),
  "en-US": Object.freeze({
    id: "en-US",
    name: "English",
    userFacingPaths: Object.freeze({
      inbox: "Inbox",
      projects: "Projects",
      globalKnowledge: "Global Knowledge",
      globalSource: "Global Sources",
      globalPrompts: "Global Prompts",
      system: "System"
    }),
    projectSubdirs: Object.freeze({
      inbox: "Pending",
      sources: "Source Records",
      summaries: "Operating Reviews",
      knowledge: "Knowledge",
      prompts: "Prompts",
      outputs: "Outputs",
      decisions: "Decisions",
      logs: "Intake Logs"
    }),
    names: Object.freeze({
      projectIndex: "Project Index.md",
      projectHome: "Project Home.md",
      unsorted: "Unsorted Conversations",
      dashboard: "System Dashboard.md",
      daily: "Daily Sync",
      learningSummary: "Operating Review"
    })
  })
});

export function normalizeLocale(value) {
  const locale = String(value ?? "").trim().toLowerCase();
  if (["en", "en-us", "english"].includes(locale)) return "en-US";
  if (["zh", "zh-cn", "chinese", "中文"].includes(locale)) return "zh-CN";
  if (LAYOUT_PROFILES[value]) return value;
  throw new Error(`不支持的目录语言：${value}。可选 zh-CN 或 en-US。`);
}

export function layoutProfile(locale = "zh-CN") {
  return LAYOUT_PROFILES[normalizeLocale(locale)];
}

export function applyLayoutProfile(config, locale) {
  const profile = layoutProfile(locale);
  config.locale = profile.id;
  config.layoutProfile = profile.id;
  config.userFacingPaths = { ...profile.userFacingPaths };
  config.projectSubdirs = { ...profile.projectSubdirs };
  config.classification ??= {};
  config.classification.paths = {
    inbox: profile.userFacingPaths.inbox,
    knowledge: profile.userFacingPaths.globalKnowledge,
    prompt: profile.userFacingPaths.globalPrompts,
    project: profile.userFacingPaths.projects,
    source: profile.userFacingPaths.globalSource
  };
  config.projectRouting ??= {};
  config.projectRouting.root = profile.userFacingPaths.projects;
  config.projectRouting.unsorted = `${profile.userFacingPaths.inbox}/${profile.names.unsorted}`;
  config.dashboard = { path: `${profile.userFacingPaths.system}/OCA-Duplex/${profile.names.dashboard}` };
  config.daily = { path: `${profile.userFacingPaths.system}/OCA-Duplex/${profile.names.daily}` };
  config.write ??= {};
  config.write.conversationSourceFolder = `${profile.userFacingPaths.globalSource}/Codex`;
  return config;
}
