import fs from "node:fs/promises";
import path from "node:path";
import { applyLayoutProfile, normalizeLocale } from "../vault/layout-profiles.js";

export const CAPTURE_MODES = Object.freeze(["safe", "manual", "all"]);

export function configPathForVault(vaultRoot) {
  return path.join(path.resolve(vaultRoot), ".oca-duplex", "config.json");
}

export function defaultConfig(vaultRoot, locale = "zh-CN") {
  const root = path.resolve(vaultRoot);
  const config = {
    version: "1.0.0-beta.5",
    vaultRoot: root,
    appServer: {
      command: "codex",
      args: ["app-server", "--stdio"],
      requestTimeoutMs: 45000,
      experimentalApi: false,
      minimumCodexVersion: "0.120.0",
      testedCodexVersion: "0.144.0"
    },
    capture: {
      mode: "safe",
      workspaces: [],
      threadAssignments: [],
      autoWatch: true,
      pollIntervalMs: 10000,
      heartbeatMs: 60000,
      newestThreads: 50,
      includeArchived: false,
      includeToolResults: false,
      includeReasoningSummaries: false,
      maxToolOutputChars: 2000,
      completedTurnsOnly: true,
      maxTurnsPerCycle: 5
    },
    content: {
      schemaVersion: 2,
      oneConversationPerThread: true,
      oneLearningSummaryPerThread: true,
      knowledgeDefaultState: "candidate"
    },
    classification: {
      minimumWriteConfidence: 0.72,
      paths: {
        inbox: "00_收件箱",
        knowledge: "30_知识库",
        prompt: "50_提示词",
        project: "10_项目",
        source: "30_来源"
      }
    },
    projectRouting: {
      root: "10_项目",
      unsorted: "00_收件箱/未归类Codex捕获",
      minimumConfidence: 0.75
    },
    projectAliases: { path: ".oca-duplex/project-aliases.json" },
    dashboard: { path: "90_系统/oca-duplex/系统看板.md" },
    linking: { minimumSharedTokens: 2, maximumLinksPerNote: 3 },
    write: {
      enabled: false,
      commit: false,
      maxDerivedNotesPerTurn: 3,
      generateProjectHome: false,
      generateMaintenanceFiles: false,
      conversationSourceFolder: "30_来源/Codex对话记录",
      commitMessage: "oca-duplex: sync Codex knowledge"
    },
    state: { path: ".oca-duplex/runtime-state.json", commit: false },
    userFacingPaths: {
      inbox: "00_收件箱",
      projects: "10_项目",
      globalKnowledge: "30_知识库",
      globalSource: "30_来源",
      globalPrompts: "50_提示词",
      system: "90_系统"
    },
    projectSubdirs: {
      inbox: "00_待整理",
      sources: "01_原始记录",
      knowledge: "02_知识整理",
      prompts: "03_提示词",
      outputs: "04_输出成果",
      decisions: "05_决策记录",
      logs: "90_同步日志"
    }
  };
  return applyLayoutProfile(config, normalizeLocale(locale));
}

export function normalizeWorkspaceEntry(entry) {
  if (typeof entry === "string") {
    const workspacePath = path.resolve(entry);
    return { path: workspacePath, project: path.basename(workspacePath) };
  }
  const workspacePath = path.resolve(String(entry?.path ?? ""));
  const project = String(entry?.project ?? path.basename(workspacePath)).trim();
  if (!entry?.path || !project) throw new Error("每个安全模式工作区都必须包含 path 和 project。");
  return { path: workspacePath, project };
}

export function normalizeThreadAssignment(entry) {
  const threadId = String(entry?.threadId ?? entry?.thread_id ?? "").trim();
  const project = String(entry?.project ?? "").trim();
  if (!threadId || !project) throw new Error("每个对话归属都必须包含 threadId 和 project。");
  return { threadId, project };
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("配置必须是 JSON 对象。");
  if (!path.isAbsolute(config.vaultRoot ?? "")) throw new Error("vaultRoot 必须是绝对路径。");
  config.locale = normalizeLocale(config.locale ?? config.layoutProfile ?? "zh-CN");
  config.layoutProfile = config.locale;
  const mode = config.capture?.mode ?? "safe";
  if (!CAPTURE_MODES.includes(mode)) throw new Error(`不支持的捕获模式：${mode}`);
  config.capture ??= {};
  config.capture.mode = mode;
  config.capture.workspaces = (config.capture.workspaces ?? []).map(normalizeWorkspaceEntry);
  config.capture.threadAssignments = (config.capture.threadAssignments ?? []).map(normalizeThreadAssignment);
  if (mode === "safe" && config.capture.workspaces.length === 0) {
    throw new Error("安全模式至少需要一个“工作目录 → 项目名”映射。请运行 oca-duplex workspace add。");
  }
  return config;
}

export async function loadConfig(configPath, { allowEmptySafeMode = false } = {}) {
  const parsed = JSON.parse(await fs.readFile(path.resolve(configPath), "utf8"));
  if (allowEmptySafeMode && parsed.capture?.mode === "safe" && !(parsed.capture?.workspaces?.length)) {
    parsed.capture.mode = "manual";
    const validated = validateConfig(parsed);
    validated.capture.mode = "safe";
    return validated;
  }
  return validateConfig(parsed);
}

export async function saveConfig(configPath, config) {
  const target = path.resolve(configPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return target;
}

export async function discoverConfigPath({ explicitPath, cwd = process.cwd() } = {}) {
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.OCA_DUPLEX_CONFIG) return path.resolve(process.env.OCA_DUPLEX_CONFIG);
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, ".oca-duplex", "config.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("没有找到 .oca-duplex/config.json。请先在 Vault 中运行 oca-duplex init。");
}
