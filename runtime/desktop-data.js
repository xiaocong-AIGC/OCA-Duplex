import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { projectSubdirs, projectsRoot } from "../vault/path-map.js";
import { configPathForVault, defaultConfig, normalizeWorkspaceEntry, saveConfig } from "./config.js";
import { normalizeLocale } from "../vault/layout-profiles.js";
import { applyLayoutMigrationPlan, buildLayoutMigrationPlan } from "../vault/layout-migration.js";
import { resolveAppServerCommand } from "./app-server-client.js";
import { commandText, runLocalCommand } from "./process-info.js";
import { appendAuditEvents, beginWriteTransaction, completeWriteTransaction, rollbackWriteTransaction } from "../core/write-transaction.js";
import { resolveWithinVault } from "../core/writer.js";

function integrationStatus(config) {
  const command = resolveAppServerCommand(config.appServer.command ?? "codex");
  const result = runLocalCommand(command, ["--version"]);
  return {
    name: "ChatGPT Codex",
    available: result.status === 0,
    command,
    version: result.status === 0 ? commandText(result) : null,
    detail: result.status === 0 ? null : (result.error?.message ?? commandText(result) ?? "Codex runtime unavailable")
  };
}

async function safeReadDir(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function walkMarkdown(directory) {
  const files = [];
  for (const entry of await safeReadDir(directory)) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdown(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(target);
  }
  return files;
}

function frontmatter(content) {
  const match = String(content).match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value === "null" ? null : value;
  }
  return result;
}

function setFrontmatterValues(content, values) {
  const match = String(content).match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("该文件没有可管理的 YAML frontmatter。");
  let header = match[1];
  for (const [key, value] of Object.entries(values)) {
    const rendered = `${key}: ${String(value).replace(/\r?\n/g, " ")}`;
    const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
    header = pattern.test(header) ? header.replace(pattern, rendered) : `${header}\n${rendered}`;
  }
  return `---\n${header}\n---${content.slice(match[0].length)}`;
}

async function reviewKnowledge(config, params) {
  const relativePath = String(params.path ?? "").replace(/\\/g, "/");
  const action = String(params.action ?? "");
  const nextStatus = { validate: "validated", archive: "archived", supersede: "superseded" }[action];
  if (!nextStatus) throw new Error(`不支持的知识审核操作：${action}`);
  const absolutePath = resolveWithinVault(config.vaultRoot, relativePath);
  const stat = await fs.stat(absolutePath);
  if (params.expectedUpdatedAt && stat.mtime.toISOString() !== params.expectedUpdatedAt) {
    throw new Error("该知识文件已被其他程序修改，请刷新后重新审核。");
  }
  const content = await fs.readFile(absolutePath, "utf8");
  const metadata = frontmatter(content);
  if (metadata.type !== "knowledge" || metadata.oca_managed !== "true") {
    throw new Error("只能在应用内审核由 OCA-Duplex 管理的知识文件。");
  }
  const allowed = action === "validate" ? ["candidate", "conflict"] : ["candidate", "validated", "conflict"];
  if (!allowed.includes(metadata.status)) throw new Error(`当前状态 ${metadata.status ?? "未知"} 不能执行此操作。`);
  const reviewedAt = new Date().toISOString();
  const updated = setFrontmatterValues(content, {
    status: nextStatus,
    reviewed_at: reviewedAt,
    reviewed_by: "desktop-user",
    review_action: action
  });
  const transaction = await beginWriteTransaction([{ target: relativePath }], config);
  try {
    const temporary = `${absolutePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, updated, "utf8");
    await fs.rename(temporary, absolutePath);
    const result = {
      operation: `knowledge_${action}`,
      type: "knowledge",
      target: relativePath,
      outcome: nextStatus,
      source_thread_id: metadata.source_thread_id ?? null,
      source_turn_id: metadata.source_turn_id ?? null,
      project_root: metadata.project ? `${projectsRoot(config)}/${metadata.project}` : null,
      knowledge_operation: action
    };
    await appendAuditEvents(config, transaction.id, [result]);
    await completeWriteTransaction(transaction);
    return { ...result, reviewed_at: reviewedAt };
  } catch (error) {
    await rollbackWriteTransaction(transaction, config, error);
    throw error;
  }
}

async function countMarkdown(directory) {
  return (await walkMarkdown(directory)).length;
}

export async function listDesktopProjects(config) {
  const root = path.join(config.vaultRoot, projectsRoot(config));
  const folders = projectSubdirs(config);
  const entries = await safeReadDir(root);
  const projects = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const projectRoot = path.join(root, entry.name);
    const counts = {};
    for (const [key, folder] of Object.entries(folders)) counts[key] = await countMarkdown(path.join(projectRoot, folder));
    const stat = await fs.stat(projectRoot);
    projects.push({
      name: entry.name,
      path: path.relative(config.vaultRoot, projectRoot).replace(/\\/g, "/"),
      counts,
      total_artifacts: Object.values(counts).reduce((sum, value) => sum + value, 0),
      updated_at: stat.mtime.toISOString()
    });
  }
  return projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function listDesktopArtifacts(config, { project = null, type = null, limit = 200 } = {}) {
  const base = project
    ? path.join(config.vaultRoot, projectsRoot(config), project)
    : path.join(config.vaultRoot, projectsRoot(config));
  const artifacts = [];
  for (const filePath of await walkMarkdown(base)) {
    const content = await fs.readFile(filePath, "utf8");
    const metadata = frontmatter(content);
    if (type && metadata.type !== type) continue;
    const stat = await fs.stat(filePath);
    artifacts.push({
      path: path.relative(config.vaultRoot, filePath).replace(/\\/g, "/"),
      title: path.basename(filePath, path.extname(filePath)),
      type: metadata.type ?? "note",
      status: metadata.status ?? null,
      project: metadata.project ?? project,
      source_thread_id: metadata.source_thread_id ?? null,
      source_turn_id: metadata.source_turn_id ?? null,
      knowledge_operation: metadata.knowledge_operation ?? null,
      updated_at: stat.mtime.toISOString(),
      size_bytes: stat.size
    });
  }
  return artifacts.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
}

export async function listDesktopActivity(config, { limit = 100 } = {}) {
  const auditPath = path.join(config.vaultRoot, ".oca-duplex", "audit.jsonl");
  try {
    const lines = (await fs.readFile(auditPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).reverse().map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function desktopOverview(config) {
  const [projects, artifacts, activity] = await Promise.all([
    listDesktopProjects(config),
    listDesktopArtifacts(config, { limit: 10000 }),
    listDesktopActivity(config, { limit: 20 })
  ]);
  const byType = {};
  const byStatus = {};
  for (const artifact of artifacts) {
    byType[artifact.type] = (byType[artifact.type] ?? 0) + 1;
    if (artifact.status) byStatus[artifact.status] = (byStatus[artifact.status] ?? 0) + 1;
  }
  const sourceByProject = new Map(config.capture.workspaces.map((entry) => [entry.project, entry.path]));
  const desktopProjects = projects.map((project) => {
    const projectArtifacts = artifacts.filter((artifact) => artifact.project === project.name || artifact.path.startsWith(`${project.path}/`));
    const status = projectArtifacts.some((artifact) => artifact.status === "conflict" || artifact.knowledge_operation === "conflict")
      ? "conflict"
      : projectArtifacts.some((artifact) => artifact.status === "candidate") ? "review" : "synced";
    return { ...project, source_path: sourceByProject.get(project.name) ?? null, status };
  });
  return {
    mode: config.capture.mode,
    auto_watch: config.capture.autoWatch !== false,
    poll_interval_ms: config.capture.pollIntervalMs ?? 10000,
    locale: config.locale,
    vault_root: config.vaultRoot,
    projects_count: projects.length,
    artifacts_count: artifacts.length,
    artifacts_by_type: byType,
    artifacts_by_status: byStatus,
    workspace_mappings: config.capture.workspaces,
    integration: integrationStatus(config),
    projects: desktopProjects,
    artifacts,
    activity,
    recent_activity: activity
  };
}

export async function initializeDesktopSystem({ vaultRoot, locale = "zh-CN", mode = "safe", workspaces = [] }) {
  const root = path.resolve(String(vaultRoot ?? ""));
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Vault 目录不存在：${root}`);
  if (!["safe", "manual", "all"].includes(mode)) throw new Error(`不支持的读取模式：${mode}`);
  const config = defaultConfig(root, normalizeLocale(locale));
  config.capture.mode = mode;
  config.capture.workspaces = workspaces.map(normalizeWorkspaceEntry);
  if (mode === "safe" && config.capture.workspaces.length === 0) throw new Error("安全模式至少需要添加一个授权项目目录。");
  const configPath = configPathForVault(root);
  const controlDir = path.dirname(configPath);
  await fs.mkdir(controlDir, { recursive: true });
  await fs.writeFile(path.join(controlDir, ".gitignore"), "config.json\nruntime-state.json\naudit.jsonl\ntransactions/\nmigrations/\n*.tmp\n", "utf8");
  await fs.writeFile(path.join(controlDir, "project-aliases.json"), "{\n  \"aliases\": []\n}\n", { encoding: "utf8", flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const directories = new Set([...Object.values(config.userFacingPaths), path.posix.dirname(config.dashboard.path), config.daily.path]);
  for (const relative of directories) await fs.mkdir(path.join(root, relative), { recursive: true });
  await saveConfig(configPath, config);
  return { configured: true, config_path: configPath, overview: await desktopOverview(config) };
}

export async function handleDesktopRequest(config, request) {
  const params = request.params ?? {};
  if (request.method === "system.initialize") return initializeDesktopSystem(params);
  if (request.method === "settings.set_mode") {
    if (!["safe", "manual", "all"].includes(params.mode)) throw new Error(`不支持的读取模式：${params.mode}`);
    if (params.mode === "safe" && !config.capture.workspaces.length) throw new Error("安全模式至少需要一个授权项目目录。");
    config.capture.mode = params.mode;
    await saveConfig(configPathForVault(config.vaultRoot), config);
    return { mode: params.mode };
  }
  if (request.method === "settings.set_auto_watch") {
    config.capture.autoWatch = Boolean(params.enabled);
    await saveConfig(configPathForVault(config.vaultRoot), config);
    return { enabled: config.capture.autoWatch };
  }
  if (request.method === "settings.add_workspace") {
    const entry = normalizeWorkspaceEntry(params);
    const key = process.platform === "win32" ? entry.path.toLowerCase() : entry.path;
    config.capture.workspaces = config.capture.workspaces.filter((item) => {
      const itemKey = process.platform === "win32" ? item.path.toLowerCase() : item.path;
      return itemKey !== key && item.project !== entry.project;
    });
    config.capture.workspaces.push(entry);
    await saveConfig(configPathForVault(config.vaultRoot), config);
    return { workspaces: config.capture.workspaces };
  }
  if (request.method === "settings.remove_workspace") {
    const target = path.resolve(String(params.path ?? ""));
    const key = process.platform === "win32" ? target.toLowerCase() : target;
    const remaining = config.capture.workspaces.filter((item) => {
      const itemKey = process.platform === "win32" ? item.path.toLowerCase() : item.path;
      return itemKey !== key;
    });
    if (remaining.length === config.capture.workspaces.length) throw new Error("没有找到要移除的授权目录。");
    if (config.capture.mode === "safe" && remaining.length === 0) throw new Error("安全模式必须至少保留一个授权项目目录。请先切换模式或添加新的映射。");
    config.capture.workspaces = remaining;
    await saveConfig(configPathForVault(config.vaultRoot), config);
    return { workspaces: remaining };
  }
  if (request.method === "settings.set_language") {
    const configPath = configPathForVault(config.vaultRoot);
    const plan = await buildLayoutMigrationPlan(config, params.locale);
    if (!params.apply) return { ...plan, next_config: undefined };
    if (!plan.ready) return { applied: false, conflicts: plan.conflicts };
    return applyLayoutMigrationPlan(configPath, plan);
  }
  if (request.method === "knowledge.review") return reviewKnowledge(config, params);
  if (request.method === "system.overview") return desktopOverview(config);
  if (request.method === "projects.list") return listDesktopProjects(config);
  if (request.method === "artifacts.list") return listDesktopArtifacts(config, params);
  if (request.method === "activity.list") return listDesktopActivity(config, params);
  if (request.method === "settings.get") return {
    locale: config.locale,
    capture: config.capture,
    user_facing_paths: config.userFacingPaths,
    project_subdirs: config.projectSubdirs,
    content: config.content
  };
  throw new Error(`未知桌面数据方法：${request.method}`);
}
