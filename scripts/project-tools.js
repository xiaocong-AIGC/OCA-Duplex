#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { commitPaths } from "../core/git.js";
import { sanitizeFilename } from "../core/quality.js";
import { PROJECT_FOLDERS, resolveWithinVault } from "../core/writer.js";
import { projectSlug } from "../runtime/project-resolver.js";
import { addAlias, aliasFilePath, loadConfig } from "./alias-tools.js";

const codeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROJECT_ROOT = "10_项目";

function toPosix(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function rel(config, absolutePath) {
  return toPosix(path.relative(config.vaultRoot, absolutePath));
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function walkFiles(root, extension = ".md") {
  const files = [];
  async function visit(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) files.push(full);
    }
  }
  await visit(root);
  return files;
}

function frontmatterValue(content, key) {
  const block = String(content ?? "").match(/^---\s*\n([\s\S]*?)\n---/u)?.[1] ?? "";
  const match = block.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;
  const value = match[1].replace(/^['"]|['"]$/g, "").trim();
  return /^null$/i.test(value) ? null : value;
}

function ocaManaged(content) {
  return /^(?:oca_version|oca_unit_id|oca_managed|source_thread_id|captured_from):/m.test(String(content)) || /<!--\s*oca-turn:/i.test(String(content));
}

function threadMatches(content, threadPrefix) {
  if (!threadPrefix) return true;
  const thread = frontmatterValue(content, "source_thread_id") ?? frontmatterValue(content, "source_thread");
  return String(thread ?? "").startsWith(threadPrefix) || String(content).includes(threadPrefix);
}

function projectFromPath(relativePath) {
  const parts = toPosix(relativePath).split("/");
  return parts[0] === PROJECT_ROOT ? parts[1] : null;
}

function typeFromContent(content) {
  return frontmatterValue(content, "type") ?? "note";
}

function replaceFilenameProject(fileName, fromProject, toProject) {
  const stem = fileName.replace(/\.md$/i, "");
  const nextStem = stem.includes(fromProject) ? stem.split(fromProject).join(toProject) : stem;
  return `${sanitizeFilename(nextStem, stem, 36)}.md`;
}

function targetForMove(relativePath, fromProject, toProject) {
  const parts = toPosix(relativePath).split("/");
  parts[1] = toProject;
  parts[parts.length - 1] = replaceFilenameProject(parts.at(-1), fromProject, toProject);
  return parts.join("/");
}

function replacementPairs(moves) {
  const basenameCounts = new Map();
  for (const move of moves) {
    const base = path.posix.basename(move.from, ".md");
    basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
  }
  return moves.flatMap((move) => {
    const from = move.from.replace(/\.md$/i, "");
    const to = move.to.replace(/\.md$/i, "");
    const pairs = [{ from: `[[${from}`, to: `[[${to}` }];
    const base = path.posix.basename(from);
    if (basenameCounts.get(base) === 1) pairs.push({ from: `[[${base}`, to: `[[${to}` });
    return pairs;
  });
}

async function scanVaultMarkdown(config) {
  const files = await walkFiles(config.vaultRoot);
  return files.filter((file) => {
    const relative = rel(config, file);
    return !relative.startsWith(".git/") && !relative.includes("node_modules/") && !relative.startsWith("90_System/oca-duplex/Archive/");
  });
}

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function upsertFrontmatter(content, updates) {
  const source = String(content ?? "");
  const blockMatch = source.match(/^---\s*\n([\s\S]*?)\n---/u);
  if (!blockMatch) {
    const lines = ["---", ...Object.entries(updates).map(([key, value]) => `${key}: ${value}`), "---", ""];
    return `${lines.join("\n")}${source}`;
  }
  let block = blockMatch[1];
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}:\\s*.*$`, "m");
    if (pattern.test(block)) block = block.replace(pattern, `${key}: ${value}`);
    else block = `${block.trimEnd()}\n${key}: ${value}`;
  }
  return source.replace(blockMatch[0], `---\n${block}\n---`);
}

function updateContentProject(content, fromProject, toProject, pairs) {
  let next = upsertFrontmatter(content, {
    project: yamlQuote(toProject),
    project_slug: yamlQuote(projectSlug(toProject))
  });
  next = next.replace(new RegExp(`# ${fromProject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), `# ${toProject}`);
  next = next.replace(new RegExp(`project_name: ${yamlQuote(fromProject).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), `project_name: ${yamlQuote(toProject)}`);
  for (const pair of pairs) next = next.split(pair.from).join(pair.to);
  return next;
}

function relativeProjectLink(target, projectName) {
  const prefix = `${PROJECT_ROOT}/${projectName}/`;
  return target.startsWith(prefix) ? target.slice(prefix.length).replace(/\.md$/i, "") : target.replace(/\.md$/i, "");
}

async function projectFiles(config, projectName) {
  const root = resolveWithinVault(config.vaultRoot, `${PROJECT_ROOT}/${projectName}`);
  const files = await walkFiles(root).catch(() => []);
  const result = [];
  for (const file of files) {
    const relative = rel(config, file);
    if (relative === `${PROJECT_ROOT}/${projectName}/${projectName}.md`) continue;
    const content = await fs.readFile(file, "utf8");
    result.push({ target: relative, type: typeFromContent(content) });
  }
  return result;
}

async function renderProjectHome(config, projectName) {
  const files = await projectFiles(config, projectName);
  const source = files.filter((file) => file.type === "source").slice(0, 10);
  const knowledge = files.filter((file) => ["knowledge", "digest"].includes(file.type)).slice(0, 10);
  const outputFiles = files.filter((file) => file.type === "output").slice(0, 10);
  const promptFiles = files.filter((file) => file.type === "prompt").slice(0, 10);
  const now = new Date().toISOString();
  return [
    "---",
    "type: project",
    "status: active",
    `project: ${yamlQuote(projectName)}`,
    `project_slug: ${yamlQuote(projectSlug(projectName))}`,
    "category: \"项目管理\"",
    "source_thread_id: null",
    "source_turn_id: null",
    "captured_from: \"oca-duplex-project-correction\"",
    `captured_at: ${yamlQuote(now)}`,
    `oca_version: ${yamlQuote(config.ocaVersion ?? config.version ?? "0.6.0")}`,
    "oca_managed: true",
    "tags: [\"项目管理\"]",
    `project_name: ${yamlQuote(projectName)}`,
    `created: ${yamlQuote(now)}`,
    `updated: ${yamlQuote(now)}`,
    "---",
    "",
    `# ${projectName}`,
    "",
    "## 项目定位",
    "",
    `这是 ${projectName} 的 OCA-Duplex 项目入口，用于汇总来源、整理、产出、Prompt 与纠错后的同步记录。`,
    "",
    "## 当前状态",
    "",
    `- 最近同步：${now.slice(0, 10)}`,
    `- 最近知识：${knowledge[0] ? `[[${relativeProjectLink(knowledge[0].target, projectName)}]]` : "暂无"}`,
    `- 最近产出：${outputFiles[0] ? `[[${relativeProjectLink(outputFiles[0].target, projectName)}]]` : "暂无"}`,
    `- 最近来源：${source[0] ? `[[${relativeProjectLink(source[0].target, projectName)}]]` : "暂无"}`,
    "",
    "## 内容分类",
    "",
    ...Object.values(PROJECT_FOLDERS).map((folder) => `- [[${folder}]]`),
    "",
    "## 最近整理",
    "",
    ...(knowledge.length ? knowledge.map((file) => `- [[${relativeProjectLink(file.target, projectName)}]]`) : ["- 暂无"]),
    "",
    "## 最近产出",
    "",
    ...(outputFiles.length ? outputFiles.map((file) => `- [[${relativeProjectLink(file.target, projectName)}]]`) : ["- 暂无"]),
    "",
    "## 项目 Prompts",
    "",
    ...(promptFiles.length ? promptFiles.map((file) => `- [[${relativeProjectLink(file.target, projectName)}]]`) : ["- 暂无"]),
    "",
    "## 最近来源",
    "",
    ...(source.length ? source.map((file) => `- [[${relativeProjectLink(file.target, projectName)}]]`) : ["- 暂无"]),
    "",
    "## 下一步",
    "",
    "- [ ] 待补充",
    ""
  ].join("\n");
}

async function renderProjectIndex(config) {
  const root = resolveWithinVault(config.vaultRoot, PROJECT_ROOT);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const projects = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  return [
    "---",
    "type: project-index",
    "status: active",
    "oca_managed: true",
    `updated: ${yamlQuote(new Date().toISOString())}`,
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
    "```dataview",
    "TABLE project, captured_at FROM \"10_项目\" WHERE type = \"log\" SORT captured_at DESC LIMIT 10",
    "```",
    "",
    "## 未归类捕获",
    "",
    "- [[00_收件箱/未归类Codex捕获]]",
    ""
  ].join("\n");
}

async function ensureProjectLayout(config, projectName) {
  const root = `${PROJECT_ROOT}/${projectName}`;
  for (const folder of ["", ...Object.values(PROJECT_FOLDERS)]) await fs.mkdir(resolveWithinVault(config.vaultRoot, `${root}/${folder}`), { recursive: true });
}

export async function listRecentRecords(config, limit = 20) {
  const statePath = resolveWithinVault(config.vaultRoot, config.state?.path ?? "90_System/oca-duplex/runtime-state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  return [...(state.records ?? [])].reverse().slice(0, limit).map((record, index) => {
    const files = record.files ?? [];
    return {
      index: index + 1,
      project: projectFromPath(files.find((file) => file.startsWith(`${PROJECT_ROOT}/`)) ?? "") ?? "未归类",
      source_file: files.find((file) => file.includes("/01_原始记录/")) ?? null,
      digest_files: files.filter((file) => file.includes("/02_知识整理/")),
      output_files: files.filter((file) => file.includes("/04_输出成果/")),
      source_thread_id: record.thread_id,
      source_turn_id: record.turn_id,
      captured_at: record.processed_at,
      mode: record.mode,
      commit_hash: record.commit_hash
    };
  });
}

export async function buildProjectMovePlan(config, { from, to, thread }) {
  if (!from || !to || !thread) throw new Error("--from, --to and --thread are required");
  const fromRoot = resolveWithinVault(config.vaultRoot, `${PROJECT_ROOT}/${from}`);
  const candidates = await walkFiles(fromRoot).catch(() => []);
  const moves = [];
  for (const file of candidates) {
    const content = await fs.readFile(file, "utf8");
    if (!ocaManaged(content) || !threadMatches(content, thread)) continue;
    const fromRelative = rel(config, file);
    const toRelative = targetForMove(fromRelative, from, to);
    moves.push({
      from: fromRelative,
      to: toRelative,
      type: typeFromContent(content),
      source_thread_id: frontmatterValue(content, "source_thread_id"),
      conflict: await exists(resolveWithinVault(config.vaultRoot, toRelative))
    });
  }
  const pairs = replacementPairs(moves.filter((move) => !move.conflict));
  const linkUpdates = [];
  for (const file of await scanVaultMarkdown(config)) {
    const relative = rel(config, file);
    const content = await fs.readFile(file, "utf8");
    const replacements = pairs.filter((pair) => content.includes(pair.from));
    if (replacements.length) linkUpdates.push({ file: relative, replacements });
  }
  const homeTargets = [`${PROJECT_ROOT}/${from}/${from}.md`, `${PROJECT_ROOT}/${to}/${to}.md`];
  const indexTarget = `${PROJECT_ROOT}/项目索引.md`;
  const aliasTarget = toPosix(path.relative(config.vaultRoot, aliasFilePath(config)));
  return {
    mode: "dry-run",
    from,
    to,
    thread,
    moves,
    link_updates: linkUpdates,
    home_updates: homeTargets,
    index_update: indexTarget,
    alias_update: aliasTarget,
    conflicts: moves.filter((move) => move.conflict)
  };
}

export async function applyProjectMovePlan(config, plan) {
  if (plan.conflicts?.length) throw new Error("Project move has conflicts; apply refused.");
  await ensureProjectLayout(config, plan.to);
  const pairs = replacementPairs(plan.moves);
  const movedTargets = [];
  const touched = [];
  for (const move of plan.moves) {
    const fromAbs = resolveWithinVault(config.vaultRoot, move.from);
    const toAbs = resolveWithinVault(config.vaultRoot, move.to);
    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    await fs.rename(fromAbs, toAbs);
    const content = await fs.readFile(toAbs, "utf8");
    await fs.writeFile(toAbs, updateContentProject(content, plan.from, plan.to, pairs), "utf8");
    movedTargets.push(move.to);
    touched.push(move.from, move.to);
  }
  for (const update of plan.link_updates) {
    const current = plan.moves.find((move) => move.from === update.file)?.to ?? update.file;
    const target = resolveWithinVault(config.vaultRoot, current);
    if (!(await exists(target))) continue;
    let content = await fs.readFile(target, "utf8");
    const before = content;
    for (const replacement of update.replacements) content = content.split(replacement.from).join(replacement.to);
    if (content !== before) {
      await fs.writeFile(target, content, "utf8");
      touched.push(current);
    }
  }
  for (const projectName of [plan.from, plan.to]) {
    await ensureProjectLayout(config, projectName);
    const homeTarget = `${PROJECT_ROOT}/${projectName}/${projectName}.md`;
    await fs.writeFile(resolveWithinVault(config.vaultRoot, homeTarget), await renderProjectHome(config, projectName), "utf8");
    touched.push(homeTarget);
  }
  await fs.writeFile(resolveWithinVault(config.vaultRoot, plan.index_update), await renderProjectIndex(config), "utf8");
  touched.push(plan.index_update);
  await addAlias(config, plan.to, plan.to, { commit: false });
  const sourceTitleAlias = movedTargets.find((target) => target.includes("/01_原始记录/"));
  if (sourceTitleAlias) {
    const stem = path.posix.basename(sourceTitleAlias, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-[0-9a-f]{8}$/i, "");
    if (stem && stem !== plan.to) await addAlias(config, plan.to, stem, { commit: false });
  }
  touched.push(plan.alias_update);
  const git = await commitPaths([...new Set(touched)], config, "oca-duplex: correct project routing");
  return { ...plan, mode: "applied", moved: movedTargets, git };
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function printRecent(records) {
  return records.map((record) => `[${record.index}] ${record.project} / ${record.captured_at?.slice(0, 10) ?? "未知日期"} / ${record.digest_files[0] ?? record.output_files[0] ?? record.source_file ?? record.source_turn_id}`).join("\n");
}

export async function runProjectCorrect(config) {
  const records = await listRecentRecords(config, 20);
  process.stdout.write(`检测到最近记录：\n\n${printRecent(records)}\n\n`);
  const rl = readline.createInterface({ input, output });
  try {
    const choice = Number(await rl.question("请选择要纠正的记录："));
    const selected = records.find((record) => record.index === choice);
    if (!selected) throw new Error("Invalid record choice");
    const to = (await rl.question("请输入正确项目名：")).trim();
    const plan = await buildProjectMovePlan(config, { from: selected.project, to, thread: selected.source_thread_id });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    const confirm = (await rl.question("确认执行迁移？[y/N] ")).trim().toLowerCase();
    if (confirm !== "y") return { status: "cancelled", plan };
    return applyProjectMovePlan(config, plan);
  } finally {
    rl.close();
  }
}

async function main() {
  const config = await loadConfig(path.join(codeRoot, "config.json"));
  const command = process.argv[2] ?? "move";
  if (command === "recent") {
    process.stdout.write(`${JSON.stringify(await listRecentRecords(config), null, 2)}\n`);
    return;
  }
  if (command === "correct") {
    process.stdout.write(`${JSON.stringify(await runProjectCorrect(config), null, 2)}\n`);
    return;
  }
  if (command === "move") {
    const plan = await buildProjectMovePlan(config, {
      from: argValue(process.argv, "--from"),
      to: argValue(process.argv, "--to"),
      thread: argValue(process.argv, "--thread")
    });
    const result = process.argv.includes("--dry-run") ? plan : await applyProjectMovePlan(config, plan);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown project command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}