import { createHash } from "node:crypto";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "only", "must",
  "一个", "我们", "你们", "可以", "需要", "进行", "当前", "系统", "要求", "以及", "如果", "不要"
]);

export function stableId(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u241f"))
    .digest("hex")
    .slice(0, 16);
}

export function truncate(text, max = 120) {
  const value = String(text ?? "").trim();
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function sanitizeTitle(value, fallback = "Untitled") {
  const title = String(value ?? "")
    .replace(/^#+\s*/, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return truncate(title || fallback, 80);
}

export function splitSentences(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?；;])\s*|\n+/u)
    .map((line) => line.replace(/^[-*+>\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 4);
}

export function tokenize(text) {
  const value = String(text ?? "").toLowerCase();
  const english = value.match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
  const chineseRuns = value.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const chinese = [];
  for (const run of chineseRuns) {
    if (run.length <= 4) chinese.push(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      chinese.push(run.slice(index, index + 2));
    }
  }
  return [...new Set([...english, ...chinese].filter((token) => !STOP_WORDS.has(token)))];
}

export function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function isoFromUnix(value) {
  if (!Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}
