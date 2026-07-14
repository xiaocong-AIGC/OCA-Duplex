import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeFilename } from "../core/quality.js";
import { localizeProjectName, projectsRoot } from "../vault/path-map.js";
import { workspaceForCwd } from "./workspace-policy.js";

const GENERIC_WORKSPACES = new Set(["", "d:", "c:", "obsidianvault", "obsidian vault", "workspace", "project", "projects"]);
const GENERIC_PROJECT_PATTERN = /^(?:codex|知识系统|obsidian|oca-duplex|知识库|方法总结|自动知识库|source|knowledge|prompt|codex 知识系统)$/i;
export const DEFAULT_PROJECT_ALIASES = [];

function projectSlug(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\p{Script=Han}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unsorted";
}

function normalizeAlias(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "");
}

function inferCategory(projectName, text, defaults = []) {
  return defaults[0] ?? "项目知识";
}

function candidate(name, confidence, source, reason, category, alias = null) {
  const projectName = sanitizeFilename(localizeProjectName(name), "未归类项目", 24);
  return {
    project_name: projectName,
    project_slug: projectSlug(projectName),
    category,
    confidence,
    reason,
    source,
    alias,
    needs_confirmation: confidence < 0.75
  };
}

function humanWorkspaceName(workspacePath) {
  const normalized = String(workspacePath ?? "").replace(/[\\/]+$/, "");
  const base = path.win32.basename(normalized) || path.basename(normalized);
  if (GENERIC_WORKSPACES.has(base.toLowerCase()) || GENERIC_PROJECT_PATTERN.test(base)) return null;
  return sanitizeFilename(base, "", 24) || null;
}

function heuristicName(text) {
  const value = String(text ?? "");
  const quoted = value.match(/[“"《]([^”"》]{2,24})[”"》]/u)?.[1];
  if (quoted && !/如何|要求|目标|输出|规则|方法总结|知识系统/.test(quoted) && !GENERIC_PROJECT_PATTERN.test(quoted)) return sanitizeFilename(quoted, "", 24);
  const named = value.match(/(?:项目|产品|应用|Agent|agent)\s*[：:]?\s*([A-Za-z][A-Za-z0-9 _-]{1,22}|[\p{Script=Han}A-Za-z0-9 _-]{2,20})/u)?.[1];
  if (!named || /^(?:的|中|内|里|上|下|每个|所有|当前|这个|该|我们|相关)/u.test(named.trim()) || GENERIC_PROJECT_PATTERN.test(named.trim())) return null;
  return sanitizeFilename(named, "", 24);
}

function aliasMatch(aliasConfig, value) {
  const normalized = normalizeAlias(value);
  if (!normalized) return null;
  return aliasConfig.aliases.find((alias) => normalized.includes(normalizeAlias(alias))) ?? null;
}

export class ProjectResolver {
  constructor(config) {
    this.config = config;
    this.existingProjects = new Set();
    this.aliases = [...DEFAULT_PROJECT_ALIASES];
  }

  async initialize() {
    const root = path.resolve(this.config.vaultRoot, projectsRoot(this.config));
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && !GENERIC_PROJECT_PATTERN.test(entry.name)) this.existingProjects.add(entry.name);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const aliasesPath = this.config.projectAliases?.path;
    if (aliasesPath) {
      try {
        const parsed = JSON.parse(await fs.readFile(path.resolve(this.config.vaultRoot, aliasesPath), "utf8"));
        if (Array.isArray(parsed.aliases)) this.aliases = parsed.aliases;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  registerProject(name) {
    if (name && !GENERIC_PROJECT_PATTERN.test(name)) this.existingProjects.add(name);
  }

  async resolve(snapshot) {
    const firstUserNode = (snapshot.conversation_nodes ?? []).find((node) => node.role === "user" && node.kind === "message");
    const evidence = {
      workspace_path: snapshot.thread.cwd ?? "",
      thread_title: snapshot.thread.name ?? "",
      first_user_message: firstUserNode?.text || snapshot.thread.preview || "",
      assistant_response: (snapshot.conversation_nodes ?? [])
        .filter((node) => node.role === "assistant" && node.kind === "message")
        .map((node) => node.text)
        .join("\n")
    };
    const fullText = Object.values(evidence).join("\n");
    const candidates = [];

    const assignedThread = (this.config.capture?.threadAssignments ?? [])
      .find((entry) => entry.threadId === snapshot.thread.id);
    if (assignedThread) {
      return candidate(
        assignedThread.project,
        1,
        "thread_assignment",
        `运营人员已将整条对话归入项目：${assignedThread.project}`,
        "项目知识"
      );
    }

    const mappedWorkspace = workspaceForCwd(this.config.capture?.workspaces ?? [], evidence.workspace_path);
    if (mappedWorkspace) {
      return candidate(
        mappedWorkspace.project,
        1,
        "workspace_mapping",
        `工作目录映射：${mappedWorkspace.path} → ${mappedWorkspace.project}`,
        "项目知识"
      );
    }

    const evidencePriority = [
      ["workspace_path", 0.99],
      ["thread_title", 0.98],
      ["first_user_message", 0.96],
      ["assistant_response", 0.72]
    ];
    for (const aliasConfig of this.aliases) {
      for (const [source, confidence] of evidencePriority) {
        const matchedAlias = aliasMatch(aliasConfig, evidence[source]);
        if (!matchedAlias) continue;
        candidates.push(candidate(
          aliasConfig.project_name,
          confidence,
          source === "assistant_response" ? "heuristic" : source,
          `命中 alias “${matchedAlias}”`,
          inferCategory(aliasConfig.project_name, fullText, aliasConfig.default_categories),
          matchedAlias
        ));
        break;
      }
    }

    const workspaceName = humanWorkspaceName(evidence.workspace_path);
    if (workspaceName) candidates.push(candidate(workspaceName, 0.92, "workspace_path", `使用 workspace/cwd 项目文件夹：${workspaceName}`, "项目知识"));

    const threadTitle = sanitizeFilename(evidence.thread_title, "", 24);
    if (threadTitle) {
      const generic = GENERIC_PROJECT_PATTERN.test(threadTitle);
      const projectLike = /项目|平台|应用|agent|app|pipeline|workflow/i.test(threadTitle);
      candidates.push(candidate(threadTitle, generic ? 0.4 : projectLike ? 0.86 : 0.66, "thread_title", generic ? "线程标题属于系统泛词，已降权" : "使用 Codex 对话标题", "项目知识"));
    }

    const firstUserName = heuristicName(evidence.first_user_message);
    if (firstUserName) candidates.push(candidate(firstUserName, 0.8, "first_user_message", "从首条用户消息提取显式项目名", "项目知识"));

    for (const project of this.existingProjects) {
      const mentioned = [evidence.workspace_path, evidence.thread_title, evidence.first_user_message]
        .some((value) => normalizeAlias(value).includes(normalizeAlias(project)));
      if (mentioned) candidates.push(candidate(project, 0.78, "existing_project", `匹配已有项目目录：${project}`, "项目知识"));
    }

    const assistantName = heuristicName(evidence.assistant_response);
    if (assistantName) {
      const escaped = assistantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const occurrences = evidence.assistant_response.match(new RegExp(escaped, "giu"))?.length ?? 0;
      if (occurrences >= 2) candidates.push(candidate(assistantName, 0.7, "heuristic", "assistant response 高频主题词，仅作弱证据", "项目知识"));
    }

    candidates.sort((left, right) => right.confidence - left.confidence || left.project_name.localeCompare(right.project_name));
    const selected = candidates.find((item) => !GENERIC_PROJECT_PATTERN.test(item.project_name));
    if (selected && selected.confidence >= 0.75) return selected;

    return candidate("未归类Codex捕获", 0.45, "heuristic", selected?.reason ?? "没有足够证据确定真实内容项目", "需要人工归类");
  }
}

export function isCrossProjectContent(text) {
  return /跨项目|全局通用|通用模板|适用于多个项目|项目无关|project[- ]agnostic|across projects|general[- ]purpose/i.test(String(text ?? ""));
}

export { projectSlug, GENERIC_PROJECT_PATTERN };
