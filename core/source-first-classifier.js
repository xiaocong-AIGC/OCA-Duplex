import { targetForTitle } from "../vault/path-map.js";
import { passesKnowledgeGate, sanitizeFilename } from "./quality.js";

const CONFIDENCE = {
  project: 0.9,
  knowledge: 0.9,
  prompt: 0.88,
  digest: 0.86,
  learning_summary: 0.86,
  output: 0.87
};

const REASONS = {
  project: "聚合自明确目标、交付要求或任务集合",
  knowledge: "聚合为可复用的方法、流程、规则或架构总结",
  prompt: "聚合为可复用的 Prompt、Skill 或指令规则",
  digest: "整轮回答包含实质建议、方向、步骤或结论，沉淀为内容整理",
  learning_summary: "同一任务的有效结论持续汇总到一份复盘总结",
  output: "整轮回答包含可直接使用的方案、清单、表格或执行建议，沉淀为项目产出"
};

const SUPPORTED_TYPES = new Set(["project", "knowledge", "prompt", "digest", "learning_summary", "output"]);
const CONTENT_TYPES = new Set(["digest", "learning_summary", "output"]);

export function classifyUnit(unit, config) {
  const type = SUPPORTED_TYPES.has(unit.type_hint) ? unit.type_hint : "knowledge";
  const confidence = CONFIDENCE[type];
  const fileName = `${sanitizeFilename(unit.title, unit.unit_id)}.md`;
  const minimum = config.classification.minimumWriteConfidence ?? 0.72;
  const qualityPassed = CONTENT_TYPES.has(type) ? Boolean(unit.substantive_value || unit.content_extraction) : passesKnowledgeGate(unit);
  return {
    ...unit,
    type,
    confidence,
    classification_reason: REASONS[type],
    recommended_target: targetForTitle(type, fileName, config),
    action: qualityPassed && confidence >= minimum ? "create" : "review",
    quality_gate_passed: qualityPassed,
    classifier: CONTENT_TYPES.has(type) ? "content-digest-heuristic-v1" : "source-first-heuristic-v2"
  };
}

export function classifyUnits(units, config) {
  return units.map((unit) => classifyUnit(unit, config));
}
