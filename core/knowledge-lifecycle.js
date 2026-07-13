import { semanticTags } from "./quality.js";

const SUPERSEDE_SIGNAL = /替代|取代|废弃|弃用|不再使用|以.+为准|supersede|deprecated|replace(?:d|ment)?/i;
const CONFLICT_SIGNAL = /与.{0,20}(?:旧|现有|既有).{0,10}冲突|相反|结论不一致|并非|不是|不能|禁止|改为|instead|contradict|must not|cannot/i;

function normalizedTitle(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-—–:：,.，。!?！？()（）[\]【】]+/g, "")
    .replace(/^(知识|knowledge)/, "");
}

function overlap(left, right) {
  const rightSet = new Set(right ?? []);
  return (left ?? []).filter((item) => rightSet.has(item));
}

function scoreCandidate(unit, note) {
  const unitTags = unit.tags ?? semanticTags(`${unit.title}\n${unit.text}`);
  const shared = overlap(unitTags, note.tags);
  const sameTitle = normalizedTitle(unit.title) === normalizedTitle(note.title);
  const sameThread = Boolean(note.source_thread_id && note.source_thread_id === unit.source_thread_id);
  return { note, shared, sameTitle, sameThread, score: shared.length + (sameTitle ? 4 : 0) + (sameThread ? 3 : 0) };
}

export function planKnowledgeOperation(unit, existingNotes = []) {
  if (unit.type !== "knowledge") return { operation: null, state: null, reason: null };
  const candidates = existingNotes
    .filter((note) => note.type === "knowledge" && note.status !== "archived")
    .map((note) => scoreCandidate(unit, note))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score || a.note.path.localeCompare(b.note.path));
  const best = candidates[0];
  if (!best) return { operation: "add", state: "candidate", reason: "没有找到足够相似的既有知识" };

  const evidence = `${unit.title}\n${unit.text}`;
  const base = {
    existing_target: best.note.path,
    existing_managed: best.note.oca_managed,
    similarity_score: best.score,
    shared_tags: best.shared
  };
  if (SUPERSEDE_SIGNAL.test(evidence)) {
    return { ...base, operation: "supersede", state: "candidate", reason: "新内容明确表示替代或弃用既有知识" };
  }
  if (CONFLICT_SIGNAL.test(evidence) && !best.sameThread) {
    return { ...base, operation: "conflict", state: "candidate", reason: "新内容与相似的既有知识可能冲突，需要人工确认" };
  }
  if (best.sameThread || best.sameTitle) {
    return { ...base, operation: "update", state: best.note.status ?? "candidate", reason: "来自同一任务或标题完全一致" };
  }
  if (best.score >= 3) {
    return { ...base, operation: "merge", state: best.note.status ?? "candidate", reason: "多个语义标签重合，适合合并为同一知识主题" };
  }
  return { ...base, operation: "add", state: "candidate", reason: "只有弱关联，保留为独立候选知识" };
}

export function planKnowledgeOperations(units, existingNotes = []) {
  return units.map((unit) => unit.type === "knowledge"
    ? { ...unit, knowledge_lifecycle: planKnowledgeOperation(unit, existingNotes) }
    : unit);
}
