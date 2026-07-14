import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeFilename } from "./quality.js";
import { generateTitle, isResearchContent } from "./title-generator.js";
import { contentBullets, directUseItems, followUpQuestions, outputTableRows } from "./content-extractor.js";
import { isCrossProjectContent, projectSlug } from "../runtime/project-resolver.js";
import { DEFAULT_PROJECT_SUBDIRS, dashboardPath, globalKnowledgeRoot, globalPromptRoot, localizeProjectName, projectsRoot, projectIndexPath, projectRootPath, projectSubdirs, unsortedCapturesPath } from "../vault/path-map.js";
import { layoutProfile } from "../vault/layout-profiles.js";
import { ARTIFACT_TYPES, CONTENT_SCHEMA_VERSION, artifactIdentity, threadLifecycle } from "./schema-v2.js";
import { appendAuditEvents, beginWriteTransaction, completeWriteTransaction, rollbackWriteTransaction } from "./write-transaction.js";
import { yamlString } from "./text.js";

export const PROJECT_FOLDERS = DEFAULT_PROJECT_SUBDIRS;

const PROJECT_SUMMARY_START = "<!-- oca:project-summary:start -->";
const PROJECT_SUMMARY_END = "<!-- oca:project-summary:end -->";

export function resolveWithinVault(vaultRoot, relativePath) {
  const root = path.resolve(vaultRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Refusing path outside Vault: ${relativePath}`);
  return target;
}

function yamlList(values) {
  return `[${values.map(yamlString).join(", ")}]`;
}

function metadataLines({ type, status = "draft", snapshot, projectResolution, projectName, category, tags = [], config, managed = false }) {
  const capturedAt = snapshot?.turn?.completed_at ?? new Date().toISOString();
  const lifecycle = threadLifecycle(snapshot);
  const chinese = String(config.locale ?? config.layoutProfile ?? "zh-CN").toLowerCase().startsWith("zh");
  const typeLabels = chinese
    ? { conversation: "对话底稿", source: "对话底稿", learning_summary: "复盘总结", knowledge: "待审知识", prompt: "提示词", output: "输出成果", project: "项目资产", log: "入库流水" }
    : { conversation: "Source record", source: "Source record", learning_summary: "Operating review", knowledge: "Knowledge", prompt: "Prompt", output: "Output", project: "Project asset", log: "Intake log" };
  const statusLabels = chinese
    ? { draft: "草稿", active: "生效中", captured: "已收录", candidate: "待审核", conflict: "有冲突", validated: "已采用", completed: "已完成" }
    : { draft: "Draft", active: "Active", captured: "Captured", candidate: "Needs review", conflict: "Conflict", validated: "Adopted", completed: "Completed" };
  const publicFields = chinese
    ? [`内容类型: ${yamlString(typeLabels[type] ?? type)}`, `所属项目: ${projectName ? yamlString(projectName) : "待分配"}`, `运营状态: ${yamlString(statusLabels[status] ?? status)}`, `最后更新: ${yamlString(capturedAt)}`]
    : [`content_type: ${yamlString(typeLabels[type] ?? type)}`, `project_name: ${projectName ? yamlString(projectName) : "Needs assignment"}`, `operating_status: ${yamlString(statusLabels[status] ?? status)}`, `updated_at: ${yamlString(capturedAt)}`];
  return [
    "---",
    ...publicFields,
    `tags: ${yamlList(tags)}`,
    "cssclasses: [oca-duplex-note]",
    `schema_version: ${CONTENT_SCHEMA_VERSION}`,
    `type: ${type}`,
    `artifact_id: ${yamlString(artifactIdentity(type, snapshot))}`,
    `status: ${status}`,
    `project: ${projectName ? yamlString(projectName) : "null"}`,
    `project_slug: ${projectName ? yamlString(projectResolution.project_slug) : "null"}`,
    `category: ${category ? yamlString(category) : "null"}`,
    `source_thread_id: ${snapshot?.thread?.id ? yamlString(snapshot.thread.id) : "null"}`,
    `source_turn_id: ${snapshot?.turn?.id ? yamlString(snapshot.turn.id) : "null"}`,
    `thread_status: ${yamlString(lifecycle.thread_status)}`,
    `turn_status: ${yamlString(lifecycle.turn_status)}`,
    `captured_from: ${snapshot?.thread?.source ? yamlString(snapshot.thread.source) : "null"}`,
    `captured_at: ${yamlString(capturedAt)}`,
    `oca_version: ${yamlString(config.ocaVersion ?? config.version ?? "0.4.0")}`,
    `oca_managed: ${managed}`,
    "---"
  ];
}

function cleanInline(value, maximum = 120) {
  const text = String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`>#]/g, "")
    .replace(/^\s*(?:[-+*]\s+|\d+[.)、]\s+)/, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, maximum).join("");
}

function frontmatterField(content, key) {
  const match = String(content ?? "").match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1].replace(/^['"]|['"]$/g, "").trim() : null;
}

function markdownSections(text) {
  const sections = [];
  let current = { title: "正文", lines: [] };
  for (const rawLine of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const heading = rawLine.trim().match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      if (current.lines.some((line) => line.trim())) sections.push({ title: current.title, body: current.lines.join("\n") });
      current = { title: cleanInline(heading[1], 48), lines: [] };
    } else current.lines.push(rawLine);
  }
  if (current.lines.some((line) => line.trim())) sections.push({ title: current.title, body: current.lines.join("\n") });
  return sections;
}

function uniqueItems(items, maximum = 8) {
  const result = [];
  for (const rawItem of items) {
    const item = cleanInline(rawItem, 180);
    if (item.length < 8) continue;
    const key = item.toLocaleLowerCase().replace(/[\s，。；：、,.!?！？:;“”"']/g, "");
    const similar = result.findIndex((entry) => entry.key.includes(key) || key.includes(entry.key));
    if (similar >= 0) {
      if (item.length < result[similar].item.length) result[similar] = { item, key };
      continue;
    }
    result.push({ item, key });
    if (result.length >= maximum) break;
  }
  return result.map((entry) => entry.item);
}

function itemsFromSections(sections, pattern, maximum = 8) {
  return uniqueItems(
    sections.filter((section) => pattern.test(section.title)).flatMap((section) => contentBullets(section.body, { max: maximum, minLength: 8 })),
    maximum
  );
}

function operationalStructure(text) {
  const sections = markdownSections(text);
  const all = uniqueItems(contentBullets(text, { max: 30, minLength: 8 }), 30);
  const conclusionSections = sections.filter((section) => /结论|摘要|概览|问题结论|一句话/i.test(section.title));
  const conclusion = uniqueItems(conclusionSections.flatMap((section) => contentBullets(section.body, { max: 3, minLength: 8 })), 1)[0]
    ?? all.find((item) => /核心|结论|本轮|主要|关键/.test(item))
    ?? all[0]
    ?? cleanInline(text, 180);
  const completed = itemsFromSections(sections, /已完成|完成内容|修复|处理结果|交付结果/i, 8);
  const risks = uniqueItems([
    ...itemsFromSections(sections, /限制|风险|技术债|待确认|未完成|其他发现|注意/i, 6),
    ...all.filter((item) => /尚未|仍然|仍有|风险|限制|不能|需要确认|待确认/.test(item))
  ], 6);
  const next = itemsFromSections(sections, /下一步|后续|计划|优先级|建议|待办/i, 8);
  const validation = itemsFromSections(sections, /验证|测试|检查结果|验收/i, 8);
  const excluded = new Set([conclusion, ...completed, ...risks, ...next, ...validation]);
  const keyPoints = all.filter((item) => !excluded.has(item) && !/^https?:/i.test(item)).slice(0, 8);
  return { conclusion, completed, risks, next, validation, keyPoints };
}

function callout(kind, title, lines) {
  if (!lines?.length) return [];
  return [`> [!${kind}] ${title}`, ...lines.map((line) => `> ${line.startsWith("-") ? line : `- ${line}`}`), ""];
}

function tableCell(value) {
  return cleanInline(value, 160).replace(/\|/g, "\\|");
}

function splitLabelValue(item) {
  const match = String(item).match(/^(.{2,32}?)[：:]\s*(.+)$/);
  return match ? [tableCell(match[1]), tableCell(match[2])] : [tableCell(item), "已记录"];
}

function resolvedDerivedTitle(kind, unit, projectResolution) {
  const generated = generateTitle({ kind, text: `${unit.title}\n${unit.text}`, projectName: projectResolution.project_name, fallback: unit.title });
  const poor = /^(?:你|我|我们|请|帮我|my request|files mentioned|本轮|当前|问题结论)/i.test(generated)
    || /(?:整理|方案|实践规则)$/.test(generated) && Array.from(generated).length > 22;
  if (!poor) return { title: generated, fallback: false };
  const suffix = kind === "output" ? "交付方案" : kind === "knowledge" ? "运营规则" : kind === "prompt" ? "提示词" : "内容复盘";
  return { title: `${projectResolution.project_name || "项目"} · ${suffix}`, fallback: true };
}

function meaningfulSentences(text) {
  const seen = new Set();
  return String(text ?? "")
    .replace(/^\|.*\|$/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1。")
    .split(/(?:\r?\n)+|(?<=[。！？!?；;])/u)
    .map((part) => cleanInline(part))
    .filter((part) => part.length >= 10)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sourceSummary(snapshot, topic) {
  const user = snapshot.conversation_nodes.find((node) => node.role === "user" && node.kind === "message")?.text ?? "";
  const assistantNodes = snapshot.conversation_nodes.filter((node) => node.role === "assistant" && node.kind === "message");
  const final = [...assistantNodes].reverse().find((node) => node.phase === "final_answer")?.text
    ?? [...assistantNodes].reverse().find((node) => node.phase !== "commentary")?.text
    ?? "";
  const conclusion = meaningfulSentences(final).find((sentence) => /一句话|核心|结论|建议|共性/.test(sentence)) ?? meaningfulSentences(final)[0];
  const request = cleanInline(user, 90);
  return cleanInline(`本轮围绕“${topic}”展开。用户关注：${request || "项目相关问题"}。${conclusion ? `Codex 给出的主要结论是：${conclusion}` : "对话保留了完整可见过程与工具结果。"}`, 220);
}

function renderTurnBlock(snapshot) {
  const marker = `<!-- oca-turn:${snapshot.turn.id} -->`;
  const timestamp = snapshot.turn.completed_at ?? snapshot.turn.started_at ?? "时间未知";
  const lines = [marker, `### ${timestamp.replace("T", " ").replace(/\.\d{3}Z$/, "Z")} / ${snapshot.turn.id}`, ""];
  const groups = [
    ["User", snapshot.conversation_nodes.filter((node) => node.role === "user" && node.kind === "message")],
    ["Codex", snapshot.conversation_nodes.filter((node) => node.role === "assistant")],
    ["Tool Results", snapshot.conversation_nodes.filter((node) => node.role === "tool")]
  ];
  for (const [label, nodes] of groups) {
    if (nodes.length === 0) continue;
    lines.push(`#### ${label}`, "");
    for (const node of nodes) {
      if (label === "Codex" && (node.phase || node.kind === "reasoning_summary")) {
        const phase = node.kind === "reasoning_summary" ? "visible reasoning summary" : node.phase;
        lines.push(`_阶段：${phase}_`, "");
      }
      lines.push(node.text.trim(), "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

function sourceInfo(snapshot, title, projectResolution, config) {
  const date = (snapshot.thread.created_at ?? snapshot.turn.completed_at ?? new Date().toISOString()).slice(0, 10);
  const topicText = `${snapshot.thread.name ?? ""}\n${snapshot.thread.preview ?? ""}\n${title}\n${snapshot.conversation_nodes.map((node) => node.text).join("\n")}`;
  const topic = generateTitle({ kind: "source", text: topicText, projectName: projectResolution.project_name, fallback: "Codex 对话记录" });
  const thread = snapshot.thread.id.slice(0, 8);
  const fileName = `${date}-${sanitizeFilename(topic, "Codex 对话记录", 24)}-${thread}.md`;
  const confident = projectResolution.confidence >= (config.projectRouting?.minimumConfidence ?? 0.75);
  const folder = confident
    ? path.posix.join(projectsRoot(config), localizeProjectName(projectResolution.project_name), projectSubdirs(config).sources)
    : unsortedCapturesPath(config);
  return { topic, target: path.posix.join(folder, fileName), confident };
}

function renderSource(snapshot, source, projectResolution, config, turnBlock) {
  const projectName = source.confident ? projectResolution.project_name : null;
  return [
    ...metadataLines({
      type: ARTIFACT_TYPES.conversation,
      status: "captured",
      snapshot,
      projectResolution,
      projectName,
      category: projectResolution.category,
      tags: ["codex"],
      config
    }),
    "",
    `# ${source.topic}`,
    "",
    "## 笔记属性",
    "",
    `- 项目：${projectName ?? "未归类"}`,
    `- 分类：${projectResolution.category ?? "需要人工归类"}`,
    `- Thread：${snapshot.thread.id}`,
    "",
    "## 摘要",
    "",
    sourceSummary(snapshot, source.topic),
    "",
    "## 对话记录",
    "",
    turnBlock
  ].join("\n");
}

function extractMarkdownRows(text) {
  const rows = String(text ?? "").split(/\r?\n/)
    .filter((line) => /^\s*\|.*\|\s*$/.test(line) && !/^\s*\|?\s*:?-{2,}/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cleanInline(cell, 80)))
    .filter((cells) => cells.length >= 3 && cells.some(Boolean));
  return rows.slice(0, 6);
}

function knowledgeStructure(unit, projectResolution) {
  const sentences = meaningfulSentences(unit.text);
  const usefulSentences = sentences.filter((sentence) => !/^\[\[/.test(sentence) && !/方法总结$|知识系统$/.test(sentence) && sentence.length >= 16);
  const conclusion = usefulSentences.find((sentence) => /一句话|核心|结论|关键/.test(sentence)) ?? usefulSentences[0] ?? cleanInline(unit.text, 180);
  const points = usefulSentences.filter((sentence) => sentence !== conclusion).slice(0, 8);
  const methods = usefulSentences.filter((sentence) => /首先|然后|通过|保持|需要|应当|可以|步骤|公式/.test(sentence)).slice(0, 5);
  const cautions = usefulSentences.filter((sentence) => /避免|不要|注意|风险|但|不能|禁止/.test(sentence)).slice(0, 3);
  return { conclusion: cleanInline(conclusion, 140), points, methods, cautions };
}

export function renderKnowledgeBody(unit, projectResolution, sourceTarget) {
  const structure = knowledgeStructure(unit, projectResolution);
  const { title } = resolvedDerivedTitle("knowledge", unit, projectResolution);
  const research = isResearchContent(`${unit.title}\n${unit.text}`);
  const lines = [`# ${title}`, "", ...callout("summary", "一句话结论", [structure.conclusion])];
  if (research) {
    const rows = extractMarkdownRows(unit.text);
    if (rows.length > 0) lines.push("## 来源中的结构化数据", "", ...rows.map((row) => `| ${row.join(" | ")} |`), "");
  } else {
    if (structure.points.length > 0) lines.push("## 核心要点", "", ...structure.points.map((point) => `- ${cleanInline(point, 140)}`), "");
  }
  if (structure.methods.length > 0) lines.push("## 对话中明确的方法", "", ...structure.methods.map((method, index) => `${index + 1}. ${cleanInline(method, 140)}`), "");
  if (structure.cautions.length > 0) lines.push(...callout("warning", "适用限制", structure.cautions.map((item) => cleanInline(item, 140))));
  lines.push("", "## 来源", "", `- [[${sourceTarget.replace(/\.md$/i, "")}]]`);
  return `${lines.join("\n").trim()}\n`;
}

export function renderDigestBody(unit, projectResolution, sourceTarget) {
  const { title } = resolvedDerivedTitle("digest", unit, projectResolution);
  const bullets = contentBullets(unit.text, { max: 8, minLength: 12 });
  const conclusion = bullets[0] ?? cleanInline(unit.text, 180);
  return [
    `# ${title}`,
    "",
    "## 本轮结论",
    "",
    conclusion,
    "",
    "## 关键内容",
    "",
    ...bullets.slice(0, 8).map((item) => `- ${cleanInline(item, 150)}`),
    "",
    "## 来源",
    "",
    `- [[${sourceTarget.replace(/\.md$/i, "")}]]`,
    ""
  ].join("\n");
}

function renderLearningSummaryBody(unit, projectResolution, sourceTarget, snapshot) {
  const structure = operationalStructure(unit.text);
  const project = projectResolution.project_name || "项目";
  const lines = [`# ${project} · 阶段复盘`, "", ...callout("summary", "本轮结论", [structure.conclusion])];
  if (structure.completed.length) lines.push(...callout("success", "本轮已完成", structure.completed.map((item) => `- [x] ${item}`)));
  if (structure.keyPoints.length) lines.push("## 关键结论", "", ...structure.keyPoints.map((item) => `- ${item}`), "");
  if (structure.risks.length) lines.push(...callout("warning", "待确认与风险", structure.risks));
  if (structure.next.length) {
    lines.push("## 下一步行动", "", "| 序号 | 行动项 | 状态 |", "| ---: | --- | --- |", ...structure.next.map((item, index) => `| ${index + 1} | ${tableCell(item)} | 待执行 |`), "");
  }
  if (structure.validation.length) {
    lines.push("## 验证结果", "", "| 检查项 | 结果 |", "| --- | --- |", ...structure.validation.map((item) => {
      const [label, value] = splitLabelValue(item);
      return `| ${label} | ${value} |`;
    }), "");
  }
  lines.push("## 来源对话", "", `- [[${sourceTarget.replace(/\.md$/i, "")}]]`, "", "> [!info] 更新时间", `> ${snapshot.turn.completed_at ?? snapshot.turn.started_at ?? "时间未知"}`, "");
  return lines.join("\n");
}

export function renderOutputBody(unit, projectResolution, sourceTarget) {
  const { title } = resolvedDerivedTitle("output", unit, projectResolution);
  return [
    `# ${title}`,
    "",
    "## 对话中产出的可直接使用内容",
    "",
    unit.text.trim(),
    "",
    "## 来源",
    "",
    `- [[${sourceTarget.replace(/\.md$/i, "")}]]`,
    ""
  ].join("\n");
}
function renderPromptBody(unit, projectResolution, sourceTarget) {
  const { title } = resolvedDerivedTitle("prompt", unit, projectResolution);
  return [
    `# ${title}`,
    "",
    "## 提示词",
    "",
    unit.text.trim(),
    "",
    "## 来源",
    "",
    `- [[${sourceTarget.replace(/\.md$/i, "")}]]`,
    ""
  ].join("\n");
}

function derivedTarget(unit, projectResolution, config) {
  const confident = projectResolution.confidence >= (config.projectRouting?.minimumConfidence ?? 0.75);
  const resolved = resolvedDerivedTitle(unit.type, unit, projectResolution);
  const title = resolved.title;
  const profile = layoutProfile(config.locale ?? config.layoutProfile ?? "zh-CN");
  let fileName = unit.type === "learning_summary"
    ? `${sanitizeFilename(projectResolution.project_name || profile.names.learningSummary, profile.names.learningSummary, 18)}-阶段复盘-${sanitizeFilename(unit.source_thread_id?.slice(0, 8), "thread", 12)}.md`
    : `${sanitizeFilename(title, unit.unit_id, 28)}${resolved.fallback && unit.type === "output" ? `-${sanitizeFilename(unit.source_turn_id?.slice(0, 8), "turn", 10)}` : ""}.md`;
  if (unit.type === "knowledge" && ["conflict", "supersede"].includes(unit.knowledge_lifecycle?.operation)) {
    const suffix = unit.knowledge_lifecycle.operation === "conflict" ? (profile.id === "en-US" ? "Conflict" : "冲突") : (profile.id === "en-US" ? "Replacement" : "替代候选");
    fileName = `${sanitizeFilename(title, unit.unit_id, 20)}-${suffix}-${sanitizeFilename(unit.source_turn_id?.slice(0, 8), "turn", 10)}.md`;
  }
  if (!confident) return { title, target: path.posix.join(unsortedCapturesPath(config), fileName), scope: "unsorted", projectName: null };
  if (unit.type === "knowledge" && isCrossProjectContent(unit.text)) return { title, target: path.posix.join(globalKnowledgeRoot(config), fileName), scope: "global", projectName: null };
  if (unit.type === "prompt" && isCrossProjectContent(unit.text)) return { title, target: path.posix.join(globalPromptRoot(config), fileName), scope: "global", projectName: null };
  const folders = projectSubdirs(config);
  const subfolder = unit.type === "prompt"
    ? folders.prompts
    : unit.type === "output"
      ? folders.outputs
      : unit.type === "learning_summary"
        ? folders.summaries
        : folders.knowledge;
  return { title, target: path.posix.join(projectsRoot(config), localizeProjectName(projectResolution.project_name), subfolder, fileName), scope: "project", projectName: localizeProjectName(projectResolution.project_name) };
}

function renderDerived(unit, links, sourceTarget, projectResolution, routing, snapshot, config) {
  const category = isResearchContent(`${unit.title}\n${unit.text}`) ? "趋势调研" : projectResolution.category ?? unit.category;
  const metadata = metadataLines({ type: unit.type, status: unit.type === "knowledge" ? (unit.knowledge_lifecycle?.state ?? "candidate") : "active", snapshot, projectResolution, projectName: routing.projectName, category, tags: unit.tags ?? [], config, managed: true });
  metadata.pop();
  const body = unit.type === "prompt"
    ? renderPromptBody(unit, projectResolution, sourceTarget)
    : ["digest", "learning_summary"].includes(unit.type)
      ? (unit.type === "learning_summary" ? renderLearningSummaryBody(unit, projectResolution, sourceTarget, snapshot) : renderDigestBody(unit, projectResolution, sourceTarget))
      : unit.type === "output"
        ? renderOutputBody(unit, projectResolution, sourceTarget)
        : renderKnowledgeBody(unit, projectResolution, sourceTarget);
  const lines = [
    ...metadata,
    `confidence: ${unit.confidence.toFixed(2)}`,
    `oca_unit_id: ${yamlString(unit.unit_id)}`,
    ...(unit.type === "knowledge" ? [
      `knowledge_operation: ${yamlString(unit.knowledge_lifecycle?.operation ?? "add")}`,
      `related_knowledge: ${unit.knowledge_lifecycle?.existing_target ? yamlString(unit.knowledge_lifecycle.existing_target) : "null"}`,
      `operation_reason: ${yamlString(unit.knowledge_lifecycle?.reason ?? "新候选知识")}`
    ] : []),
    `recommended_target: ${yamlString(routing.target)}`,
    "---",
    "",
    body.trim()
  ];
  if (links.length > 0) lines.push("", "## 相关知识", "", ...links.map((link) => `- [[${link.target}]]`));
  return `${lines.join("\n").trim()}\n`;
}

function relativeProjectLink(target, projectRoot) {
  return target.startsWith(`${projectRoot}/`) ? target.slice(projectRoot.length + 1).replace(/\.md$/i, "") : target.replace(/\.md$/i, "");
}

function projectSummaryBlock(projectRoot, sourceTarget, derivedEntries, snapshot, config) {
  const folders = projectSubdirs(config);
  const date = (snapshot.turn.completed_at ?? new Date().toISOString()).slice(0, 10);
  const knowledge = derivedEntries.filter((entry) => entry.type === "knowledge" && entry.scope === "project");
  const digests = derivedEntries.filter((entry) => ["digest", "learning_summary"].includes(entry.type) && entry.scope === "project");
  const outputs = derivedEntries.filter((entry) => entry.type === "output" && entry.scope === "project");
  const latestKnowledge = knowledge[0] ?? digests[0];
  return [
    PROJECT_SUMMARY_START,
    "## 当前状态",
    "",
    `- 最近同步：${date}`,
    `- 最近知识：${latestKnowledge ? `[[${relativeProjectLink(latestKnowledge.target, projectRoot)}]]` : "暂无"}`,
    `- 最近来源：[[${relativeProjectLink(sourceTarget, projectRoot)}]]`,
    `- 最近产出：${outputs[0] ? `[[${relativeProjectLink(outputs[0].target, projectRoot)}]]` : "暂无"}`,
    "",
    "## 内容分类",
    "",
    ...Object.values(folders).map((folder) => `- [[${folder}]]`),
    "",
    "## 最近整理",
    "",
    ...(digests.length > 0 ? digests.map((entry) => `- [[${relativeProjectLink(entry.target, projectRoot)}]]`) : ["- 暂无新整理"]),
    "",
    "## 最近产出",
    "",
    ...(outputs.length > 0 ? outputs.map((entry) => `- [[${relativeProjectLink(entry.target, projectRoot)}]]`) : ["- 暂无新产出"]),
    "",
    "## 核心知识",
    "",
    ...(knowledge.length > 0 ? knowledge.map((entry) => `- [[${relativeProjectLink(entry.target, projectRoot)}]]`) : ["- 暂无新知识"]),
    "",
    "```dataview",
    `LIST FROM ${yamlString(`${projectRoot}/${folders.knowledge}`)} SORT captured_at DESC LIMIT 10`,
    "```",
    "",
    "## 最近来源",
    "",
    `- [[${relativeProjectLink(sourceTarget, projectRoot)}]]`,
    "",
    "```dataview",
    `LIST FROM ${yamlString(`${projectRoot}/${folders.sources}`)} SORT captured_at DESC LIMIT 10`,
    "```",
    "",
    "## 下一步",
    "",
    "- [ ] 待补充",
    PROJECT_SUMMARY_END
  ].join("\n");
}
function renderProjectHome(projectResolution, snapshot, sourceTarget, derivedEntries, projectUnit, config) {
  const name = projectResolution.project_name;
  const root = projectRootPath(config, name);
  const positioning = meaningfulSentences(projectUnit?.text).slice(0, 2).join(" ") || `这是 ${name} 的统一入口，用于汇总来源、知识、提示词、产出与关键决策。`;
  const metadata = metadataLines({ type: "project", status: "active", snapshot, projectResolution, projectName: name, category: projectResolution.category, tags: ["项目管理"], config });
  metadata.pop();
  return [
    ...metadata,
    `project_name: ${yamlString(name)}`,
    `created: ${yamlString(snapshot.thread.created_at ?? snapshot.turn.completed_at ?? new Date().toISOString())}`,
    `updated: ${yamlString(snapshot.turn.completed_at ?? new Date().toISOString())}`,
    "---",
    "",
    `# ${name}`,
    "",
    "## 项目定位",
    "",
    cleanInline(positioning, 240),
    "",
    projectSummaryBlock(root, sourceTarget, derivedEntries, snapshot, config),
    ""
  ].join("\n");
}

function renderProjectIndex(snapshot, projectResolution, config) {
  const root = projectsRoot(config);
  return [
    ...metadataLines({ type: "project-index", status: "active", snapshot, projectResolution, projectName: null, category: "项目管理", tags: ["项目管理"], config, managed: true }),
    "", "# 项目索引", "", "## 如何使用", "",
    "1. 先进入具体项目首页了解定位与最近变化。",
    "2. 阅读 `02_知识整理` 获取提炼结论，需要上下文时再查看 `01_原始记录`。",
    "3. 从 `03_提示词` 复用提示词，从 `04_输出成果` 查看最终产出。",
    "", "## 活跃项目", "", "```dataview",
    `LIST FROM ${yamlString(root)} WHERE type = "project" AND status = "active"`,
    "```", "", "## 最近同步", "", "```dataview",
    `TABLE project, captured_at FROM ${yamlString(root)} WHERE type = "log" SORT captured_at DESC LIMIT 10`,
    "```", "", "## 未归类捕获", "", `- [[${unsortedCapturesPath(config)}]]`, ""
  ].join("\n");
}

function renderDashboard(snapshot, projectResolution, config) {
  return [
    ...metadataLines({ type: "dashboard", status: "active", snapshot, projectResolution, projectName: null, category: "系统状态", tags: ["知识管理", "项目管理"], config, managed: true }),
    "", "# 系统看板", "", "```dataviewjs",
    `const pages = dv.pages(${JSON.stringify(`\"${projectsRoot(config)}\"`)});`,
    "const today = dv.date('today');",
    "const captures = pages.where(p => p.type === 'source');",
    "dv.table(['指标', '数量'], [",
    "  ['今日捕获', captures.where(p => p.captured_at && dv.date(p.captured_at).hasSame(today, 'day')).length],",
    "  ['本周捕获', captures.where(p => p.captured_at && dv.date(p.captured_at) >= today.minus({days: 7})).length],",
    "  ['活跃项目', pages.where(p => p.type === 'project' && p.status === 'active').length],",
    `  ['未归类', dv.pages(${JSON.stringify(`\"${unsortedCapturesPath(config)}\"`)}).length]`,
    "]);", "dv.header(2, '最近写入文件');",
    "dv.list(pages.where(p => p.captured_at).sort(p => p.captured_at, 'desc').limit(10).file.link);",
    "try {", `  const state = JSON.parse(await app.vault.adapter.read(${JSON.stringify(config.state.path)}));`,
    "  const last = [...(state.records ?? [])].reverse().find(r => r.commit_hash);",
    "  dv.paragraph(`最近 commit hash：${last?.commit_hash ?? '暂无'}`);",
    "} catch (_) { dv.paragraph('最近 commit hash：暂无'); }", "```", ""
  ].join("\n");
}

function renderLog(snapshot, projectResolution, targets, config) {
  return [
    ...metadataLines({ type: "log", status: "completed", snapshot, projectResolution, projectName: projectResolution.project_name, category: "入库流水", tags: ["codex"], config }),
    "", `# 入库流水 ${snapshot.turn.id.slice(0, 8)}`, "", ...targets.map((target) => `- [[${target.replace(/\.md$/i, "")}]]`), ""
  ].join("\n");
}

export function buildWritePlan({ snapshot, title, units, linkSets, projectResolution, config }) {
  config = {
    ...config,
    projectRouting: config.projectRouting ?? { root: projectsRoot(config), unsorted: unsortedCapturesPath(config), minimumConfidence: 0.75 },
    dashboard: config.dashboard ?? { path: dashboardPath(config) }
  };
  projectResolution = projectResolution ?? {
    project_name: "未归类Codex捕获", project_slug: "unsorted", category: "需要人工归类", confidence: 0.45,
    reason: "没有项目识别结果", source: "heuristic", needs_confirmation: true
  };
  projectResolution = { ...projectResolution, project_name: localizeProjectName(projectResolution.project_name) };
  projectResolution.project_slug = projectSlug(projectResolution.project_name);
  const source = sourceInfo(snapshot, title, projectResolution, config);
  const turnBlock = renderTurnBlock(snapshot);
  const projectRoot = source.confident ? projectRootPath(config, projectResolution.project_name) : null;
  const projectUnit = units.find((unit) => unit.type === "project");
  const linksByUnit = new Map(linkSets.map((set) => [set.unit_id, set.links]));
  const createUnits = units.filter((unit) => unit.action === "create" && (unit.type !== "project" || !source.confident));
  const contentUnits = createUnits.filter((unit) => ["digest", "learning_summary", "output"].includes(unit.type));
  const maximum = Math.min(config.write.maxDerivedNotesPerTurn ?? 3, 3);
  const otherUnits = createUnits.filter((unit) => !["digest", "learning_summary", "output"].includes(unit.type)).slice(0, maximum);
  const derivedUnits = [...contentUnits, ...otherUnits].slice(0, Math.max(maximum, contentUnits.length));
  const derivedEntries = derivedUnits.map((unit) => ({ unit, routing: derivedTarget(unit, projectResolution, config) }));
  const plan = [];

  if (source.confident && config.write.generateProjectHome === true) {
    const homeTarget = path.posix.join(projectRoot, `${sanitizeFilename(projectResolution.project_name, "项目首页", 24)}.md`);
    const publicDerived = derivedEntries.map(({ unit, routing }) => ({ type: unit.type, scope: routing.scope, target: routing.target }));
    const managedBlock = projectSummaryBlock(projectRoot, source.target, publicDerived, snapshot, config);
    plan.push({
      operation: "upsert_project_home", type: "project_home", target: homeTarget, project_root: projectRoot,
      managed_block: managedBlock,
      content: renderProjectHome(projectResolution, snapshot, source.target, publicDerived, projectUnit, config)
    });
  }

  plan.push({
    operation: "upsert_thread_source", type: "source", target: source.target, project_root: projectRoot,
    source_thread_id: snapshot.thread.id, source_turn_id: snapshot.turn.id,
    turn_marker: `<!-- oca-turn:${snapshot.turn.id} -->`,
    content: renderSource(snapshot, source, projectResolution, config, turnBlock), append_content: `\n${turnBlock}`
  });

  for (const { unit, routing: initialRouting } of derivedEntries) {
    let routing = initialRouting;
    const lifecycle = unit.type === "knowledge" ? (unit.knowledge_lifecycle ?? { operation: "add", state: "candidate" }) : null;
    const mayUpdateExisting = lifecycle && ["update", "merge"].includes(lifecycle.operation) && lifecycle.existing_target && lifecycle.existing_managed;
    const safeLifecycle = lifecycle && ["update", "merge"].includes(lifecycle.operation) && lifecycle.existing_target && !lifecycle.existing_managed
      ? { ...lifecycle, operation: "conflict", state: "candidate", reason: "相似知识不是 OCA 管理文件，已保留新候选供人工处理" }
      : lifecycle;
    if (safeLifecycle && safeLifecycle !== lifecycle) {
      unit.knowledge_lifecycle = safeLifecycle;
      routing = derivedTarget(unit, projectResolution, config);
    }
    plan.push({
      operation: unit.type === "learning_summary" ? "upsert_learning_summary" : mayUpdateExisting ? "upsert_knowledge" : "create_if_absent", type: unit.type, scope: routing.scope, category: projectResolution.category,
      target: mayUpdateExisting ? lifecycle.existing_target : routing.target, project_root: routing.scope === "project" ? projectRoot : null,
      source_turn_id: snapshot.turn.id, unit_id: unit.unit_id,
      knowledge_operation: safeLifecycle?.operation,
      knowledge_state: safeLifecycle?.state,
      related_knowledge: safeLifecycle?.existing_target,
      knowledge_evidence: mayUpdateExisting ? renderKnowledgeEvidence(unit, snapshot, source.target) : undefined,
      content: renderDerived(unit, linksByUnit.get(unit.unit_id) ?? [], source.target, projectResolution, routing, snapshot, config)
    });
    if (safeLifecycle?.operation === "supersede" && safeLifecycle.existing_target && safeLifecycle.existing_managed) {
      plan.push({
        operation: "mark_knowledge_superseded",
        type: "knowledge_status",
        target: safeLifecycle.existing_target,
        project_root: routing.scope === "project" ? projectRoot : null,
        superseded_by: routing.target,
        source_turn_id: snapshot.turn.id,
        content: ""
      });
    }
  }

  if (source.confident && config.write.generateMaintenanceFiles === true) {
    const date = (snapshot.turn.completed_at ?? new Date().toISOString()).slice(0, 10);
    const logTarget = path.posix.join(projectRoot, projectSubdirs(config).logs, `${date}-${snapshot.turn.id.slice(0, 8)}.md`);
    const loggedTargets = plan.map((entry) => entry.target);
    plan.push({ operation: "create_if_absent", type: "log", target: logTarget, project_root: projectRoot, content: renderLog(snapshot, projectResolution, loggedTargets, config) });
  }

  if (config.write.generateMaintenanceFiles === true) {
    plan.push({ operation: "upsert_managed_file", type: "project_index", target: projectIndexPath(config), content: renderProjectIndex(snapshot, projectResolution, config) });
    plan.push({ operation: "upsert_managed_file", type: "dashboard", target: dashboardPath(config), content: renderDashboard(snapshot, projectResolution, config) });
  }
  return plan;
}

export function publicWritePlan(plan) {
  return plan.map(({ content, append_content, turn_marker, managed_block, learning_current, learning_history, learning_marker, ...entry }) => ({ ...entry, content_bytes: Buffer.byteLength(content, "utf8") }));
}

function renderKnowledgeEvidence(unit, snapshot, sourceTarget) {
  const bullets = contentBullets(unit.text, { max: 6, minLength: 12 });
  return [
    `<!-- oca-knowledge-evidence:${snapshot.turn.id} -->`,
    `### ${snapshot.turn.completed_at ?? snapshot.turn.started_at ?? snapshot.turn.id}`,
    "",
    `- 操作：${unit.knowledge_lifecycle?.operation ?? "update"}`,
    `- 来源：[[${sourceTarget.replace(/\.md$/i, "")}]]`,
    ...(bullets.length ? bullets.map((item) => `- ${cleanInline(item, 160)}`) : []),
    ""
  ].join("\n");
}

async function createWithoutOverwrite(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
    return "created";
  } catch (error) {
    if (error.code === "EEXIST") return "skipped_existing";
    throw error;
  }
}

async function upsertThreadSource(filePath, entry) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing.includes(entry.turn_marker)) return "skipped_existing";
    await fs.appendFile(filePath, entry.append_content, "utf8");
    return "updated";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const created = await createWithoutOverwrite(filePath, entry.content);
    return created === "created" ? created : upsertThreadSource(filePath, entry);
  }
}

async function upsertLearningSummary(filePath, entry) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (frontmatterField(existing, "source_turn_id") === String(entry.source_turn_id)) return "skipped_existing";
    let next = entry.content;
    for (const key of ["assigned_at", "assigned_by"]) {
      const preserved = frontmatterField(existing, key);
      if (preserved && !new RegExp(`^${key}:`, "m").test(next)) next = next.replace(/^---\s*$/m, `---\n${key}: ${yamlString(preserved)}`);
    }
    await fs.writeFile(filePath, `${next.trim()}\n`, "utf8");
    return "updated";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return createWithoutOverwrite(filePath, entry.content);
  }
}

async function upsertKnowledge(filePath, entry) {
  const existing = await fs.readFile(filePath, "utf8");
  if (!/^oca_managed:\s*true\s*$/m.test(existing)) return "skipped_user_owned";
  const marker = `<!-- oca-knowledge-evidence:${entry.source_turn_id} -->`;
  if (existing.includes(marker)) return "skipped_existing";
  let next = existing.replace(/^knowledge_operation:\s*.*$/m, `knowledge_operation: ${yamlString(entry.knowledge_operation)}`);
  next = next.replace(/^source_turn_id:\s*.*$/m, `source_turn_id: ${yamlString(entry.source_turn_id)}`);
  next = next.replace(/^captured_at:\s*.*$/m, `captured_at: ${yamlString(new Date().toISOString())}`);
  if (/^## 更新证据\s*$/m.test(next)) next = `${next.trim()}\n\n${entry.knowledge_evidence.trim()}\n`;
  else next = `${next.trim()}\n\n## 更新证据\n\n${entry.knowledge_evidence.trim()}\n`;
  await fs.writeFile(filePath, next, "utf8");
  return "updated";
}

async function markKnowledgeSuperseded(filePath, entry) {
  const existing = await fs.readFile(filePath, "utf8");
  if (!/^oca_managed:\s*true\s*$/m.test(existing)) return "skipped_user_owned";
  const marker = `<!-- oca-superseded:${entry.source_turn_id} -->`;
  if (existing.includes(marker)) return "skipped_existing";
  let next = existing.replace(/^status:\s*.*$/m, "status: superseded");
  next = `${next.trim()}\n\n${marker}\n## 替代记录\n\n- 已由 [[${entry.superseded_by.replace(/\.md$/i, "")}]] 替代。\n`;
  await fs.writeFile(filePath, next, "utf8");
  return "updated";
}

async function upsertProjectHome(filePath, entry) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const existing = await fs.readFile(filePath, "utf8");
    let next;
    if (existing.includes(PROJECT_SUMMARY_START) && existing.includes(PROJECT_SUMMARY_END)) {
      next = existing.replace(new RegExp(`${PROJECT_SUMMARY_START}[\\s\\S]*?${PROJECT_SUMMARY_END}`), entry.managed_block);
    } else {
      next = `${existing.trim()}\n\n${entry.managed_block}\n`;
    }
    next = next.replace(/^updated:\s*.*$/m, `updated: ${yamlString(new Date().toISOString())}`);
    if (next === existing) return "skipped_existing";
    await fs.writeFile(filePath, next, "utf8");
    return "updated";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return createWithoutOverwrite(filePath, entry.content);
  }
}

async function upsertManagedFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (!/^oca_managed:\s*true\s*$/m.test(existing)) return "skipped_user_owned";
    if (existing === content) return "skipped_existing";
    await fs.writeFile(filePath, content, "utf8");
    return "updated";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return createWithoutOverwrite(filePath, content);
  }
}

async function ensureProjectLayout(vaultRoot, projectRoot, config) {
  if (!projectRoot) return;
  for (const folder of ["", ...Object.values(projectSubdirs(config))]) {
    await fs.mkdir(resolveWithinVault(vaultRoot, path.posix.join(projectRoot, folder)), { recursive: true });
  }
}

export async function executeWritePlan(plan, config) {
  const results = [];
  const transaction = await beginWriteTransaction(plan, config);
  try {
    for (const projectRoot of [...new Set(plan.map((entry) => entry.project_root).filter(Boolean))]) await ensureProjectLayout(config.vaultRoot, projectRoot, config);
    for (const entry of plan) {
      const absolutePath = resolveWithinVault(config.vaultRoot, entry.target);
      let outcome;
      if (entry.operation === "upsert_thread_source") outcome = await upsertThreadSource(absolutePath, entry);
      else if (entry.operation === "upsert_learning_summary") outcome = await upsertLearningSummary(absolutePath, entry);
      else if (entry.operation === "upsert_knowledge") outcome = await upsertKnowledge(absolutePath, entry);
      else if (entry.operation === "mark_knowledge_superseded") outcome = await markKnowledgeSuperseded(absolutePath, entry);
      else if (entry.operation === "upsert_project_home") outcome = await upsertProjectHome(absolutePath, entry);
      else if (entry.operation === "upsert_managed_file") outcome = await upsertManagedFile(absolutePath, entry.content);
      else outcome = await createWithoutOverwrite(absolutePath, entry.content);
      results.push({ ...entry, content: undefined, append_content: undefined, turn_marker: undefined, managed_block: undefined, learning_current: undefined, learning_history: undefined, learning_marker: undefined, knowledge_evidence: undefined, outcome, absolute_path: absolutePath, transaction_id: transaction.id });
    }
    await appendAuditEvents(config, transaction.id, results);
    await completeWriteTransaction(transaction);
    return results;
  } catch (error) {
    const rollbackErrors = await rollbackWriteTransaction(transaction, config, error);
    throw new Error(`写入事务失败并已${rollbackErrors.length ? "部分" : "完整"}回滚：${error.message}`);
  }
}
