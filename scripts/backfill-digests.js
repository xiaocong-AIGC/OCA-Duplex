import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractContentUnits, sourceReadableText } from "../core/content-extractor.js";
import { sanitizeFilename, semanticTags } from "../core/quality.js";
import { renderDigestBody, renderOutputBody, resolveWithinVault } from "../core/writer.js";
import { yamlString } from "../core/text.js";
import { commitPaths } from "../core/git.js";
import { projectRootPath, projectSubdirs, projectsRoot } from "../vault/path-map.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);

function yamlList(values) {
  return `[${values.map(yamlString).join(", ")}]`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function frontmatterValue(markdown, key) {
  const match = String(markdown ?? "").match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!match) return null;
  const value = match[1].trim().replace(/^['"]|['"]$/g, "");
  return value && value !== "null" ? value : null;
}

function isOcaManagedSource(markdown) {
  return /^type:\s*source\s*$/m.test(markdown)
    && (/^source_thread_id:\s*.+$/m.test(markdown) || /^oca_version:\s*.+$/m.test(markdown) || /^oca_managed:\s*true\s*$/m.test(markdown));
}

function metadataLines({ type, projectName, unit, sourceMeta, config }) {
  const capturedAt = sourceMeta.captured_at ?? new Date().toISOString();
  const tags = semanticTags(`${projectName}\n${unit.text}`);
  return [
    "---",
    `type: ${type}`,
    "status: active",
    `project: ${yamlString(projectName)}`,
    `project_slug: ${yamlString(projectName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-|-$/g, ""))}`,
    `category: ${yamlString(unit.category ?? "内容整理")}`,
    `source_thread_id: ${sourceMeta.source_thread_id ? yamlString(sourceMeta.source_thread_id) : "null"}`,
    `source_turn_id: ${sourceMeta.source_turn_id ? yamlString(sourceMeta.source_turn_id) : "null"}`,
    `captured_from: ${sourceMeta.captured_from ? yamlString(sourceMeta.captured_from) : "null"}`,
    `captured_at: ${yamlString(capturedAt)}`,
    `oca_version: ${yamlString(config.ocaVersion ?? config.version ?? "0.5.0")}`,
    "oca_managed: true",
    `tags: ${yamlList(tags)}`,
    "---",
    ""
  ];
}

function sourceMeta(markdown) {
  const turn = frontmatterValue(markdown, "source_turn_id") ?? markdown.match(/<!--\s*oca-turn:([^>]+)-->/)?.[1]?.trim() ?? null;
  return {
    source_thread_id: frontmatterValue(markdown, "source_thread_id"),
    source_turn_id: turn,
    captured_from: frontmatterValue(markdown, "captured_from"),
    captured_at: frontmatterValue(markdown, "captured_at")
  };
}

function targetForUnit(config, projectName, unit) {
  const folders = projectSubdirs(config);
  const folder = unit.type_hint === "output" ? folders.outputs : folders.knowledge;
  const fileName = `${sanitizeFilename(unit.title, unit.type_hint === "output" ? "项目输出" : "内容整理", 24)}.md`;
  return path.posix.join(projectsRoot(config), projectName, folder, fileName);
}

function unitContent(unit, projectName, sourceTarget, markdown, config) {
  const meta = metadataLines({ type: unit.type_hint, projectName, unit, sourceMeta: sourceMeta(markdown), config }).join("\n");
  const projectResolution = { project_name: projectName, project_slug: projectName.toLowerCase(), category: unit.category, confidence: 0.96 };
  const body = unit.type_hint === "output"
    ? renderOutputBody(unit, projectResolution, sourceTarget)
    : renderDigestBody(unit, projectResolution, sourceTarget);
  return `${meta}${body}`;
}

function relativeProjectLink(target, projectName, config) {
  const prefix = projectRootPath(config, projectName);
  return target.startsWith(`${prefix}/`) ? target.slice(prefix.length + 1).replace(/\.md$/i, "") : target.replace(/\.md$/i, "");
}

function upsertSection(content, heading, links, beforeHeading = "## 核心知识") {
  const linkLines = links.map((link) => `- [[${link}]]`);
  if (!content.includes(heading)) {
    const block = `${heading}\n\n${linkLines.join("\n")}\n\n`;
    const index = content.indexOf(beforeHeading);
    return index >= 0 ? `${content.slice(0, index)}${block}${content.slice(index)}` : `${content.trim()}\n\n${block}`;
  }
  const start = content.indexOf(heading) + heading.length;
  const next = content.slice(start).search(/\n##\s+/);
  const end = next >= 0 ? start + next : content.length;
  const section = content.slice(start, end);
  const missing = linkLines.filter((line) => !section.includes(line));
  if (missing.length === 0) return content;
  return `${content.slice(0, start)}\n\n${missing.join("\n")}\n${section.trim() ? `${section.trimEnd()}\n` : ""}${content.slice(end)}`;
}

async function listSourceFiles(config) {
  const root = resolveWithinVault(config.vaultRoot, projectsRoot(config));
  if (!(await pathExists(root))) return [];
  const projects = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const project of projects.filter((entry) => entry.isDirectory())) {
    const sourceDir = path.join(root, project.name, projectSubdirs(config).sources);
    if (!(await pathExists(sourceDir))) continue;
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".md"))) {
      const rel = path.posix.join(projectsRoot(config), project.name, projectSubdirs(config).sources, entry.name);
      files.push({ projectName: project.name, relativePath: rel, absolutePath: path.join(sourceDir, entry.name) });
    }
  }
  return files;
}

export async function buildBackfillDigestPlan(config) {
  const sources = await listSourceFiles(config);
  const creates = [];
  const skipped = [];
  const projectUpdates = new Map();
  for (const source of sources) {
    const markdown = await fs.readFile(source.absolutePath, "utf8");
    if (!isOcaManagedSource(markdown)) {
      skipped.push({ source: source.relativePath, reason: "not_oca_managed_source" });
      continue;
    }
    const text = sourceReadableText(markdown);
    const units = extractContentUnits({ text, projectName: source.projectName, title: path.basename(source.relativePath, ".md") });
    if (units.length === 0) {
      skipped.push({ source: source.relativePath, reason: "no_substantive_digest_or_output" });
      continue;
    }
    for (const unit of units) {
      const target = targetForUnit(config, source.projectName, unit);
      const absoluteTarget = resolveWithinVault(config.vaultRoot, target);
      if (await pathExists(absoluteTarget)) {
        skipped.push({ source: source.relativePath, target, reason: "target_exists" });
        continue;
      }
      creates.push({
        type: unit.type_hint,
        project: source.projectName,
        source: source.relativePath,
        target,
        content: unitContent(unit, source.projectName, source.relativePath, markdown, config)
      });
      const existing = projectUpdates.get(source.projectName) ?? { digest: [], output: [] };
      existing[unit.type_hint === "output" ? "output" : "digest"].push(relativeProjectLink(target, source.projectName, config));
      projectUpdates.set(source.projectName, existing);
    }
  }
  const homeUpdates = [];
  for (const [projectName, links] of projectUpdates) {
    const homeTarget = path.posix.join(config.projectRouting.root, projectName, `${sanitizeFilename(projectName, "项目首页", 24)}.md`);
    const absoluteHome = resolveWithinVault(config.vaultRoot, homeTarget);
    let before = await pathExists(absoluteHome) ? await fs.readFile(absoluteHome, "utf8") : `# ${projectName}\n\n## 项目定位\n\n待补充。\n\n## 核心知识\n\n- 暂无\n`;
    let after = before;
    if (links.digest.length > 0) after = upsertSection(after, "## 最近整理", links.digest, "## 核心知识");
    if (links.output.length > 0) after = upsertSection(after, "## 最近产出", links.output, "## 最近来源");
    if (after !== before) homeUpdates.push({ type: "project_home", project: projectName, target: homeTarget, content: after });
  }
  return {
    mode: "dry-run",
    sources_scanned: sources.length,
    creates: creates.map(({ content, ...entry }) => entry),
    home_updates: homeUpdates,
    skipped,
    conflicts: []
  };
}

export async function applyBackfillDigestPlan(config, plan) {
  const dryPlan = plan ?? await buildBackfillDigestPlan(config);
  const sources = await listSourceFiles(config);
  const sourceMap = new Map(sources.map((source) => [source.relativePath, source]));
  const written = [];
  for (const entry of dryPlan.creates) {
    const source = sourceMap.get(entry.source);
    if (!source) continue;
    const markdown = await fs.readFile(source.absolutePath, "utf8");
    const text = sourceReadableText(markdown);
    const unit = extractContentUnits({ text, projectName: entry.project, title: path.basename(source.relativePath, ".md") })
      .find((candidate) => targetForUnit(config, entry.project, candidate) === entry.target);
    if (!unit) continue;
    const absoluteTarget = resolveWithinVault(config.vaultRoot, entry.target);
    await fs.mkdir(path.dirname(absoluteTarget), { recursive: true });
    await fs.writeFile(absoluteTarget, unitContent(unit, entry.project, source.relativePath, markdown, config), { encoding: "utf8", flag: "wx" });
    written.push(entry.target);
  }
  for (const entry of dryPlan.home_updates) {
    const absoluteHome = resolveWithinVault(config.vaultRoot, entry.target);
    await fs.mkdir(path.dirname(absoluteHome), { recursive: true });
    await fs.writeFile(absoluteHome, entry.content, "utf8");
    written.push(entry.target);
  }
  const commit = await commitPaths(written, config, "oca-duplex: backfill content digests");
  return { ...dryPlan, mode: "apply", written, committed: commit.committed, commit_hash: commit.commit_hash, diff_summary: commit.diff_summary };
}

function publicBackfillResult(result) {
  return {
    ...result,
    home_updates: (result.home_updates ?? []).map(({ content, ...entry }) => entry)
  };
}
async function loadConfig() {
  const config = JSON.parse(await fs.readFile(path.join(projectDir, "config.json"), "utf8"));
  config.projectRouting = config.projectRouting ?? { root: projectsRoot(config), unsorted: "00_收件箱/未归类Codex捕获", minimumConfidence: 0.75 };
  return config;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const config = await loadConfig();
  const plan = await buildBackfillDigestPlan(config);
  const result = apply ? await applyBackfillDigestPlan(config, plan) : plan;
  console.log(JSON.stringify(publicBackfillResult(result), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}