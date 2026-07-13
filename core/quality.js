const SEMANTIC_TAG_RULES = [
  ["obsidian", /\bobsidian\b/i],
  ["codex", /\bcodex\b/i],
  ["自动知识库", /自动知识库|自动化知识库|automated knowledge base/i],
  ["vault", /\bvault\b/i],
  ["git", /\bgit\b/i],
  ["skill", /\bskill(?:s)?\b|技能规则/i],
  ["知识管理", /知识管理|知识库|knowledge management|knowledge base/i],
  ["项目管理", /项目管理|项目实施|project management/i],
  ["inbox", /\binbox\b/i],
  ["prompt", /\bprompt(?:s)?\b|提示词/i],
  ["mvp", /\bmvp\b|最小可运行版本/i]
];

const REUSABLE_PATTERN = /方法|流程|步骤|规则|架构|模式|机制|原则|工作流|策略|标准|约束|验收|项目|任务|实施|执行|管理|分类|自动化|迭代|回滚|安全|版本|提示词|知识库|prompt|skill|workflow|architecture|policy|process|method|rule|project|task|implementation/i;
const PROJECT_PATTERN = /项目|任务集合|目标|交付|实施|验收|下一步|待办|里程碑|最小可运行版本|\bmvp\b|project|deliverable|milestone|action items?/i;
const PROMPT_PATTERN = /\bprompt(?:s)?\b|提示词|\bskill(?:s)?\b|技能规则|输出契约|指令模板/i;
const KNOWLEDGE_PATTERN = /方法|流程|步骤|规则|架构|模式|机制|原则|工作流|策略|标准|约束|分类|自动化|迭代|回滚|安全|版本|知识管理|workflow|architecture|policy|process|method|rule|strategy/i;
const GUIDANCE_PATTERN = /\u65b9\u6cd5|\u6d41\u7a0b|\u6b65\u9aa4|\u89c4\u5219|\u67b6\u6784|\u6a21\u5f0f|\u673a\u5236|\u539f\u5219|\u5de5\u4f5c\u6d41|\u7b56\u7565|\u6807\u51c6|\u7ea6\u675f|\u9a8c\u6536|\u9879\u76ee|\u4efb\u52a1|\u5b9e\u65bd|\u6267\u884c|\u8fed\u4ee3|\u56de\u6eda|\u5b89\u5168|\u7248\u672c|prompt|skill|workflow|architecture|policy|process|method|rule/i;

export const QUALITY_PATTERNS = {
  reusable: REUSABLE_PATTERN,
  project: PROJECT_PATTERN,
  prompt: PROMPT_PATTERN,
  knowledge: KNOWLEDGE_PATTERN
};

function truncateCodePoints(value, maximum) {
  const characters = Array.from(value);
  return characters.length <= maximum ? value : characters.slice(0, maximum).join("");
}

export function sanitizeFilename(value, fallback = "Codex 知识总结", maximum = 30) {
  const cleaned = String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\s>*#+-]+/gm, "")
    .replace(/[│├└┌┐┬┴┼─━]+/g, " ")
    .replace(/[`*_~#]/g, "")
    .replace(/[\[\]{}()（）]/g, " ")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:：，。！!？?-]+|[\s,.;:：，。！!？?-]+$/g, "")
    .trim();
  const safeFallback = String(fallback).replace(/[<>:"/\\|?*`\x00-\x1f]/g, " ").trim() || "Codex 知识总结";
  return truncateCodePoints(cleaned || safeFallback, maximum);
}

export function buildSemanticTitle(kind, text) {
  const value = String(text ?? "");
  let topic = "Codex 知识系统";
  if (/oca[- ]?duplex/i.test(value)) topic = "OCA-Duplex";
  else if (/event[- ]sourced|事件溯源|事件驱动/i.test(value)) topic = "事件驱动知识系统";
  else if (/obsidian/i.test(value) && /inbox/i.test(value)) topic = "Obsidian Inbox";
  else if (/obsidian/i.test(value) && /codex/i.test(value)) topic = "Codex 驱动的 Obsidian 知识库";
  else if (/obsidian|\bvault\b/i.test(value)) topic = "Obsidian Vault";
  else if (/\binbox\b/i.test(value)) topic = "Inbox 知识流";
  else if (/\bcodex\b/i.test(value)) topic = "Codex 知识系统";
  else if (/知识库|知识管理/i.test(value)) topic = "自动知识库";

  const codexObsidian = /obsidian/i.test(value) && /codex/i.test(value);
  if (codexObsidian && kind === "source") return "Codex Obsidian \u77e5\u8bc6\u5e93";
  if (codexObsidian && kind === "project") return "Codex Obsidian \u77e5\u8bc6\u5e93\u9879\u76ee";
  if (codexObsidian && kind === "prompt") return "Codex Prompt \u4e0e Skill \u89c4\u5219";
  if (codexObsidian && kind === "knowledge") return "Obsidian Vault \u77e5\u8bc6\u7ba1\u7406\u65b9\u6cd5";
  if (kind === "source") return sanitizeFilename(topic, "Codex 对话记录");
  if (kind === "project") return sanitizeFilename(`${topic} 优化项目`, "知识系统实施项目");
  if (kind === "prompt") return sanitizeFilename(`${topic} Prompt 与 Skill 规则`, "Prompt 与 Skill 规则");
  if (topic === "Obsidian Vault") return "Obsidian Vault 知识管理方法";
  return sanitizeFilename(`${topic} 方法总结`, "知识管理方法总结");
}

export function semanticTags(text) {
  return SEMANTIC_TAG_RULES
    .filter(([, pattern]) => pattern.test(String(text ?? "")))
    .map(([tag]) => tag);
}

export function textMetrics(text) {
  const value = String(text ?? "");
  return {
    chinese_characters: (value.match(/[\p{Script=Han}]/gu) ?? []).length,
    english_words: (value.match(/\b[A-Za-z][A-Za-z0-9'-]*\b/g) ?? []).length
  };
}

export function meetsContentLength(text) {
  const metrics = textMetrics(text);
  return metrics.chinese_characters >= 80 || metrics.english_words >= 40;
}

export function isStructuralLine(line) {
  const value = String(line ?? "").trim();
  if (!value) return false;
  return /^```|^~~~/.test(value)
    || /^#{1,6}\s+/.test(value)
    || /^[│├└┌┐┬┴┼─━\s]+\S*/.test(value)
    || /^[A-Za-z]:[\\/](?:[^\\/]+[\\/])*[^\\/]*$/.test(value)
    || /^(?:\.\.?[\\/])?(?:[^\\/]+[\\/])+[^\\/]*$/.test(value)
    || /^[\w一-鿿 ._-]+\.(?:md|txt|jsonl?|ya?ml|js|ts|ps1|bat|py)$/i.test(value)
    || /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(value)
    || /mcpToolCall|status\s*=\s*failed|unknown MCP server|tool call failed|error\s*=/i.test(value);
}

export function isEnvironmentStatus(text) {
  const value = String(text ?? "").trim();
  return /^(?:\u53ea\u6709|\u5f53\u524d|\u76ee\u524d|\u73b0\u6709|\u5df2|\u672a|\u6ca1\u6709|\u4e0d\u5b58\u5728|\u5b58\u5728|RealClaudian|Vault \u5df2|Git \u5df2|There (?:is|are)|Current|Enabled|Disabled)/i.test(value)
    && !GUIDANCE_PATTERN.test(value);
}

export function hasReusableValue(text) {
  return REUSABLE_PATTERN.test(String(text ?? ""));
}

export function passesKnowledgeGate(unit) {
  return Boolean(
    unit
    && sanitizeFilename(unit.title, "").length >= 4
    && meetsContentLength(unit.text)
    && hasReusableValue(unit.text)
    && !isStructuralLine(unit.text)
    && !isEnvironmentStatus(unit.text)
  );
}
