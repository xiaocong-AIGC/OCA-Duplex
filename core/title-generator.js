import { sanitizeFilename } from "./quality.js";

const FORBIDDEN_MAIN_TITLES = new Set(["方法总结", "知识系统", "总结", "方案", "内容", "笔记", "Codex 知识系统"]);
const GENERIC_SUFFIX = /(?:方法总结|知识总结|总结笔记|内容总结|知识系统|自动知识库|方案|笔记)$/i;

export function isResearchContent(text) {
  return /趋势|调研|比较火|爆款|共性|市场排行|热榜|research|trend|viral|popular/i.test(String(text ?? ""));
}

function normalizeTopic(value) {
  return sanitizeFilename(String(value ?? "")
    .replace(/^(?:请问|请|帮我|目前|当前|如何|怎么|有哪些|分析一下)\s*/i, "")
    .replace(/[？?！!。].*$/u, "")
    .replace(GENERIC_SUFFIX, "")
    .trim(), "", 24);
}

function topicFromText(text, projectName) {
  const value = String(text ?? "");
  const projectKey = String(projectName ?? "").normalize("NFKC").trim().toLowerCase();
  const firstMeaningful = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+|^[-*>\d.)\s]+/g, "").trim())
    .find((line) => line.length >= 4 && line.normalize("NFKC").toLowerCase() !== projectKey) ?? "";
  return normalizeTopic(firstMeaningful)
    || (projectName && !FORBIDDEN_MAIN_TITLES.has(projectName) ? normalizeTopic(projectName) : "")
    || "Codex 对话";
}

export function generateTitle({ kind, text, projectName = "", fallback = "" }) {
  const topic = topicFromText(text, projectName);
  let title;
  if (kind === "source") title = topic;
  else if (kind === "prompt") title = /(?:Prompt|提示词)$/i.test(topic) ? topic : `${Array.from(topic).slice(0, 21).join("")}提示词`;
  else if (kind === "digest") title = `${Array.from(topic).slice(0, 21).join("")} 整理`;
  else if (kind === "output") title = `${Array.from(topic).slice(0, 21).join("")} 方案`;
  else if (kind === "knowledge") title = isResearchContent(text)
    ? `${Array.from(topic).slice(0, 19).join("")} 调研结论`
    : `${Array.from(topic).slice(0, 19).join("")} 实践规则`;
  else title = topic;

  title = sanitizeFilename(title.trim(), fallback || "Codex 对话", 24);
  if (FORBIDDEN_MAIN_TITLES.has(title)) title = sanitizeFilename(`${projectName || "Codex"} 实践规则`, "Codex 实践规则", 24);
  return title;
}

export function isForbiddenMainTitle(title) {
  return FORBIDDEN_MAIN_TITLES.has(String(title ?? "").trim());
}
