import { generateTitle } from "./title-generator.js";
import { sanitizeFilename, semanticTags, textMetrics } from "./quality.js";
import { stableId } from "./text.js";

const CONTENT_SIGNAL = /建议|方案|步骤|清单|示例|方向|选题|方法|流程|策略|优先|可以做|适合|账号定位|爆款|脚本|分镜|连续更新|角色设定|内容方向|可直接使用|recommend|strategy|plan|steps|checklist|example|script|workflow/i;
const OUTPUT_SIGNAL = /方案|清单|表格|可直接使用|推荐优先级|优先方向|执行建议|方向|选题|账号建议|脚本|文案|计划|deliverable|output|checklist|table|script/i;
const TOOL_NOISE = /mcpToolCall|status\s*=\s*failed|unknown MCP server|tool call failed|error\s*=|server=.*tool=|Traceback|ENOENT|EACCES/i;

function normalizeText(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

export function isToolNoiseLine(line) {
  const value = String(line ?? "").trim();
  return TOOL_NOISE.test(value) || /^```|^~~~/.test(value);
}

function isLowValueLine(line) {
  const value = String(line ?? "").trim();
  if (!value) return false;
  return /^#{1,6}\s+/.test(value)
    || /^[│├└┌┐┬┴┼─━\s]+\S*/.test(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^[\w一-鿿 ._-]+\.(?:md|txt|jsonl?|ya?ml|js|ts|ps1|bat|py)$/i.test(value)
    || /^(?:只有欢迎页|RealClaudian 已|Vault 已初始化 Git|Git 已|当前 Vault 为空|没有既有分类体系)/i.test(value);
}
export function stripToolNoise(text) {
  return normalizeText(text)
    .split("\n")
    .filter((line) => !isToolNoiseLine(line) && !isLowValueLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assistantResponseText(snapshot) {
  const nodes = snapshot?.conversation_nodes ?? [];
  const finals = nodes.filter((node) => node.role === "assistant" && node.kind === "message" && node.phase === "final_answer");
  const fallback = finals.length > 0
    ? finals
    : nodes.filter((node) => node.role === "assistant" && node.kind === "message" && node.phase !== "commentary");
  return stripToolNoise(fallback.map((node) => node.text ?? "").join("\n\n"));
}

export function sourceReadableText(markdown) {
  return stripToolNoise(
    normalizeText(markdown)
      .replace(/^---[\s\S]*?---\s*/m, "")
      .replace(/<!--\s*oca-turn:[^>]+-->/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^####?\s*(User|Codex|Tool Results)\s*$/gim, "")
  );
}

export function hasSubstantiveContent(text, projectName = "") {
  const cleaned = stripToolNoise(text);
  if (!cleaned) return false;
  const metrics = textMetrics(cleaned);
  const longEnough = metrics.chinese_characters >= 200 || metrics.english_words >= 80;
  const conciseButStructured = metrics.chinese_characters >= 100 && CONTENT_SIGNAL.test(cleaned);
  return (longEnough || conciseButStructured) && CONTENT_SIGNAL.test(cleaned);
}

function listSignalCount(text) {
  const bulletCount = (text.match(/^\s*(?:[-*+]|\d+[.)、])\s+\S/gm) ?? []).length;
  const tableCount = (text.match(/^\s*\|.*\|\s*$/gm) ?? []).length;
  const directionCount = (text.match(/方向|选题|账号|适合|建议|优先|可以做/g) ?? []).length;
  return { bulletCount, tableCount, directionCount };
}

export function shouldCreateDigest(text, projectName = "") {
  return hasSubstantiveContent(text, projectName);
}

export function shouldCreateLearningSummary(text, projectName = "") {
  return shouldCreateDigest(text, projectName);
}

export function shouldCreateOutput(text, projectName = "") {
  const cleaned = stripToolNoise(text);
  if (!hasSubstantiveContent(cleaned, projectName)) return false;
  const signals = listSignalCount(cleaned);
  return OUTPUT_SIGNAL.test(cleaned) && (signals.bulletCount >= 3 || signals.tableCount >= 2 || signals.directionCount >= 4);
}

function cleanItem(value, maximum = 140) {
  const cleaned = String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)、])\s+/, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, maximum).join("");
}

export function contentBullets(text, { max = 8, minLength = 10 } = {}) {
  const cleaned = stripToolNoise(text);
  const explicit = cleaned
    .split("\n")
    .map((line) => cleanItem(line))
    .filter((line) => line.length >= minLength && !/^\|/.test(line));
  const sentenceLike = cleaned
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .split(/(?:\n{2,})|(?<=[。！？!?])/u)
    .map((line) => cleanItem(line))
    .filter((line) => line.length >= minLength);
  const seen = new Set();
  return [...explicit, ...sentenceLike]
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

export function directUseItems(text, projectName = "") {
  return contentBullets(text, { max: 6, minLength: 14 });
}

export function outputTableRows(text, projectName = "") {
  const tableRows = normalizeText(text).split("\n")
    .filter((line) => /^\s*\|.*\|\s*$/.test(line) && !/^\s*\|?\s*:?-{2,}/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cleanItem(cell, 80)))
    .filter((cells) => cells.length >= 3);
  if (tableRows.length > 1) return tableRows.slice(1, 7).map((row) => [row[0], row[1], row[2], row[3] ?? "按项目上下文执行"]);
  return contentBullets(text, { max: 5, minLength: 12 }).map((item, index) => [`方向 ${index + 1}`, item, "需要真实反馈验证", "拆成小步测试"]);
}

export function followUpQuestions(text, projectName = "") {
  return [
    "这轮内容中哪些结论已经经过真实执行验证？",
    "哪些部分可以进一步拆成可直接使用的清单或模板？",
    "下一次同步时需要补充哪些来源、数据或验收标准？"
  ];
}

export function extractContentUnits({ snapshot = null, text = "", projectName = "", title = "" }) {
  const body = stripToolNoise(text || assistantResponseText(snapshot));
  if (!shouldCreateDigest(body, projectName)) return [];
  const threadId = snapshot?.thread?.id ?? "source";
  const turnId = snapshot?.turn?.id ?? "backfill";
  const context = `${projectName}\n${title}\n${body}`;
  const digestTitle = generateTitle({ kind: "digest", text: context, projectName, fallback: `${projectName} 学习总结` });
  const common = {
    category: "content_digest",
    tags: semanticTags(`${projectName}\n${body}`),
    source_node_ids: snapshot?.conversation_nodes?.filter((node) => node.role === "assistant").map((node) => node.id).filter(Boolean) ?? [],
    source_thread_id: threadId,
    source_turn_id: turnId,
    reusable_value: true,
    substantive_value: true,
    content_extraction: true
  };
  const units = [{
    ...common,
    unit_id: `LS-${stableId(threadId, "learning-summary")}`,
    type_hint: "learning_summary",
    artifact_action: "upsert",
    title: digestTitle,
    text: body
  }];
  if (shouldCreateOutput(body, projectName)) {
    const outputTitle = generateTitle({ kind: "output", text: context, projectName, fallback: `${projectName} 内容方案` });
    units.push({
      ...common,
      unit_id: `KU-${stableId(threadId, turnId, "output", sanitizeFilename(outputTitle, "output"))}`,
      type_hint: "output",
      category: "structured_output",
      title: outputTitle,
      text: body
    });
  }
  return units;
}
