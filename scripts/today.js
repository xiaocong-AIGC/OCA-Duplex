#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWithinVault } from "../core/writer.js";
import { loadConfig } from "./alias-tools.js";
import { dashboardPath, dailySyncDir, projectIndexPath, projectSubdirs, projectsRoot, unsortedCapturesPath } from "../vault/path-map.js";

const codeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function toPosix(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function projectFromFiles(config, files = []) {
  const root = `${projectsRoot(config)}/`;
  const projectFile = files.find((file) => toPosix(file).startsWith(root));
  return projectFile ? toPosix(projectFile).split("/")[1] : "未归类";
}

function typeFromFile(config, file) {
  const value = toPosix(file);
  const folders = projectSubdirs(config);
  if (value.includes(`/${folders.sources}/`)) return "原始记录";
  if (value.includes(`/${folders.knowledge}/`)) return value.includes("整理") ? "内容整理" : "知识整理";
  if (value.includes(`/${folders.prompts}/`)) return "提示词";
  if (value.includes(`/${folders.outputs}/`)) return "输出成果";
  if (value.includes(`/${folders.logs}/`)) return "同步日志";
  return "文件";
}

function markdownTable(rows, columns) {
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...(rows.length ? rows : [columns.map(() => "暂无")]).map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

export async function buildTodayReport(config, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const statePath = resolveWithinVault(config.vaultRoot, config.state?.path ?? "90_System/oca-duplex/runtime-state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf8").catch(() => "{\"records\":[]}"));
  const todayRecords = (state.records ?? []).filter((record) => String(record.processed_at ?? "").startsWith(date));
  const written = [];
  const skipped = [];
  const commits = [];
  for (const record of todayRecords) {
    const project = projectFromFiles(config, record.files ?? []);
    if (record.mode === "skipped") skipped.push([record.processed_at ?? "", project, record.user_choice ?? "skipped"]);
    for (const file of record.files ?? []) written.push([record.processed_at ?? "", project, typeFromFile(config, file), `[[${toPosix(file).replace(/\.md$/i, "")}]]`]);
    if (record.commit_hash) commits.push([record.processed_at ?? "", project, record.commit_hash]);
  }
  return { date, written, skipped, commits, aliases: [] };
}

export function renderTodayMarkdown(report) {
  return [
    "# OCA-Duplex 今日同步",
    "",
    "## 今日写入",
    "",
    markdownTable(report.written, ["时间", "项目", "类型", "文件"]),
    "",
    "## 今日跳过",
    "",
    markdownTable(report.skipped, ["时间", "项目", "原因"]),
    "",
    "## 今日新增别名",
    "",
    report.aliases.length ? report.aliases.map((item) => `- ${item}`).join("\n") : "- 暂无自动统计；可查看 Git diff 或 project-aliases.json。",
    "",
    "## 今日 commit",
    "",
    markdownTable(report.commits, ["时间", "项目", "commit"]),
    ""
  ].join("\n");
}

async function listProjects(config) {
  const root = resolveWithinVault(config.vaultRoot, projectsRoot(config));
  if (!(await exists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

async function renderProjectIndex(config, report) {
  const projects = await listProjects(config);
  return [
    "---",
    "type: project-index",
    "status: active",
    "oca_managed: true",
    `updated: "${new Date().toISOString()}"`,
    "---",
    "",
    "# 项目索引",
    "",
    "## 活跃项目",
    "",
    ...projects.map((name) => `- [[${name}/${name}]]`),
    "",
    "## 最近同步",
    "",
    ...report.written.slice(0, 10).map((row) => `- ${row[0]} ${row[1]}：${row[3]}`),
    ...(report.written.length ? [] : ["- 今日暂无写入"]),
    "",
    "## 未归类捕获",
    "",
    `- [[${unsortedCapturesPath(config)}]]`,
    ""
  ].join("\n");
}

function renderDashboard(config, report) {
  const projects = [...new Set(report.written.map((row) => row[1]).filter(Boolean))];
  return [
    "---",
    "type: dashboard",
    "status: active",
    "oca_managed: true",
    `updated: "${new Date().toISOString()}"`,
    "---",
    "",
    "# 系统看板",
    "",
    "- 系统：OCA-Duplex",
    `- 今日写入：${report.written.length}`,
    `- 今日跳过：${report.skipped.length}`,
    `- 今日活跃项目：${projects.length}`,
    `- 今日 commit：${report.commits.length}`,
    `- 今日同步日志：[[${dailySyncDir(config)}/${report.date}]]`,
    "",
    "## 最近写入",
    "",
    ...report.written.slice(0, 10).map((row) => `- ${row[0]} ${row[1]} ${row[3]}`),
    ...(report.written.length ? [] : ["- 暂无"]),
    ""
  ].join("\n");
}

export async function writeToday(config, options = {}) {
  const report = await buildTodayReport(config, options);
  const dailyRelative = `${dailySyncDir(config)}/${report.date}.md`;
  const dailyPath = resolveWithinVault(config.vaultRoot, dailyRelative);
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(dailyPath, renderTodayMarkdown(report), "utf8");

  const indexRelative = projectIndexPath(config);
  await fs.mkdir(path.dirname(resolveWithinVault(config.vaultRoot, indexRelative)), { recursive: true });
  await fs.writeFile(resolveWithinVault(config.vaultRoot, indexRelative), await renderProjectIndex(config, report), "utf8");

  const dashboardRelative = dashboardPath(config);
  await fs.mkdir(path.dirname(resolveWithinVault(config.vaultRoot, dashboardRelative)), { recursive: true });
  await fs.writeFile(resolveWithinVault(config.vaultRoot, dashboardRelative), renderDashboard(config, report), "utf8");

  return { daily: dailyRelative, project_index: indexRelative, dashboard: dashboardRelative, summary: { written: report.written.length, skipped: report.skipped.length, commits: report.commits.length } };
}

async function main() {
  const config = await loadConfig(path.join(codeRoot, "config.json"));
  const dateIndex = process.argv.indexOf("--date");
  const date = dateIndex >= 0 ? process.argv[dateIndex + 1] : undefined;
  process.stdout.write(`${JSON.stringify(await writeToday(config, { date }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
