import path from "node:path";
import { layoutProfile } from "./layout-profiles.js";

export const DEFAULT_USER_FACING_PATHS = layoutProfile("zh-CN").userFacingPaths;

export const DEFAULT_PROJECT_SUBDIRS = layoutProfile("zh-CN").projectSubdirs;

export const LEGACY_NUMERIC_PROJECT_SUBDIRS = Object.freeze({
  inbox: "00_待整理",
  sources: "01_原始记录",
  summaries: "02_知识整理",
  knowledge: "02_知识整理",
  prompts: "03_提示词",
  outputs: "04_输出成果",
  decisions: "05_决策记录",
  logs: "90_同步日志"
});

export const LEGACY_TOP_LEVEL_PATHS = Object.freeze({
  "00_Inbox": DEFAULT_USER_FACING_PATHS.inbox,
  "10_Projects": DEFAULT_USER_FACING_PATHS.projects,
  "30_Knowledge": DEFAULT_USER_FACING_PATHS.globalKnowledge,
  "30_Source": DEFAULT_USER_FACING_PATHS.globalSource,
  "50_Prompts": DEFAULT_USER_FACING_PATHS.globalPrompts
});

export const LEGACY_PROJECT_SUBDIRS = Object.freeze({
  "00_Inbox": DEFAULT_PROJECT_SUBDIRS.inbox,
  "01_Sources": DEFAULT_PROJECT_SUBDIRS.sources,
  "02_Knowledge": DEFAULT_PROJECT_SUBDIRS.knowledge,
  "03_Prompts": DEFAULT_PROJECT_SUBDIRS.prompts,
  "04_Outputs": DEFAULT_PROJECT_SUBDIRS.outputs,
  "05_Decisions": DEFAULT_PROJECT_SUBDIRS.decisions,
  "90_Logs": DEFAULT_PROJECT_SUBDIRS.logs,
  Sources: DEFAULT_PROJECT_SUBDIRS.sources,
  Knowledge: DEFAULT_PROJECT_SUBDIRS.knowledge,
  Prompts: DEFAULT_PROJECT_SUBDIRS.prompts,
  Outputs: DEFAULT_PROJECT_SUBDIRS.outputs,
  Decisions: DEFAULT_PROJECT_SUBDIRS.decisions,
  Logs: DEFAULT_PROJECT_SUBDIRS.logs
});

export const PROJECT_NAME_RENAMES = Object.freeze({});

export function normalizeVaultPath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function userFacingPaths(config = {}) {
  const profile = layoutProfile(config.layoutProfile ?? config.locale ?? "zh-CN");
  return { ...profile.userFacingPaths, ...(config.userFacingPaths ?? {}) };
}

export function projectSubdirs(config = {}) {
  if (!config.layoutProfile && !config.locale && !config.projectSubdirs && /(^|\/)10_/.test(config.projectRouting?.root ?? "")) {
    return { ...LEGACY_NUMERIC_PROJECT_SUBDIRS };
  }
  const profile = layoutProfile(config.layoutProfile ?? config.locale ?? "zh-CN");
  return { ...profile.projectSubdirs, ...(config.projectSubdirs ?? {}) };
}

export function projectsRoot(config = {}) {
  return normalizeVaultPath(config.userFacingPaths?.projects ?? config.projectRouting?.root ?? config.classification?.paths?.project ?? DEFAULT_USER_FACING_PATHS.projects);
}

export function inboxRoot(config = {}) {
  return normalizeVaultPath(config.userFacingPaths?.inbox ?? config.classification?.paths?.inbox ?? DEFAULT_USER_FACING_PATHS.inbox);
}

export function globalKnowledgeRoot(config = {}) {
  return normalizeVaultPath(config.userFacingPaths?.globalKnowledge ?? config.classification?.paths?.knowledge ?? DEFAULT_USER_FACING_PATHS.globalKnowledge);
}

export function globalSourceRoot(config = {}) {
  return normalizeVaultPath(config.userFacingPaths?.globalSource ?? config.classification?.paths?.source ?? DEFAULT_USER_FACING_PATHS.globalSource);
}

export function globalPromptRoot(config = {}) {
  return normalizeVaultPath(config.userFacingPaths?.globalPrompts ?? config.classification?.paths?.prompt ?? DEFAULT_USER_FACING_PATHS.globalPrompts);
}

export function systemRoot(config = {}) {
  return normalizeVaultPath(config.userFacingPaths?.system ?? DEFAULT_USER_FACING_PATHS.system);
}

export function unsortedCapturesPath(config = {}) {
  const profile = layoutProfile(config.layoutProfile ?? config.locale ?? "zh-CN");
  return normalizeVaultPath(config.projectRouting?.unsorted ?? path.posix.join(inboxRoot(config), profile.names.unsorted));
}

export function dashboardPath(config = {}) {
  const profile = layoutProfile(config.layoutProfile ?? config.locale ?? "zh-CN");
  return normalizeVaultPath(config.dashboard?.path ?? path.posix.join(systemRoot(config), "OCA-Duplex", profile.names.dashboard));
}

export function dailySyncDir(config = {}) {
  const profile = layoutProfile(config.layoutProfile ?? config.locale ?? "zh-CN");
  return normalizeVaultPath(config.daily?.path ?? path.posix.join(systemRoot(config), "OCA-Duplex", profile.names.daily));
}

export function projectIndexPath(config = {}) {
  const profile = layoutProfile(config.layoutProfile ?? config.locale ?? "zh-CN");
  return path.posix.join(projectsRoot(config), profile.names.projectIndex);
}

export function projectUsagePath(config = {}) {
  return path.posix.join(projectsRoot(config), "使用说明.md");
}

export function systemUsagePath(config = {}) {
  return path.posix.join(systemRoot(config), "oca-duplex", "使用说明.md");
}

export function projectRootPath(config, projectName) {
  return path.posix.join(projectsRoot(config), localizeProjectName(projectName));
}

export function localizeProjectName(name) {
  return PROJECT_NAME_RENAMES[String(name ?? "").trim()] ?? String(name ?? "").trim();
}

export function localizeVisibleText(value) {
  let next = String(value ?? "");
  const replacements = [
    ["10_Projects", DEFAULT_USER_FACING_PATHS.projects],
    ["00_Inbox", DEFAULT_USER_FACING_PATHS.inbox],
    ["30_Knowledge", DEFAULT_USER_FACING_PATHS.globalKnowledge],
    ["30_Source", DEFAULT_USER_FACING_PATHS.globalSource],
    ["50_Prompts", DEFAULT_USER_FACING_PATHS.globalPrompts],
    ["01_Sources", DEFAULT_PROJECT_SUBDIRS.sources],
    ["02_Knowledge", DEFAULT_PROJECT_SUBDIRS.knowledge],
    ["03_Prompts", DEFAULT_PROJECT_SUBDIRS.prompts],
    ["04_Outputs", DEFAULT_PROJECT_SUBDIRS.outputs],
    ["05_Decisions", DEFAULT_PROJECT_SUBDIRS.decisions],
    ["90_Logs", DEFAULT_PROJECT_SUBDIRS.logs],
    ["90_System/oca-duplex/Dashboard", `${DEFAULT_USER_FACING_PATHS.system}/oca-duplex/系统看板`],
    ["90_System/oca-duplex/Daily", `${DEFAULT_USER_FACING_PATHS.system}/oca-duplex/每日同步`]
  ];
  for (const [from, to] of replacements) next = next.split(from).join(to);
  return next;
}

export function localizeVisiblePath(relativePath, config = {}) {
  const input = normalizeVaultPath(relativePath);
  if (!input) return input;
  const parts = input.split("/");
  const userPaths = userFacingPaths(config);
  const subdirs = projectSubdirs(config);

  if (parts[0] === "90_System" && parts[1] === "oca-duplex" && parts[2] === "Dashboard.md") {
    return dashboardPath(config);
  }
  if (parts[0] === "90_System" && parts[1] === "oca-duplex" && parts[2] === "Daily") {
    return [systemRoot(config), "oca-duplex", "每日同步", ...parts.slice(3)].join("/");
  }
  if (parts[0] === "90_System" && parts[1] === "oca-duplex" && parts[2] === "README.md") {
    return systemUsagePath(config);
  }

  if (parts[0] === "10_Projects" || parts[0] === userPaths.projects) {
    parts[0] = projectsRoot(config);
    if (parts[1]) parts[1] = localizeProjectName(parts[1]);
    if (parts[2] && LEGACY_PROJECT_SUBDIRS[parts[2]]) parts[2] = LEGACY_PROJECT_SUBDIRS[parts[2]];
    const lastIndex = parts.length - 1;
    if (lastIndex >= 1) {
      if (parts[lastIndex] === "README.md") parts[lastIndex] = "使用说明.md";
      else parts[lastIndex] = localizeVisibleText(parts[lastIndex]);
    }
    if (parts.length === 3 && parts[2] === `${parts[1]}.md`) parts[2] = `${localizeProjectName(parts[1])}.md`;
    return parts.join("/");
  }

  if (LEGACY_TOP_LEVEL_PATHS[parts[0]]) parts[0] = LEGACY_TOP_LEVEL_PATHS[parts[0]];
  if (parts.length > 1) parts[parts.length - 1] = localizeVisibleText(parts[parts.length - 1]);
  return parts.join("/");
}

export function folderForType(type, config) {
  if (type === "digest" || type === "learning_summary") return globalKnowledgeRoot(config);
  if (type === "output") return projectsRoot(config);
  if (type === "knowledge") return globalKnowledgeRoot(config);
  if (type === "source") return globalSourceRoot(config);
  if (type === "prompt") return globalPromptRoot(config);
  if (type === "project") return projectsRoot(config);
  return inboxRoot(config);
}

export function targetForTitle(type, fileName, config) {
  return path.posix.join(folderForType(type, config), localizeVisibleText(fileName));
}

export function describeVaultLayout(config) {
  return {
    userFacingPaths: userFacingPaths(config),
    projectSubdirs: projectSubdirs(config)
  };
}
